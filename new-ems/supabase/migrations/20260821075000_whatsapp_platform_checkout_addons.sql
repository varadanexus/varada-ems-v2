-- Self-service add-ons may be selected with an initial subscription checkout.
-- The quote stores immutable Package Master price revisions and the tenant
-- assignment remains pending until Razorpay authorizes the subscription.

alter table public.whatsapp_platform_billing_checkout_quotes
  add column if not exists addon_selections jsonb not null default '[]'::jsonb
    check (jsonb_typeof(addon_selections)='array');

alter table public.whatsapp_platform_tenant_addons
  add column if not exists source_checkout_quote_id uuid
    references public.whatsapp_platform_billing_checkout_quotes(id) on delete set null,
  add column if not exists source_subscription_id uuid
    references public.whatsapp_platform_billing_subscriptions(id) on delete set null;

create index if not exists whatsapp_platform_tenant_addons_checkout_quote_idx
  on public.whatsapp_platform_tenant_addons(source_checkout_quote_id)
  where source_checkout_quote_id is not null;
create index if not exists whatsapp_platform_tenant_addons_subscription_idx
  on public.whatsapp_platform_tenant_addons(source_subscription_id)
  where source_subscription_id is not null;

comment on column public.whatsapp_platform_billing_checkout_quotes.addon_selections is
  'Immutable self-service add-on code, quantity, unit base price, GST and price revision snapshots included in this checkout.';
comment on column public.whatsapp_platform_tenant_addons.source_subscription_id is
  'Provider-authorized subscription that controls activation and suspension of this self-service add-on.';

notify pgrst, 'reload schema';
