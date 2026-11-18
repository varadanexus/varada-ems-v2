-- Deployment-time assertions for refund reservation and over-refund controls.

do $$
declare
  v_tenant_id uuid:=gen_random_uuid();v_subscription_id uuid;v_payment_id uuid;v_invoice_id uuid;
  v_request_one public.whatsapp_platform_billing_refund_requests;v_request_two public.whatsapp_platform_billing_refund_requests;
  v_provider_payment_id text:='pay_'||replace(gen_random_uuid()::text,'-','');v_provider_refund_id text:='rfnd_'||replace(gen_random_uuid()::text,'-','');
begin
  insert into public.whatsapp_platform_tenants(id,name,slug,owner_email,status,plan_code)
  values(v_tenant_id,'Refund controls QA','refund-controls-qa-'||replace(v_tenant_id::text,'-',''),'refund-controls-qa@example.invalid','active','launch');
  insert into public.whatsapp_platform_billing_subscriptions(tenant_id,package_code,billing_interval,provider_plan_id,provider_subscription_id,status,quantity,total_count,paid_count,recurring_base_paise,gst_rate_bps,safe_metadata)
  values(v_tenant_id,'launch','month','plan_refund_controls_qa','sub_refund_controls_qa_'||replace(v_tenant_id::text,'-',''),'active',1,12,1,10000,1800,jsonb_build_object('mode','test')) returning id into v_subscription_id;
  insert into public.whatsapp_platform_billing_payments(tenant_id,subscription_id,provider_payment_id,provider_invoice_id,amount_paise,currency,status,captured,payment_method,paid_at)
  values(v_tenant_id,v_subscription_id,v_provider_payment_id,'inv_'||replace(gen_random_uuid()::text,'-',''),12000,'INR','captured',true,'upi',now()) returning id into v_payment_id;
  select id into v_invoice_id from public.whatsapp_platform_billing_invoices where payment_id=v_payment_id;

  select * into v_request_one from public.whatsapp_platform_reserve_billing_refund(v_payment_id,7000,'Validated partial refund test',null);
  begin
    perform public.whatsapp_platform_reserve_billing_refund(v_payment_id,6000,'This amount must exceed the balance',null);
    raise exception 'Refund control QA failed: concurrent reservations allowed an over-refund.';
  exception when others then
    if sqlerrm like 'Refund control QA failed:%' then raise; end if;
  end;
  perform public.whatsapp_platform_finalize_billing_refund_request(v_request_one.id,'failed',null,'Expected test release');
  select * into v_request_two from public.whatsapp_platform_reserve_billing_refund(v_payment_id,12000,'Validated full refund test',null);
  perform public.whatsapp_platform_record_billing_refund(v_provider_refund_id,v_provider_payment_id,12000,'INR','processed','Validated full refund test',jsonb_build_object('receipt','ems-'||v_request_two.id::text));
  if not exists(select 1 from public.whatsapp_platform_billing_refund_requests where id=v_request_two.id and status='processed' and provider_refund_id=v_provider_refund_id) then
    raise exception 'Refund control QA failed: provider refund did not finalize its EMS request.';
  end if;
  if not exists(select 1 from public.whatsapp_platform_billing_invoices where id=v_invoice_id and status='refunded') then
    raise exception 'Refund control QA failed: invoice did not reach refunded state.';
  end if;
  begin
    perform public.whatsapp_platform_record_billing_refund(v_provider_refund_id,v_provider_payment_id,11000,'INR','processed','Mismatched replay',jsonb_build_object('receipt','ems-'||v_request_two.id::text));
    raise exception 'Refund control QA failed: mismatched idempotency replay was accepted.';
  exception when others then
    if sqlerrm like 'Refund control QA failed:%' then raise; end if;
  end;

  delete from public.whatsapp_platform_billing_credit_notes where invoice_id=v_invoice_id;
  delete from public.whatsapp_platform_billing_refund_requests where payment_id=v_payment_id;
  delete from public.whatsapp_platform_billing_refunds where invoice_id=v_invoice_id;
  delete from public.whatsapp_platform_billing_invoices where id=v_invoice_id;
  delete from public.whatsapp_platform_billing_payments where id=v_payment_id;
  delete from public.whatsapp_platform_billing_subscriptions where id=v_subscription_id;
  delete from public.whatsapp_platform_tenants where id=v_tenant_id;
end $$;
