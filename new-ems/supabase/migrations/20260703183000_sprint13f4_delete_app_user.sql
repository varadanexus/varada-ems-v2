-- Sprint 13F.4: admin_delete_app_user — delete an EMS staff account.
--
-- Super-admin only. Protects the super admin and Supabase-backed accounts
-- (deleting a GoTrue-linked user here would orphan the auth.users row) and the
-- caller's own account. Attempts a hard delete (cascades user_roles,
-- user_divisions, app_user_sessions); if the user has authored business records
-- that block deletion via restrictive foreign keys, it falls back to a soft
-- delete (disabled + locked + deleted_at) so the action never fails and no
-- audit/business history is destroyed.
--
-- Returns 'deleted' (hard) or 'soft_deleted' (fallback).

create or replace function public.admin_delete_app_user(p_app_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public.current_app_user_id();
  v_target record;
  v_is_super boolean;
  v_outcome text;
begin
  if not public.is_super_admin() then
    raise exception 'Only super_admin can delete users';
  end if;

  select id, email, auth_provider, deleted_at into v_target
  from public.app_users where id = p_app_user_id;

  if v_target.id is null then
    raise exception 'User not found';
  end if;
  if v_target.id = v_actor then
    raise exception 'You cannot delete your own account';
  end if;
  if v_target.auth_provider = 'supabase' then
    raise exception 'Supabase-backed accounts (e.g. the super admin) cannot be deleted here';
  end if;

  select exists (
    select 1 from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = p_app_user_id and r.code = 'super_admin'
  ) into v_is_super;
  if v_is_super then
    raise exception 'Super admin accounts cannot be deleted';
  end if;

  -- Revoke any live sessions first.
  update public.app_user_sessions set revoked_at = now()
  where app_user_id = p_app_user_id and revoked_at is null;

  begin
    delete from public.app_users where id = p_app_user_id;
    v_outcome := 'deleted';
  exception when foreign_key_violation then
    -- User has authored records that block a hard delete — soft delete instead.
    update public.app_users
    set status = 'disabled', is_locked = true, deleted_at = now(), updated_at = now()
    where id = p_app_user_id;
    v_outcome := 'soft_deleted';
  end;

  insert into public.audit_logs (event_type, module_code, actor_app_user_id, entity_type, entity_id, details)
  values ('user_deleted', 'users', v_actor, 'app_users', p_app_user_id::text,
          jsonb_build_object('email', v_target.email, 'outcome', v_outcome));

  return v_outcome;
end;
$$;
grant execute on function public.admin_delete_app_user(uuid) to authenticated;
