-- Extend the existing EMS coupon master to prepaid wallet recharges. Discounts
-- reduce the amount collected, while the selected service credit is still the
-- amount posted to the wallet after verified payment capture.
alter table public.whatsapp_platform_billing_coupons
  add column applies_to_wallet boolean not null default false;

alter table public.whatsapp_platform_wallet_recharges
  drop constraint if exists whatsapp_platform_wallet_recharges_check,
  add column coupon_redemption_id uuid references public.whatsapp_platform_billing_coupon_redemptions(id) on delete restrict,
  add column discount_amount_minor bigint not null default 0 check(discount_amount_minor>=0),
  add column taxable_amount_minor bigint not null default 0 check(taxable_amount_minor>=0);

alter table public.whatsapp_platform_billing_coupon_redemptions
  add column wallet_recharge_id uuid references public.whatsapp_platform_wallet_recharges(id) on delete restrict;
create unique index whatsapp_wallet_coupon_redemption_recharge
  on public.whatsapp_platform_billing_coupon_redemptions(wallet_recharge_id) where wallet_recharge_id is not null;

create or replace function public.whatsapp_platform_admin_save_billing_coupon(p_id uuid,p_payload jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_id uuid:=coalesce(p_id,gen_random_uuid());v_code text:=upper(trim(p_payload->>'code'));v_type text:=lower(trim(p_payload->>'discountType'));
  v_percentage integer:=case when v_type='percentage' then round(coalesce((p_payload->>'percentage')::numeric,0)*100)::integer else null end;
  v_fixed bigint:=case when v_type='fixed' then round(coalesce((p_payload->>'fixedAmount')::numeric,0)*100)::bigint else null end;
  v_max_discount bigint:=case when nullif(p_payload->>'maximumDiscount','') is null then null else round((p_payload->>'maximumDiscount')::numeric*100)::bigint end;
  v_minimum bigint:=round(coalesce((p_payload->>'minimumSubtotal')::numeric,0)*100)::bigint;
  v_first boolean:=coalesce((p_payload->>'firstPaymentOnly')::boolean,false);v_offer text:=nullif(trim(p_payload->>'providerOfferId'),'');
begin
  if not public.has_permission('whatsapp-platform','edit') then raise exception 'Not authorized to manage billing coupons' using errcode='42501'; end if;
  if v_code !~ '^[A-Z0-9][A-Z0-9_-]{2,39}$' then raise exception 'Coupon code must contain 3 to 40 letters, numbers, hyphens or underscores.'; end if;
  if v_type not in ('percentage','fixed') then raise exception 'Select a valid coupon discount type.'; end if;
  if v_type='percentage' and (v_percentage<1 or v_percentage>10000) then raise exception 'Percentage discount must be between 0.01 and 100.'; end if;
  if v_type='fixed' and coalesce(v_fixed,0)<1 then raise exception 'Fixed discount must be greater than zero.'; end if;
  if v_offer is not null and v_offer !~ '^offer_[A-Za-z0-9]{6,64}$' then raise exception 'Enter a valid Razorpay Subscription Offer ID.'; end if;
  if v_first and v_offer is null then raise exception 'A first-payment-only coupon requires a Razorpay single-use Subscription Offer ID.'; end if;
  insert into public.whatsapp_platform_billing_coupons as c
    (id,code,name,description,status,discount_type,percentage_bps,fixed_amount_paise,max_discount_paise,currency,minimum_subtotal_paise,applies_to_package_codes,applies_to_addon_codes,billing_intervals,first_payment_only,provider_offer_id,applies_to_wallet,maximum_redemptions,maximum_redemptions_per_tenant,valid_from,valid_until,created_by_auth_user_id,updated_by_auth_user_id,updated_at)
  values(v_id,v_code,trim(p_payload->>'name'),coalesce(p_payload->>'description',''),coalesce(p_payload->>'status','draft'),v_type,v_percentage,v_fixed,v_max_discount,upper(coalesce(p_payload->>'currency','INR')),v_minimum,coalesce(p_payload->'packageCodes','[]'::jsonb),coalesce(p_payload->'addonCodes','[]'::jsonb),coalesce(p_payload->'billingIntervals','["month","year"]'::jsonb),v_first,v_offer,coalesce((p_payload->>'appliesToWallet')::boolean,false),nullif(p_payload->>'maximumRedemptions','')::integer,coalesce(nullif(p_payload->>'maximumRedemptionsPerTenant','')::integer,1),coalesce(nullif(p_payload->>'validFrom','')::timestamptz,now()),nullif(p_payload->>'validUntil','')::timestamptz,auth.uid(),auth.uid(),now())
  on conflict(id) do update set code=excluded.code,name=excluded.name,description=excluded.description,status=excluded.status,discount_type=excluded.discount_type,percentage_bps=excluded.percentage_bps,fixed_amount_paise=excluded.fixed_amount_paise,max_discount_paise=excluded.max_discount_paise,currency=excluded.currency,minimum_subtotal_paise=excluded.minimum_subtotal_paise,applies_to_package_codes=excluded.applies_to_package_codes,applies_to_addon_codes=excluded.applies_to_addon_codes,billing_intervals=excluded.billing_intervals,first_payment_only=excluded.first_payment_only,provider_offer_id=excluded.provider_offer_id,applies_to_wallet=excluded.applies_to_wallet,maximum_redemptions=excluded.maximum_redemptions,maximum_redemptions_per_tenant=excluded.maximum_redemptions_per_tenant,valid_from=excluded.valid_from,valid_until=excluded.valid_until,updated_by_auth_user_id=auth.uid(),updated_at=now();
  return v_id;
end; $$;

create function public.whatsapp_wallet_reserve_coupon(p_tenant uuid,p_code text,p_subtotal bigint,p_currency text,p_reservation_key uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.whatsapp_platform_billing_coupons; r public.whatsapp_platform_billing_coupon_redemptions; discount bigint;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Server only' using errcode='42501'; end if;
  if p_reservation_key is null or p_subtotal is null or p_subtotal<1 then raise exception 'Valid coupon reservation and subtotal required'; end if;
  update public.whatsapp_platform_billing_coupon_redemptions set status='expired',updated_at=now()
    where status='reserved' and reservation_expires_at<=now();
  select * into r from public.whatsapp_platform_billing_coupon_redemptions where reservation_key=p_reservation_key;
  if found then
    if r.tenant_id<>p_tenant or r.subtotal_paise<>p_subtotal or r.currency<>p_currency or r.coupon_code<>upper(trim(p_code))
      then raise exception 'Coupon reservation idempotency conflict'; end if;
    if r.status<>'reserved' or r.reservation_expires_at<=now() then raise exception 'Coupon reservation is no longer available'; end if;
    return to_jsonb(r);
  end if;
  select * into c from public.whatsapp_platform_billing_coupons where code=upper(trim(p_code)) for update;
  if not found or c.status<>'active' or not c.applies_to_wallet or c.valid_from>now() or (c.valid_until is not null and c.valid_until<=now())
    then raise exception 'Coupon code is invalid or unavailable for wallet recharges'; end if;
  if c.currency<>p_currency then raise exception 'Coupon currency does not match this wallet'; end if;
  if p_subtotal<c.minimum_subtotal_paise then raise exception 'Recharge amount is below the coupon minimum'; end if;
  if c.first_payment_only and exists(select 1 from public.whatsapp_platform_wallet_recharges where tenant_id=p_tenant and state='captured')
    then raise exception 'This coupon is available only for the first completed wallet recharge'; end if;
  if c.maximum_redemptions is not null and (select count(*) from public.whatsapp_platform_billing_coupon_redemptions where coupon_id=c.id and status in ('reserved','applied'))>=c.maximum_redemptions
    then raise exception 'Coupon redemption limit has been reached'; end if;
  if (select count(*) from public.whatsapp_platform_billing_coupon_redemptions where coupon_id=c.id and tenant_id=p_tenant and status in ('reserved','applied'))>=c.maximum_redemptions_per_tenant
    then raise exception 'Coupon redemption limit for this workspace has been reached'; end if;
  discount:=case when c.discount_type='percentage' then round(p_subtotal*c.percentage_bps::numeric/10000)::bigint else c.fixed_amount_paise end;
  if c.max_discount_paise is not null then discount:=least(discount,c.max_discount_paise); end if;
  discount:=least(greatest(discount,0),p_subtotal);
  if discount<1 then raise exception 'Coupon does not produce a valid discount'; end if;
  insert into public.whatsapp_platform_billing_coupon_redemptions(coupon_id,tenant_id,reservation_key,status,coupon_code,discount_type,
    percentage_bps,fixed_amount_paise,subtotal_paise,discount_paise,currency,quote_snapshot,reservation_expires_at)
  values(c.id,p_tenant,p_reservation_key,'reserved',c.code,c.discount_type,c.percentage_bps,c.fixed_amount_paise,p_subtotal,discount,p_currency,
    jsonb_build_object('purpose','wallet_recharge','couponName',c.name,'nonRefundableCredit',true),now()+interval '15 minutes') returning * into r;
  return to_jsonb(r);
end; $$;
revoke all on function public.whatsapp_wallet_reserve_coupon(uuid,text,bigint,text,uuid) from public,anon,authenticated;
grant execute on function public.whatsapp_wallet_reserve_coupon(uuid,text,bigint,text,uuid) to service_role;

create or replace function public.whatsapp_wallet_prepare_recharge(p_tenant uuid,p_mode text,p_request_key text,p_amount_minor bigint,p_exponent integer,p_charge_breakdown jsonb default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare w public.whatsapp_platform_wallets; r public.whatsapp_platform_wallet_recharges; fx public.whatsapp_platform_wallet_fx; redemption public.whatsapp_platform_billing_coupon_redemptions; credit bigint;
  total bigint; service_gst bigint; gateway_fee bigint; gateway_gst bigint; discount bigint:=0; taxable bigint; redemption_id uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Server only' using errcode='42501'; end if;
  select * into strict w from public.whatsapp_platform_wallets where tenant_id=p_tenant and mode=p_mode for update;
  if not w.enabled then raise exception 'Wallet is not active'; end if;
  if p_exponent is null or p_exponent not between 0 and 3 or p_amount_minor is null or p_amount_minor not between 1 and 1000000000 then raise exception 'Invalid recharge amount'; end if;
  total:=p_amount_minor;taxable:=p_amount_minor;
  if p_charge_breakdown is not null then
    if jsonb_typeof(p_charge_breakdown) is distinct from 'object' or coalesce(length(p_charge_breakdown->>'policyId'),0)=0
      or (p_charge_breakdown->>'currency') is distinct from w.currency or (p_charge_breakdown->>'creditMinor') is distinct from p_amount_minor::text
      or coalesce(p_charge_breakdown->>'discountMinor','') !~ '^[0-9]{1,10}$' or coalesce(p_charge_breakdown->>'taxableMinor','') !~ '^[0-9]{1,10}$'
      or coalesce(p_charge_breakdown->>'serviceGstMinor','') !~ '^[0-9]{1,10}$' or coalesce(p_charge_breakdown->>'gatewayFeeMinor','') !~ '^[0-9]{1,10}$'
      or coalesce(p_charge_breakdown->>'gatewayGstMinor','') !~ '^[0-9]{1,10}$' or coalesce(p_charge_breakdown->>'totalMinor','') !~ '^[0-9]{1,10}$'
      then raise exception 'Invalid recharge charge breakdown'; end if;
    discount:=(p_charge_breakdown->>'discountMinor')::bigint;taxable:=(p_charge_breakdown->>'taxableMinor')::bigint;
    service_gst:=(p_charge_breakdown->>'serviceGstMinor')::bigint;gateway_fee:=(p_charge_breakdown->>'gatewayFeeMinor')::bigint;
    gateway_gst:=(p_charge_breakdown->>'gatewayGstMinor')::bigint;total:=(p_charge_breakdown->>'totalMinor')::bigint;
    if discount>p_amount_minor or taxable<>p_amount_minor-discount or total<>taxable+service_gst+gateway_fee+gateway_gst or total<1 or total>1000000000
      then raise exception 'Recharge total does not match charge breakdown'; end if;
    if nullif(p_charge_breakdown->>'couponRedemptionId','') is not null then
      redemption_id:=(p_charge_breakdown->>'couponRedemptionId')::uuid;
      select * into strict redemption from public.whatsapp_platform_billing_coupon_redemptions where id=redemption_id for update;
      if redemption.tenant_id<>p_tenant or redemption.status<>'reserved' or redemption.reservation_expires_at<=now()
        or redemption.subtotal_paise<>p_amount_minor or redemption.discount_paise<>discount or redemption.currency<>w.currency
        then raise exception 'Coupon reservation does not match recharge'; end if;
    elsif discount<>0 then raise exception 'Discount requires a reserved coupon'; end if;
  end if;
  select * into r from public.whatsapp_platform_wallet_recharges where tenant_id=p_tenant and mode=p_mode and request_key=p_request_key;
  if found then
    if r.credit_amount_minor<>p_amount_minor or r.currency_exponent<>p_exponent or r.charge_breakdown is distinct from p_charge_breakdown then raise exception 'Recharge idempotency conflict'; end if;
    return to_jsonb(r);
  end if;
  select * into fx from public.whatsapp_platform_wallet_fx where currency=w.currency and valid_from<=now() and valid_until>now() order by valid_from desc,created_at desc limit 1;
  if not found then raise exception 'Current exchange-rate evidence is unavailable'; end if;
  credit:=p_amount_minor*power(10,6-p_exponent)::bigint;
  if credit < ceil(w.minimum_topup_usd_micros*fx.units_per_usd) then raise exception 'Recharge is below the minimum amount'; end if;
  insert into public.whatsapp_platform_wallet_recharges(tenant_id,mode,request_key,currency,currency_exponent,amount_minor,credit_amount_minor,charge_breakdown,
    coupon_redemption_id,discount_amount_minor,taxable_amount_minor,credit_micros,fx_quote_id,fx_units_per_usd,usd_equivalent_micros)
  values(p_tenant,p_mode,p_request_key,w.currency,p_exponent,total,p_amount_minor,p_charge_breakdown,redemption_id,discount,taxable,credit,fx.id,fx.units_per_usd,floor(credit/fx.units_per_usd)::bigint) returning * into r;
  if redemption_id is not null then update public.whatsapp_platform_billing_coupon_redemptions set wallet_recharge_id=r.id,updated_at=now() where id=redemption_id; end if;
  return to_jsonb(r);
end; $$;

create or replace function public.whatsapp_wallet_discard_quote(p_tenant uuid,p_mode text,p_recharge uuid,p_user uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare r public.whatsapp_platform_wallet_recharges;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Server only' using errcode='42501'; end if;
  if not exists(select 1 from public.whatsapp_platform_users where id=p_user and tenant_id=p_tenant and status='active' and role_code in ('owner','admin')) then raise exception 'Active workspace owner or admin required'; end if;
  perform 1 from public.whatsapp_platform_wallets where tenant_id=p_tenant and mode=p_mode for update;
  select * into strict r from public.whatsapp_platform_wallet_recharges where id=p_recharge and tenant_id=p_tenant and mode=p_mode for update;
  if r.order_creation_started_at is not null or r.provider_order_id is not null or r.state<>'prepared' or exists(select 1 from public.whatsapp_platform_wallet_recharge_consents where recharge_id=r.id)
    then raise exception 'Payment may have started; reconcile this recharge instead'; end if;
  insert into public.whatsapp_platform_wallet_discarded_quotes(recharge_id,user_id) values(r.id,p_user) on conflict do nothing;
  if r.coupon_redemption_id is not null then update public.whatsapp_platform_billing_coupon_redemptions set status='released',released_at=now(),updated_at=now() where id=r.coupon_redemption_id and status='reserved'; end if;
  return true;
end; $$;

create or replace function public.whatsapp_wallet_capture_recharge(p_tenant uuid,p_mode text,p_order_id text,p_payment_id text,p_amount_minor bigint,p_currency text,p_captured_at timestamptz)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.whatsapp_platform_wallet_recharges;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Server only' using errcode='42501'; end if;
  if p_payment_id is null or p_payment_id !~ '^pay_[A-Za-z0-9]+$' or p_captured_at is null then raise exception 'Captured payment evidence required'; end if;
  perform 1 from public.whatsapp_platform_wallets where tenant_id=p_tenant and mode=p_mode for update;
  select * into strict r from public.whatsapp_platform_wallet_recharges where tenant_id=p_tenant and mode=p_mode and provider_order_id=p_order_id for update;
  if p_amount_minor is distinct from r.amount_minor or p_currency is distinct from r.currency then raise exception 'Payment amount or currency mismatch'; end if;
  if r.provider_payment_id is not null and r.provider_payment_id<>p_payment_id then raise exception 'Recharge already credited by another payment'; end if;
  if r.state='captured' then return to_jsonb(r); end if;
  if r.coupon_redemption_id is not null and not exists(select 1 from public.whatsapp_platform_billing_coupon_redemptions where id=r.coupon_redemption_id and status='reserved')
    then raise exception 'Coupon reservation is not available for capture'; end if;
  perform public.whatsapp_wallet_post(p_tenant,p_mode,'recharge:'||r.id,'topup',r.credit_micros,0,'Captured Razorpay service advance '||p_payment_id);
  update public.whatsapp_platform_wallet_recharges set provider_payment_id=p_payment_id,state='captured',captured_at=p_captured_at where id=r.id returning * into r;
  if r.coupon_redemption_id is not null then update public.whatsapp_platform_billing_coupon_redemptions set status='applied',applied_at=p_captured_at,updated_at=now() where id=r.coupon_redemption_id and status='reserved'; end if;
  return to_jsonb(r);
end; $$;

create or replace function public.whatsapp_wallet_accept_recharge(p_tenant uuid,p_mode text,p_recharge uuid,p_user uuid,p_total bigint,p_policy text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.whatsapp_platform_wallet_recharges;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Server only' using errcode='42501'; end if;
  if not exists(select 1 from public.whatsapp_platform_users where id=p_user and tenant_id=p_tenant and status='active' and role_code in ('owner','admin')) then raise exception 'Active workspace owner or admin required'; end if;
  select * into strict r from public.whatsapp_platform_wallet_recharges where id=p_recharge and tenant_id=p_tenant and mode=p_mode for update;
  if exists(select 1 from public.whatsapp_platform_wallet_discarded_quotes where recharge_id=r.id) then raise exception 'Recharge quote was discarded'; end if;
  if r.charge_breakdown is null or p_total is distinct from r.amount_minor or p_policy is distinct from 'service-balance-nonrefundable-v1' then raise exception 'Quoted total and policy acceptance required'; end if;
  if not exists(select 1 from public.whatsapp_platform_wallet_recharge_consents where recharge_id=r.id) and r.created_at<now()-interval '15 minutes' then raise exception 'Recharge quote expired; request a new quote'; end if;
  if r.coupon_redemption_id is not null and not exists(select 1 from public.whatsapp_platform_billing_coupon_redemptions where id=r.coupon_redemption_id and status='reserved' and reservation_expires_at>now())
    then raise exception 'Coupon quote expired; request a new recharge quote'; end if;
  insert into public.whatsapp_platform_wallet_recharge_consents(recharge_id,user_id,policy_version,accepted_total_minor)
    values(r.id,p_user,p_policy,p_total) on conflict(recharge_id) do nothing;
  return to_jsonb(r);
end; $$;

notify pgrst,'reload schema';
