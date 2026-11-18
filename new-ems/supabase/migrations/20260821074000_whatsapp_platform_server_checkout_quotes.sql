-- Server-priced checkout quotes. Every provider authorization is tied to an
-- immutable quote based on a Package Master revision and optional coupon.

create table public.whatsapp_platform_billing_checkout_quotes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.whatsapp_platform_tenants(id) on delete restrict,
  created_by_user_id uuid references public.whatsapp_platform_users(id) on delete set null,
  checkout_type text not null default 'subscription' check (checkout_type in ('subscription','upgrade','addon')),
  status text not null default 'quoted' check (status in ('quoted','authorization_pending','consumed','expired','cancelled','failed')),
  package_code text not null references public.whatsapp_platform_package_master(code),
  package_price_version_id uuid not null references public.whatsapp_platform_package_price_versions(id) on delete restrict,
  billing_interval text not null check (billing_interval in ('month','year')),
  coupon_id uuid references public.whatsapp_platform_billing_coupons(id) on delete restrict,
  coupon_redemption_id uuid unique references public.whatsapp_platform_billing_coupon_redemptions(id) on delete restrict,
  coupon_code text,
  currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  base_subtotal_paise bigint not null check (base_subtotal_paise > 0),
  discount_paise bigint not null default 0 check (discount_paise >= 0 and discount_paise < base_subtotal_paise),
  taxable_base_paise bigint generated always as (base_subtotal_paise-discount_paise) stored,
  package_gst_paise bigint not null check (package_gst_paise >= 0),
  gateway_adjustment_paise bigint not null check (gateway_adjustment_paise >= 0),
  checkout_amount_paise bigint not null check (checkout_amount_paise > 0),
  gst_rate_bps integer not null default 1800 check (gst_rate_bps between 0 and 10000),
  gateway_rate_bps integer not null default 236 check (gateway_rate_bps between 0 and 10000),
  provider_plan_id text,
  subscription_id uuid unique references public.whatsapp_platform_billing_subscriptions(id) on delete set null,
  quote_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(quote_snapshot)='object'),
  expires_at timestamptz not null default (now()+interval '15 minutes'),
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_platform_checkout_quote_total_check check (checkout_amount_paise=taxable_base_paise+package_gst_paise+gateway_adjustment_paise)
);

create index whatsapp_platform_checkout_quotes_tenant_status_idx
  on public.whatsapp_platform_billing_checkout_quotes(tenant_id,status,created_at desc);
create index whatsapp_platform_checkout_quotes_package_idx
  on public.whatsapp_platform_billing_checkout_quotes(package_code);
create index whatsapp_platform_checkout_quotes_price_version_idx
  on public.whatsapp_platform_billing_checkout_quotes(package_price_version_id);
create index whatsapp_platform_checkout_quotes_coupon_idx
  on public.whatsapp_platform_billing_checkout_quotes(coupon_id)
  where coupon_id is not null;
create index whatsapp_platform_checkout_quotes_created_by_idx
  on public.whatsapp_platform_billing_checkout_quotes(created_by_user_id)
  where created_by_user_id is not null;

alter table public.whatsapp_platform_billing_checkout_quotes enable row level security;
revoke all on table public.whatsapp_platform_billing_checkout_quotes from public,anon,authenticated;
grant select,insert,update,delete on table public.whatsapp_platform_billing_checkout_quotes to service_role;

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

comment on table public.whatsapp_platform_billing_checkout_quotes is 'Immutable server-calculated checkout totals tied to Package Master revisions, coupon evidence and provider authorization.';
