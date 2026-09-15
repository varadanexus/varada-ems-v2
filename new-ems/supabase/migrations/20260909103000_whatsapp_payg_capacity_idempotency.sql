-- Prevent two simultaneous customer clicks from creating duplicate provider
-- subscriptions for the same PAYG capacity purchase request.
create unique index if not exists whatsapp_payg_capacity_request_uidx
  on public.whatsapp_platform_billing_subscriptions(
    tenant_id,
    (safe_metadata ->> 'mode'),
    (safe_metadata ->> 'payg_request_key')
  )
  where payg_standalone = true
    and safe_metadata ? 'payg_request_key';
