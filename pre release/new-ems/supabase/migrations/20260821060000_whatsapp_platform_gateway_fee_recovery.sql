-- Razorpay's customer-fee-bearer checkout is not compatible with Subscriptions.
-- Store customer-facing subscription totals that recover the standard domestic
-- gateway charge (2%) and 18% GST on that charge. Gross-up keeps the configured
-- package revenue whole after Razorpay deducts 2.36% from the collected amount.

update public.whatsapp_platform_package_master
set monthly_amount = ceil((monthly_amount / (1 - 0.0236)) * 100) / 100,
    annual_amount = ceil((annual_amount / (1 - 0.0236)) * 100) / 100,
    razorpay_monthly_plan_id = null,
    razorpay_annual_plan_id = null,
    updated_at = now()
where billing_model = 'subscription'
  and monthly_amount > 0
  and annual_amount > 0;
