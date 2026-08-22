-- One-way, service-only reset for a fully cancelled test workspace before the
-- WhatsApp Platform is switched to live commerce. Global Package Master,
-- coupons, provider settings and central document sequences are untouched.

create or replace function public.whatsapp_platform_purge_test_tenant(
  p_tenant_id uuid,
  p_expected_slug text,
  p_expected_owner_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant public.whatsapp_platform_tenants;
  v_subscription_count integer;
  v_payment_count integer;
  v_invoice_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Test tenant purge is server-only' using errcode = '42501';
  end if;

  select * into v_tenant
  from public.whatsapp_platform_tenants
  where id = p_tenant_id
  for update;

  if not found
     or v_tenant.slug <> trim(p_expected_slug)
     or lower(v_tenant.owner_email) <> lower(trim(p_expected_owner_email)) then
    raise exception 'Tenant identity guard failed.';
  end if;

  if exists (
    select 1
    from public.whatsapp_platform_billing_subscriptions
    where tenant_id = p_tenant_id
      and coalesce(safe_metadata->>'mode', 'test') <> 'test'
  ) or exists (
    select 1
    from public.whatsapp_platform_billing_invoices
    where tenant_id = p_tenant_id and document_environment <> 'test'
  ) or exists (
    select 1
    from public.whatsapp_platform_billing_credit_notes
    where tenant_id = p_tenant_id and document_environment <> 'test'
  ) then
    raise exception 'Live financial data cannot be removed by the test reset.';
  end if;

  if exists (
    select 1
    from public.whatsapp_platform_billing_subscriptions
    where tenant_id = p_tenant_id
      and status not in ('cancelled', 'completed', 'expired')
  ) then
    raise exception 'Every provider subscription must be terminal before reset.';
  end if;

  select count(*) into v_subscription_count from public.whatsapp_platform_billing_subscriptions where tenant_id = p_tenant_id;
  select count(*) into v_payment_count from public.whatsapp_platform_billing_payments where tenant_id = p_tenant_id;
  select count(*) into v_invoice_count from public.whatsapp_platform_billing_invoices where tenant_id = p_tenant_id;

  -- Remove restrictive financial evidence from the leaves inward. Tenant-owned
  -- operational rows then disappear through their existing cascade contracts.
  delete from public.whatsapp_platform_billing_refund_requests where tenant_id = p_tenant_id;
  delete from public.whatsapp_platform_billing_credit_notes where tenant_id = p_tenant_id;
  delete from public.whatsapp_platform_billing_refunds where tenant_id = p_tenant_id;
  delete from public.whatsapp_platform_billing_invoices where tenant_id = p_tenant_id;
  delete from public.whatsapp_platform_billing_action_audit where tenant_id = p_tenant_id;
  delete from public.whatsapp_platform_billing_checkout_quotes where tenant_id = p_tenant_id;
  delete from public.whatsapp_platform_billing_coupon_redemptions where tenant_id = p_tenant_id;

  delete from public.whatsapp_platform_tenants where id = p_tenant_id;
  if not found then raise exception 'Tenant reset did not complete.'; end if;

  return jsonb_build_object(
    'tenantId', p_tenant_id,
    'subscriptionsRemoved', v_subscription_count,
    'paymentsRemoved', v_payment_count,
    'invoicesRemoved', v_invoice_count
  );
end;
$$;

revoke all on function public.whatsapp_platform_purge_test_tenant(uuid,text,text) from public, anon, authenticated;
grant execute on function public.whatsapp_platform_purge_test_tenant(uuid,text,text) to service_role;

comment on function public.whatsapp_platform_purge_test_tenant(uuid,text,text) is
  'Guarded service-only deletion of a fully cancelled test tenant; rejects any live financial evidence.';
