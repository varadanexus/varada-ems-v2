-- Quantity-based capacity is a recurring entitlement, never a one-time sale.
-- Fixed-scope services may remain recurring, contact-sales or one-time.

update public.whatsapp_platform_addon_master
set quantity_enabled=false,
    minimum_quantity=1,
    maximum_quantity=1,
    quantity_step=1,
    updated_at=now()
where code='custom_integration';

update public.whatsapp_platform_addon_master
set billing_model='recurring',
    billing_interval=case when billing_interval in ('month','year') then billing_interval else 'month' end,
    updated_at=now()
where quantity_enabled=true
  and billing_model<>'recurring';

alter table public.whatsapp_platform_addon_master
  drop constraint if exists whatsapp_platform_addon_master_quantity_recurring_check;
alter table public.whatsapp_platform_addon_master
  add constraint whatsapp_platform_addon_master_quantity_recurring_check
  check (not quantity_enabled or billing_model='recurring');

comment on constraint whatsapp_platform_addon_master_quantity_recurring_check on public.whatsapp_platform_addon_master is
  'Any add-on with a customer-selectable count is a recurring subscription entitlement.';

notify pgrst, 'reload schema';
