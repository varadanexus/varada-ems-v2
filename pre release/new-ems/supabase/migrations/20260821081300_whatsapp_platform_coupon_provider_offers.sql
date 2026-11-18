-- A first-payment-only discount must be implemented with a Razorpay
-- single-use Subscription Offer. Embedding that discount in a Plan would
-- incorrectly repeat it on every renewal.

alter table public.whatsapp_platform_billing_coupons
  add column if not exists provider_offer_id text;

alter table public.whatsapp_platform_billing_coupons
  drop constraint if exists whatsapp_platform_billing_coupons_provider_offer_check;

alter table public.whatsapp_platform_billing_coupons
  add constraint whatsapp_platform_billing_coupons_provider_offer_check check (
    provider_offer_id is null or provider_offer_id ~ '^offer_[A-Za-z0-9]{6,64}$'
  );

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
  v_first_payment_only boolean:=coalesce((p_payload->>'firstPaymentOnly')::boolean,false);
  v_provider_offer_id text:=nullif(trim(p_payload->>'providerOfferId'),'');
begin
  if not public.has_permission('whatsapp-platform','edit') then raise exception 'Not authorized to manage billing coupons' using errcode='42501'; end if;
  if v_code !~ '^[A-Z0-9][A-Z0-9_-]{2,39}$' then raise exception 'Coupon code must contain 3 to 40 letters, numbers, hyphens or underscores.'; end if;
  if v_type not in ('percentage','fixed') then raise exception 'Select a valid coupon discount type.'; end if;
  if v_type='percentage' and (v_percentage<1 or v_percentage>10000) then raise exception 'Percentage discount must be between 0.01 and 100.'; end if;
  if v_type='fixed' and coalesce(v_fixed,0)<1 then raise exception 'Fixed discount must be greater than zero.'; end if;
  if v_provider_offer_id is not null and v_provider_offer_id !~ '^offer_[A-Za-z0-9]{6,64}$' then raise exception 'Enter a valid Razorpay Subscription Offer ID.'; end if;
  if v_first_payment_only and v_provider_offer_id is null then raise exception 'A first-payment-only coupon requires a Razorpay single-use Subscription Offer ID.'; end if;
  insert into public.whatsapp_platform_billing_coupons as c
    (id,code,name,description,status,discount_type,percentage_bps,fixed_amount_paise,max_discount_paise,currency,minimum_subtotal_paise,applies_to_package_codes,applies_to_addon_codes,billing_intervals,first_payment_only,provider_offer_id,maximum_redemptions,maximum_redemptions_per_tenant,valid_from,valid_until,created_by_auth_user_id,updated_by_auth_user_id,updated_at)
  values
    (v_id,v_code,trim(p_payload->>'name'),coalesce(p_payload->>'description',''),coalesce(p_payload->>'status','draft'),v_type,v_percentage,v_fixed,v_max_discount,upper(coalesce(p_payload->>'currency','INR')),v_minimum,coalesce(p_payload->'packageCodes','[]'::jsonb),coalesce(p_payload->'addonCodes','[]'::jsonb),coalesce(p_payload->'billingIntervals','["month","year"]'::jsonb),v_first_payment_only,v_provider_offer_id,nullif(p_payload->>'maximumRedemptions','')::integer,coalesce(nullif(p_payload->>'maximumRedemptionsPerTenant','')::integer,1),coalesce(nullif(p_payload->>'validFrom','')::timestamptz,now()),nullif(p_payload->>'validUntil','')::timestamptz,auth.uid(),auth.uid(),now())
  on conflict (id) do update set
    code=excluded.code,name=excluded.name,description=excluded.description,status=excluded.status,discount_type=excluded.discount_type,percentage_bps=excluded.percentage_bps,fixed_amount_paise=excluded.fixed_amount_paise,max_discount_paise=excluded.max_discount_paise,currency=excluded.currency,minimum_subtotal_paise=excluded.minimum_subtotal_paise,applies_to_package_codes=excluded.applies_to_package_codes,applies_to_addon_codes=excluded.applies_to_addon_codes,billing_intervals=excluded.billing_intervals,first_payment_only=excluded.first_payment_only,provider_offer_id=excluded.provider_offer_id,maximum_redemptions=excluded.maximum_redemptions,maximum_redemptions_per_tenant=excluded.maximum_redemptions_per_tenant,valid_from=excluded.valid_from,valid_until=excluded.valid_until,updated_by_auth_user_id=auth.uid(),updated_at=now();
  return v_id;
end; $$;

revoke all on function public.whatsapp_platform_admin_save_billing_coupon(uuid,jsonb) from public,anon;
grant execute on function public.whatsapp_platform_admin_save_billing_coupon(uuid,jsonb) to authenticated,service_role;

comment on column public.whatsapp_platform_billing_coupons.provider_offer_id is
  'Razorpay single-use Subscription Offer linked at authorization for first-payment-only coupons.';
