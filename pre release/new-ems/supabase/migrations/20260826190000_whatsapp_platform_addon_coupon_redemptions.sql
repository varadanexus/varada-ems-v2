-- Extend the existing coupon authority to add-on checkout without creating a
-- second coupon source of truth. Add-on applicability is carried in the quote
-- snapshot and is enforced before a redemption is reserved.

alter table public.whatsapp_platform_billing_addon_change_intents
  add column if not exists coupon_id uuid references public.whatsapp_platform_billing_coupons(id) on delete restrict,
  add column if not exists coupon_redemption_id uuid references public.whatsapp_platform_billing_coupon_redemptions(id) on delete restrict,
  add column if not exists coupon_code text,
  add column if not exists discount_paise bigint not null default 0 check (discount_paise >= 0),
  add column if not exists recurring_discount_paise bigint not null default 0 check (recurring_discount_paise >= 0);

create or replace function public.whatsapp_platform_reserve_billing_coupon(
  p_tenant_id uuid,
  p_coupon_code text,
  p_package_code text,
  p_billing_interval text,
  p_package_price_version_id uuid,
  p_subtotal_paise bigint,
  p_quote_snapshot jsonb default '{}'::jsonb
)
returns public.whatsapp_platform_billing_coupon_redemptions
language plpgsql security definer set search_path=public as $$
declare
  v_coupon public.whatsapp_platform_billing_coupons;
  v_discount bigint;
  v_total_count bigint;
  v_tenant_count bigint;
  v_prior_payments bigint;
  v_result public.whatsapp_platform_billing_coupon_redemptions;
  v_addon_code text := nullif(trim(coalesce(p_quote_snapshot->>'addon_code','')), '');
begin
  if auth.role()<>'service_role' then raise exception 'Coupon reservation is server-only' using errcode='42501'; end if;
  if p_subtotal_paise<1 then raise exception 'Checkout subtotal is invalid.'; end if;
  select * into v_coupon from public.whatsapp_platform_billing_coupons
    where code=upper(trim(p_coupon_code)) for update;
  if not found or v_coupon.status<>'active' then raise exception 'Coupon code is invalid or inactive.'; end if;
  if now()<v_coupon.valid_from or (v_coupon.valid_until is not null and now()>=v_coupon.valid_until) then raise exception 'Coupon code is outside its validity period.'; end if;
  if v_coupon.currency<>(select currency from public.whatsapp_platform_package_price_versions where id=p_package_price_version_id) then raise exception 'Coupon currency does not match this checkout.'; end if;
  if p_subtotal_paise<v_coupon.minimum_subtotal_paise then raise exception 'This checkout does not meet the coupon minimum amount.'; end if;
  if not (v_coupon.billing_intervals ? p_billing_interval) then raise exception 'Coupon is not valid for this billing interval.'; end if;
  if jsonb_array_length(v_coupon.applies_to_package_codes)>0 and not (v_coupon.applies_to_package_codes ? p_package_code) then raise exception 'Coupon is not valid for this package.'; end if;
  if v_addon_code is not null and jsonb_array_length(v_coupon.applies_to_addon_codes)>0 and not (v_coupon.applies_to_addon_codes ? v_addon_code) then raise exception 'Coupon is not valid for this add-on.'; end if;
  if v_coupon.first_payment_only then
    select count(*) into v_prior_payments from public.whatsapp_platform_billing_payments where tenant_id=p_tenant_id and captured=true;
    if v_prior_payments>0 then raise exception 'Coupon is limited to a customer''s first successful payment.'; end if;
  end if;

  update public.whatsapp_platform_billing_coupon_redemptions
    set status='released',released_at=now(),updated_at=now()
    where coupon_id=v_coupon.id and tenant_id=p_tenant_id and status='reserved';

  select count(*) into v_total_count from public.whatsapp_platform_billing_coupon_redemptions
    where coupon_id=v_coupon.id and (status in ('applied','refunded') or (status='reserved' and reservation_expires_at>now()));
  if v_coupon.maximum_redemptions is not null and v_total_count>=v_coupon.maximum_redemptions then raise exception 'Coupon redemption limit has been reached.'; end if;
  select count(*) into v_tenant_count from public.whatsapp_platform_billing_coupon_redemptions
    where coupon_id=v_coupon.id and tenant_id=p_tenant_id and (status in ('applied','refunded') or (status='reserved' and reservation_expires_at>now()));
  if v_tenant_count>=v_coupon.maximum_redemptions_per_tenant then raise exception 'Coupon has already been used by this customer.'; end if;

  v_discount:=case when v_coupon.discount_type='percentage'
    then floor(p_subtotal_paise*v_coupon.percentage_bps/10000.0)::bigint
    else v_coupon.fixed_amount_paise end;
  if v_coupon.max_discount_paise is not null then v_discount:=least(v_discount,v_coupon.max_discount_paise); end if;
  v_discount:=least(v_discount,p_subtotal_paise-1);
  if v_discount<1 then raise exception 'Coupon does not produce a valid discount.'; end if;

  insert into public.whatsapp_platform_billing_coupon_redemptions
    (coupon_id,tenant_id,status,coupon_code,discount_type,percentage_bps,fixed_amount_paise,subtotal_paise,discount_paise,currency,package_code,billing_interval,package_price_version_id,quote_snapshot,reservation_expires_at)
  values
    (v_coupon.id,p_tenant_id,'reserved',v_coupon.code,v_coupon.discount_type,v_coupon.percentage_bps,v_coupon.fixed_amount_paise,p_subtotal_paise,v_discount,v_coupon.currency,p_package_code,p_billing_interval,p_package_price_version_id,coalesce(p_quote_snapshot,'{}'::jsonb),now()+interval '15 minutes')
  returning * into v_result;
  return v_result;
end; $$;

revoke all on function public.whatsapp_platform_reserve_billing_coupon(uuid,text,text,text,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.whatsapp_platform_reserve_billing_coupon(uuid,text,text,text,uuid,bigint,jsonb) to service_role;

comment on column public.whatsapp_platform_billing_addon_change_intents.coupon_redemption_id is
  'Reserved coupon evidence applied only after Razorpay confirms the add-on payment.';
