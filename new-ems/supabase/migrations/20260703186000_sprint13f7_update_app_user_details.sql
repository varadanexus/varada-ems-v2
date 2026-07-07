-- Sprint 13F.7: admin_update_app_user_details — edit a staff account's identity.
--
-- Super-admin only. Updates email / username / phone / display name for LOCAL
-- accounts. For Supabase-backed accounts (the super admin) only the display name
-- is changed here, because email/username/phone drive Supabase Auth login and
-- must be managed through Supabase Auth, not this table.

create or replace function public.admin_update_app_user_details(
  p_app_user_id  uuid,
  p_email        text,
  p_username     text,
  p_phone        text,
  p_display_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_provider text;
begin
  if not public.is_super_admin() then
    raise exception 'Only super_admin can edit users';
  end if;

  select auth_provider into v_provider
  from public.app_users where id = p_app_user_id and deleted_at is null;
  if v_provider is null then
    raise exception 'User not found';
  end if;

  if v_provider = 'supabase' then
    -- Only the display name is safe to change here for Supabase-backed accounts.
    update public.app_users
    set display_name = nullif(trim(p_display_name), ''), updated_at = now()
    where id = p_app_user_id;
    return;
  end if;

  update public.app_users
  set email        = coalesce(nullif(trim(p_email), ''), email),
      username     = nullif(trim(p_username), ''),
      phone        = nullif(trim(p_phone), ''),
      display_name = nullif(trim(p_display_name), ''),
      updated_at   = now()
  where id = p_app_user_id;

  insert into public.audit_logs (event_type, module_code, actor_app_user_id, entity_type, entity_id, details)
  values ('user_updated', 'users', public.current_app_user_id(), 'app_users', p_app_user_id::text,
          jsonb_build_object('email', nullif(trim(p_email), '')));
end;
$$;
grant execute on function public.admin_update_app_user_details(uuid, text, text, text, text) to authenticated;
