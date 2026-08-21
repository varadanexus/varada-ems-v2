-- Prevent an authenticated customer from bypassing the Edge API entitlement
-- gate by querying business-number connection records through PostgREST.

create or replace function public.current_whatsapp_platform_billing_entitled()
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1
    from public.whatsapp_platform_users u
    join public.whatsapp_platform_tenants t on t.id=u.tenant_id
    where u.auth_user_id=(select auth.uid())
      and u.status='active'
      and t.status='active'
      and (
        exists(
          select 1
          from public.whatsapp_platform_billing_subscriptions s
          where s.tenant_id=u.tenant_id
            and s.status='active'
            and (s.current_end is null or s.current_end>now())
        )
        or exists(
          select 1
          from public.whatsapp_platform_billing_subscriptions s
          where s.tenant_id=u.tenant_id
            and s.status='authenticated'
            and coalesce(s.safe_metadata->>'trial_days','') ~ '^[1-9][0-9]{0,2}$'
            and s.charge_at>now()
            and (
              s.checkout_verified_at is not null
              or exists(
                select 1
                from public.whatsapp_platform_billing_checkout_quotes q
                where q.subscription_id=s.id and q.status='consumed'
              )
            )
        )
      )
  )
$$;

revoke all on function public.current_whatsapp_platform_billing_entitled() from public,anon;
grant execute on function public.current_whatsapp_platform_billing_entitled() to authenticated,service_role;

drop policy if exists whatsapp_platform_connection_access on public.whatsapp_platform_connections;
drop policy if exists whatsapp_platform_connection_read on public.whatsapp_platform_connections;
create policy whatsapp_platform_connection_read on public.whatsapp_platform_connections
  for select to authenticated
  using (
    tenant_id=public.current_whatsapp_platform_tenant_id()
    and public.current_whatsapp_platform_billing_entitled()
  );

comment on function public.current_whatsapp_platform_billing_entitled() is
  'Payment-aware RLS predicate scoped to the current WhatsApp workspace identity.';

notify pgrst, 'reload schema';
