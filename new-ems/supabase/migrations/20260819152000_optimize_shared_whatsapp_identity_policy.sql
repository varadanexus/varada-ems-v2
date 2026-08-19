-- Cache auth.uid() once per statement inside the self-update policy.
drop policy if exists whatsapp_platform_user_update_self on public.whatsapp_platform_users;
create policy whatsapp_platform_user_update_self on public.whatsapp_platform_users
  for update to authenticated
  using (
    auth_user_id = (select auth.uid())
    and tenant_id = public.current_whatsapp_platform_tenant_id()
  )
  with check (
    auth_user_id = (select auth.uid())
    and tenant_id = public.current_whatsapp_platform_tenant_id()
  );
