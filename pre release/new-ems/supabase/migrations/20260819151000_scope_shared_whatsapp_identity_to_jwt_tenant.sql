-- A linked WhatsApp customer identity can belong to more than one tenant.
-- Resolve RLS scope from the tenant embedded in the signed portal JWT, then
-- verify that the JWT subject has an active membership in that tenant.
create or replace function public.current_whatsapp_platform_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.tenant_id
  from public.whatsapp_platform_users u
  where auth.uid() is not null
    and u.auth_user_id = auth.uid()
    and u.status = 'active'
    and u.tenant_id = nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid
  limit 1
$$;

revoke all on function public.current_whatsapp_platform_tenant_id() from public, anon;
grant execute on function public.current_whatsapp_platform_tenant_id() to authenticated;

drop policy if exists whatsapp_platform_user_update_self on public.whatsapp_platform_users;
create policy whatsapp_platform_user_update_self on public.whatsapp_platform_users
  for update to authenticated
  using (
    auth_user_id = auth.uid()
    and tenant_id = public.current_whatsapp_platform_tenant_id()
  )
  with check (
    auth_user_id = auth.uid()
    and tenant_id = public.current_whatsapp_platform_tenant_id()
  );
