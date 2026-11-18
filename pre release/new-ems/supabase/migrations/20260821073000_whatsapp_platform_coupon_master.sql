-- Private coupon master and immutable redemption ledger.
-- Discounts are calculated by the billing Edge Function from tax-exclusive
-- Package Master snapshots; browser-provided totals are never authoritative.

create table public.whatsapp_platform_billing_coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(code) and code ~ '^[A-Z0-9][A-Z0-9_-]{2,39}$'),
  name text not null check (char_length(trim(name)) between 2 and 120),
  description text not null default '',
  status text not null default 'draft' check (status in ('draft','active','disabled')),
  discount_type text not null check (discount_type in ('percentage','fixed')),
  percentage_bps integer,
  fixed_amount_paise bigint,
  max_discount_paise bigint check (max_discount_paise is null or max_discount_paise > 0),
  currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  minimum_subtotal_paise bigint not null default 0 check (minimum_subtotal_paise >= 0),
  applies_to_package_codes jsonb not null default '[]'::jsonb check (jsonb_typeof(applies_to_package_codes) = 'array'),
  applies_to_addon_codes jsonb not null default '[]'::jsonb check (jsonb_typeof(applies_to_addon_codes) = 'array'),
  billing_intervals jsonb not null default '["month","year"]'::jsonb check (jsonb_typeof(billing_intervals) = 'array'),
  first_payment_only boolean not null default false,
  maximum_redemptions integer check (maximum_redemptions is null or maximum_redemptions > 0),
  maximum_redemptions_per_tenant integer not null default 1 check (maximum_redemptions_per_tenant > 0),
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  created_by_auth_user_id uuid references auth.users(id) on delete set null,
  updated_by_auth_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_platform_billing_coupons_value_check check (
    (discount_type = 'percentage' and percentage_bps between 1 and 10000 and fixed_amount_paise is null)
    or (discount_type = 'fixed' and fixed_amount_paise > 0 and percentage_bps is null)
  ),
  constraint whatsapp_platform_billing_coupons_window_check check (valid_until is null or valid_until > valid_from)
);

create table public.whatsapp_platform_billing_coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.whatsapp_platform_billing_coupons(id) on delete restrict,
  tenant_id uuid not null references public.whatsapp_platform_tenants(id) on delete restrict,
  subscription_id uuid references public.whatsapp_platform_billing_subscriptions(id) on delete set null,
  reservation_key uuid not null unique default gen_random_uuid(),
  status text not null default 'reserved' check (status in ('reserved','applied','released','expired','refunded')),
  coupon_code text not null,
  discount_type text not null check (discount_type in ('percentage','fixed')),
  percentage_bps integer,
  fixed_amount_paise bigint,
  subtotal_paise bigint not null check (subtotal_paise >= 0),
  discount_paise bigint not null check (discount_paise >= 0 and discount_paise <= subtotal_paise),
  currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  package_code text references public.whatsapp_platform_package_master(code),
  billing_interval text check (billing_interval is null or billing_interval in ('month','year')),
  package_price_version_id uuid references public.whatsapp_platform_package_price_versions(id) on delete restrict,
  quote_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(quote_snapshot) = 'object'),
  reserved_at timestamptz not null default now(),
  reservation_expires_at timestamptz,
  applied_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index whatsapp_platform_billing_coupons_status_window_idx
  on public.whatsapp_platform_billing_coupons(status,valid_from,valid_until);
create index whatsapp_platform_coupon_redemptions_coupon_status_idx
  on public.whatsapp_platform_billing_coupon_redemptions(coupon_id,status,created_at desc);
create index whatsapp_platform_coupon_redemptions_tenant_status_idx
  on public.whatsapp_platform_billing_coupon_redemptions(tenant_id,status,created_at desc);
create index whatsapp_platform_coupon_redemptions_subscription_idx
  on public.whatsapp_platform_billing_coupon_redemptions(subscription_id)
  where subscription_id is not null;
create index whatsapp_platform_coupon_redemptions_price_version_idx
  on public.whatsapp_platform_billing_coupon_redemptions(package_price_version_id)
  where package_price_version_id is not null;

alter table public.whatsapp_platform_billing_coupons enable row level security;
alter table public.whatsapp_platform_billing_coupon_redemptions enable row level security;
revoke all on table public.whatsapp_platform_billing_coupons from public,anon,authenticated;
revoke all on table public.whatsapp_platform_billing_coupon_redemptions from public,anon,authenticated;
grant select,insert,update,delete on table public.whatsapp_platform_billing_coupons to service_role;
grant select,insert,update,delete on table public.whatsapp_platform_billing_coupon_redemptions to service_role;

create or replace function public.whatsapp_platform_admin_package_master()
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not public.has_permission('whatsapp-platform','view') then raise exception 'Not authorized to view Package Master' using errcode='42501'; end if;
  return jsonb_build_object(
    'packages',coalesce((select jsonb_agg(to_jsonb(p) order by p.sort_order,p.created_at) from public.whatsapp_platform_package_master p),'[]'::jsonb),
    'addons',coalesce((select jsonb_agg(to_jsonb(a) order by a.sort_order,a.created_at) from public.whatsapp_platform_addon_master a),'[]'::jsonb),
    'coupons',coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at desc) from public.whatsapp_platform_billing_coupons c),'[]'::jsonb),
    'tenants',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'planCode',case when t.plan_code='starter' then 'launch' else t.plan_code end,'status',t.status) order by t.name) from public.whatsapp_platform_tenants t),'[]'::jsonb),
    'assignments',coalesce((select jsonb_agg(jsonb_build_object('id',ta.id,'tenantId',t.id,'tenantName',t.name,'planCode',case when t.plan_code='starter' then 'launch' else t.plan_code end,'addonCode',ta.addon_code,'quantity',ta.quantity,'status',ta.status,'billingStartsAt',ta.billing_starts_at,'billingEndsAt',ta.billing_ends_at) order by t.name,ta.addon_code)
      from public.whatsapp_platform_tenant_addons ta join public.whatsapp_platform_tenants t on t.id=ta.tenant_id),'[]'::jsonb)
  );
end; $$;

create or replace function public.whatsapp_platform_admin_save_billing_coupon(p_id uuid,p_payload jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_id uuid:=coalesce(p_id,gen_random_uuid());
  v_code text:=upper(trim(p_payload->>'code'));
  v_type text:=lower(trim(p_payload->>'discountType'));
  v_percentage integer:=case when v_type='percentage' then round(coalesce((p_payload->>'percentage')::numeric,0)*100)::integer else null end;
  v_fixed bigint:=case when v_type='fixed' then round(coalesce((p_payload->>'fixedAmount')::numeric,0)*100)::bigint else null end;
  v_max_discount bigint:=case when nullif(p_payload->>'maximumDiscount','') is null then null else round((p_payload->>'maximumDiscount')::numeric*100)::bigint end;
  v_minimum bigint:=round(coalesce((p_payload->>'minimumSubtotal')::numeric,0)*100)::bigint;
begin
  if not public.has_permission('whatsapp-platform','edit') then raise exception 'Not authorized to manage billing coupons' using errcode='42501'; end if;
  if v_code !~ '^[A-Z0-9][A-Z0-9_-]{2,39}$' then raise exception 'Coupon code must contain 3 to 40 letters, numbers, hyphens or underscores.'; end if;
  if v_type not in ('percentage','fixed') then raise exception 'Select a valid coupon discount type.'; end if;
  if v_type='percentage' and (v_percentage<1 or v_percentage>10000) then raise exception 'Percentage discount must be between 0.01 and 100.'; end if;
  if v_type='fixed' and coalesce(v_fixed,0)<1 then raise exception 'Fixed discount must be greater than zero.'; end if;
  insert into public.whatsapp_platform_billing_coupons as c
    (id,code,name,description,status,discount_type,percentage_bps,fixed_amount_paise,max_discount_paise,currency,minimum_subtotal_paise,applies_to_package_codes,applies_to_addon_codes,billing_intervals,first_payment_only,maximum_redemptions,maximum_redemptions_per_tenant,valid_from,valid_until,created_by_auth_user_id,updated_by_auth_user_id,updated_at)
  values
    (v_id,v_code,trim(p_payload->>'name'),coalesce(p_payload->>'description',''),coalesce(p_payload->>'status','draft'),v_type,v_percentage,v_fixed,v_max_discount,upper(coalesce(p_payload->>'currency','INR')),v_minimum,coalesce(p_payload->'packageCodes','[]'::jsonb),coalesce(p_payload->'addonCodes','[]'::jsonb),coalesce(p_payload->'billingIntervals','["month","year"]'::jsonb),coalesce((p_payload->>'firstPaymentOnly')::boolean,false),nullif(p_payload->>'maximumRedemptions','')::integer,coalesce(nullif(p_payload->>'maximumRedemptionsPerTenant','')::integer,1),coalesce(nullif(p_payload->>'validFrom','')::timestamptz,now()),nullif(p_payload->>'validUntil','')::timestamptz,auth.uid(),auth.uid(),now())
  on conflict (id) do update set
    code=excluded.code,name=excluded.name,description=excluded.description,status=excluded.status,discount_type=excluded.discount_type,percentage_bps=excluded.percentage_bps,fixed_amount_paise=excluded.fixed_amount_paise,max_discount_paise=excluded.max_discount_paise,currency=excluded.currency,minimum_subtotal_paise=excluded.minimum_subtotal_paise,applies_to_package_codes=excluded.applies_to_package_codes,applies_to_addon_codes=excluded.applies_to_addon_codes,billing_intervals=excluded.billing_intervals,first_payment_only=excluded.first_payment_only,maximum_redemptions=excluded.maximum_redemptions,maximum_redemptions_per_tenant=excluded.maximum_redemptions_per_tenant,valid_from=excluded.valid_from,valid_until=excluded.valid_until,updated_by_auth_user_id=auth.uid(),updated_at=now();
  return v_id;
end; $$;

revoke all on function public.whatsapp_platform_admin_save_billing_coupon(uuid,jsonb) from public,anon;
grant execute on function public.whatsapp_platform_admin_save_billing_coupon(uuid,jsonb) to authenticated,service_role;

comment on table public.whatsapp_platform_billing_coupons is 'Private authoritative discount definitions; values apply to tax-exclusive Package Master prices.';
comment on table public.whatsapp_platform_billing_coupon_redemptions is 'Immutable coupon quote and redemption evidence used for limit enforcement and financial audit.';
