-- Existing catalogue prices were whole-rupee amounts before fee recovery was
-- separated from Package Master. Remove inverse gross-up rounding residue.

update public.whatsapp_platform_package_master
set monthly_amount = round(monthly_amount, 0),
    annual_amount = round(annual_amount, 0),
    razorpay_monthly_plan_id = null,
    razorpay_annual_plan_id = null,
    updated_at = now()
where billing_model = 'subscription';
