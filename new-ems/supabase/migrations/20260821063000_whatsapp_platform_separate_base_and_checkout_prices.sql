-- Package Master stores the advertised base price. Razorpay plans gross this
-- amount up at creation time so checkout can include gateway fees and fee GST.

update public.whatsapp_platform_package_master
set monthly_amount = round(monthly_amount * (1 - 0.0236), 2),
    annual_amount = round(annual_amount * (1 - 0.0236), 2),
    updated_at = now()
where billing_model = 'subscription'
  and monthly_amount > 0
  and annual_amount > 0;

