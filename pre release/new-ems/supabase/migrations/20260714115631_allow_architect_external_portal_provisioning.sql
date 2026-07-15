-- Allow the dedicated Interiors Architect portal identity to be provisioned
-- through the existing centrally-audited Portal Access workflow.

create or replace function public.external_portal_provision_user(
  p_user_type text,
  p_username text,
  p_initial_password text,
  p_display_name text,
  p_email text default null,
  p_phone text default null,
  p_source_module text default null,
  p_access_scope text default null,
  p_record_type text default null,
  p_record_id uuid default null,
  p_expires_at timestamptz default null,
  p_notes text default null,
  p_access_level text default 'standard'
)
returns uuid
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  v_actor_app_user_id uuid := public.current_app_user_id();
  v_portal_user_id uuid;
  v_key text := public.get_portal_vault_key();
  v_portal_user_code text;
begin
  if not public.has_permission('portal-management', 'create') then
    raise exception 'Not authorized to provision portal users';
  end if;
  if p_user_type not in ('vendor', 'agent', 'contractor', 'employee', 'partner', 'architect') then
    raise exception 'Invalid user_type for external portal user';
  end if;
  if p_initial_password is null or length(p_initial_password) < 8 then
    raise exception 'Initial password must be at least 8 characters';
  end if;

  v_portal_user_code := public.next_portal_user_code(
    'external_portal_users',
    case lower(coalesce(p_user_type, ''))
      when 'vendor' then 'PRT-VEN'
      when 'agent' then 'PRT-AGN'
      when 'contractor' then 'PRT-CON'
      when 'employee' then 'PRT-EMP'
      when 'partner' then 'PRT-PRT'
      when 'architect' then 'PRT-ARC'
      else 'PRT-EXT'
    end
  );

  insert into public.external_portal_users (
    portal_user_code, user_type, username, email, phone, password_hash, display_name, notes, created_by,
    encrypted_password_vault, password_changed_at, password_set_by
  )
  values (
    v_portal_user_code, p_user_type, p_username, p_email, p_phone, crypt(p_initial_password, gen_salt('bf')), p_display_name, p_notes, v_actor_app_user_id,
    pgp_sym_encrypt(p_initial_password, v_key), now(), v_actor_app_user_id
  )
  returning id into v_portal_user_id;

  if p_record_type is not null and p_record_id is not null then
    insert into public.external_portal_access (portal_user_id, source_module, access_scope, record_type, record_id, granted_by, expires_at, notes, access_level)
    values (v_portal_user_id, coalesce(p_source_module, p_user_type), coalesce(p_access_scope, p_user_type || '_portal'), p_record_type, p_record_id, v_actor_app_user_id, p_expires_at, p_notes, coalesce(p_access_level, 'standard'));
  end if;

  perform public.log_external_portal_audit_event(v_portal_user_id, 'provisioned', jsonb_build_object('actor', v_actor_app_user_id, 'user_type', p_user_type));

  return v_portal_user_id;
end;
$$;

revoke all on function public.external_portal_provision_user(text, text, text, text, text, text, text, text, text, uuid, timestamptz, text, text) from public, anon;
grant execute on function public.external_portal_provision_user(text, text, text, text, text, text, text, text, text, uuid, timestamptz, text, text) to authenticated;
