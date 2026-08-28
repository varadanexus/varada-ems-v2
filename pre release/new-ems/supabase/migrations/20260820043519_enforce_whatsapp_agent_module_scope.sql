-- Agents operate through the scoped messaging API. Remove direct write access
-- to administrative workspace records and limit member-directory reads to the
-- current user unless the signed-in membership is an owner or administrator.

create or replace function public.current_whatsapp_platform_role_code()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select u.role_code
  from public.whatsapp_platform_users u
  where u.auth_user_id = (select auth.uid())
    and u.tenant_id = public.current_whatsapp_platform_tenant_id()
    and u.status = 'active'
  limit 1
$$;

revoke all on function public.current_whatsapp_platform_role_code() from public, anon;
grant execute on function public.current_whatsapp_platform_role_code() to authenticated;

revoke update on table public.whatsapp_platform_tenants from authenticated;
revoke update on table public.whatsapp_platform_users from authenticated;
revoke insert, update, delete on table public.whatsapp_platform_connections from authenticated;

drop policy if exists whatsapp_platform_tenant_update on public.whatsapp_platform_tenants;
drop policy if exists whatsapp_platform_user_read on public.whatsapp_platform_users;
drop policy if exists whatsapp_platform_user_update_self on public.whatsapp_platform_users;
drop policy if exists whatsapp_platform_connection_access on public.whatsapp_platform_connections;

create policy whatsapp_platform_user_read on public.whatsapp_platform_users
  for select to authenticated
  using (
    tenant_id = public.current_whatsapp_platform_tenant_id()
    and (
      auth_user_id = (select auth.uid())
      or public.current_whatsapp_platform_role_code() in ('owner', 'admin')
    )
  );

create policy whatsapp_platform_connection_read on public.whatsapp_platform_connections
  for select to authenticated
  using (tenant_id = public.current_whatsapp_platform_tenant_id());
