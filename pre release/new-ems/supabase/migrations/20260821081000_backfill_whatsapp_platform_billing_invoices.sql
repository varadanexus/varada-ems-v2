-- Issue documents for captured Razorpay subscription payments recorded before
-- the centralized invoice trigger was introduced. Test payments remain TEST.

do $$
declare v_payment record;
begin
  for v_payment in
    select p.id
    from public.whatsapp_platform_billing_payments p
    left join public.whatsapp_platform_billing_invoices i on i.payment_id=p.id
    where p.captured=true and p.amount_paise>0 and nullif(p.provider_invoice_id,'') is not null and i.id is null
    order by p.paid_at nulls last,p.created_at,p.id
  loop
    perform public.whatsapp_platform_issue_billing_invoice(v_payment.id);
  end loop;
  if exists(
    select 1 from public.whatsapp_platform_billing_payments p
    left join public.whatsapp_platform_billing_invoices i on i.payment_id=p.id
    where p.captured=true and p.amount_paise>0 and nullif(p.provider_invoice_id,'') is not null and i.id is null
  ) then raise exception 'Captured Razorpay payment invoice backfill is incomplete'; end if;
end $$;
