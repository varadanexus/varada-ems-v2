create index whatsapp_platform_billing_coupons_created_by_idx
  on public.whatsapp_platform_billing_coupons(created_by_auth_user_id)
  where created_by_auth_user_id is not null;

create index whatsapp_platform_billing_coupons_updated_by_idx
  on public.whatsapp_platform_billing_coupons(updated_by_auth_user_id)
  where updated_by_auth_user_id is not null;

create index whatsapp_platform_coupon_redemptions_package_code_idx
  on public.whatsapp_platform_billing_coupon_redemptions(package_code)
  where package_code is not null;
