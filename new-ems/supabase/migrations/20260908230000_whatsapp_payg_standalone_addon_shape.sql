-- Explicit opt-in shape for future standalone PAYG capacity subscriptions.
-- Does not create/cancel a provider subscription or change any capacity grants.
alter table public.whatsapp_platform_billing_subscriptions
  add column payg_standalone boolean not null default false;
alter table public.whatsapp_platform_billing_subscriptions
  drop constraint whatsapp_platform_billing_subscriptions_addon_shape_check,
  add constraint whatsapp_platform_billing_subscriptions_addon_shape_check check (
    (subscription_kind='package' and not payg_standalone and addon_code is null and addon_quantity is null and parent_subscription_id is null)
    or
    (subscription_kind='addon' and addon_code is not null and addon_quantity is not null and addon_quantity>0
      and ((not payg_standalone and parent_subscription_id is not null)
        or (payg_standalone and parent_subscription_id is null and addon_code in ('extra_agent_seat','extra_whatsapp_number','extra_integration'))))
  );
comment on column public.whatsapp_platform_billing_subscriptions.payg_standalone is
  'Explicit standalone capacity subscription for PAYG. Legacy parent-bound records retain false. Creation requires verified PAYG eligibility and captured-payment grant handling.';
notify pgrst,'reload schema';
