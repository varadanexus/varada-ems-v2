-- A Razorpay refund can succeed before the local ledger write completes.
-- Keep such submitted requests in the refundable-balance calculation until a
-- matching provider refund row arrives through the API response or webhook.

create or replace function public.whatsapp_platform_reserve_billing_refund(p_payment_id uuid,p_amount_paise bigint,p_reason text,p_requested_by uuid)
returns public.whatsapp_platform_billing_refund_requests
language plpgsql security definer set search_path=public as $$
declare v_payment public.whatsapp_platform_billing_payments;v_refunded bigint;v_reserved bigint;v_result public.whatsapp_platform_billing_refund_requests;
begin
  if auth.role()<>'service_role' then raise exception 'Billing refunds are server-only' using errcode='42501'; end if;
  if p_amount_paise<1 or char_length(trim(coalesce(p_reason,''))) not between 10 and 500 then raise exception 'Enter a valid refund amount and a reason of 10 to 500 characters'; end if;
  select * into v_payment from public.whatsapp_platform_billing_payments where id=p_payment_id for update;
  if not found or not v_payment.captured or v_payment.status<>'captured' then raise exception 'Only a captured payment can be refunded'; end if;
  select coalesce(sum(amount_paise),0) into v_refunded from public.whatsapp_platform_billing_refunds where payment_id=v_payment.id and status in ('pending','processed');
  select coalesce(sum(r.amount_paise),0) into v_reserved
  from public.whatsapp_platform_billing_refund_requests r
  where r.payment_id=v_payment.id and (
    (r.status='reserved' and r.expires_at>now())
    or (r.status='submitted' and not exists(select 1 from public.whatsapp_platform_billing_refunds f where f.provider_refund_id=r.provider_refund_id))
  );
  if p_amount_paise>v_payment.amount_paise-v_refunded-v_reserved then raise exception 'Refund amount exceeds the unrefunded payment balance'; end if;
  insert into public.whatsapp_platform_billing_refund_requests(tenant_id,payment_id,requested_by,amount_paise,currency,reason)
  values(v_payment.tenant_id,v_payment.id,p_requested_by,p_amount_paise,v_payment.currency,trim(p_reason)) returning * into v_result;
  return v_result;
end $$;

notify pgrst,'reload schema';
