-- Deployment-time assertions for centralized invoice and credit-note issuance.

do $$
declare
  v_tenant_id uuid:=gen_random_uuid();
  v_subscription_id uuid;
  v_payment_id uuid;
  v_invoice_id uuid;
  v_invoice_number text;
  v_provider_payment_id text:='pay_'||replace(gen_random_uuid()::text,'-','');
  v_provider_invoice_id text:='inv_'||replace(gen_random_uuid()::text,'-','');
  v_refund_one text:='rfnd_'||replace(gen_random_uuid()::text,'-','');
  v_refund_two text:='rfnd_'||replace(gen_random_uuid()::text,'-','');
  v_count integer;
begin
  insert into public.whatsapp_platform_tenants(id,name,slug,owner_email,status,plan_code)
  values(v_tenant_id,'Billing documents QA','billing-documents-qa-'||replace(v_tenant_id::text,'-',''),'billing-documents-qa@example.invalid','active','launch');

  insert into public.whatsapp_platform_billing_subscriptions
    (tenant_id,package_code,billing_interval,provider_plan_id,provider_subscription_id,status,quantity,total_count,paid_count,recurring_base_paise,gst_rate_bps,safe_metadata)
  values
    (v_tenant_id,'launch','month','plan_document_qa','sub_document_qa_'||replace(v_tenant_id::text,'-',''),'active',1,12,1,10000,1800,jsonb_build_object('mode','test'))
  returning id into v_subscription_id;

  insert into public.whatsapp_platform_billing_payments
    (tenant_id,subscription_id,provider_payment_id,provider_invoice_id,amount_paise,currency,status,captured,payment_method,paid_at)
  values
    (v_tenant_id,v_subscription_id,v_provider_payment_id,v_provider_invoice_id,12000,'INR','captured',true,'card',now())
  returning id into v_payment_id;

  select id,invoice_number into v_invoice_id,v_invoice_number
  from public.whatsapp_platform_billing_invoices where payment_id=v_payment_id;
  if v_invoice_id is null or v_invoice_number not like 'TEST/INV/%' then
    raise exception 'Billing document QA failed: test invoice was not issued.';
  end if;
  if not exists(
    select 1 from public.whatsapp_platform_billing_invoices
    where id=v_invoice_id and provider_invoice_id=v_provider_invoice_id
      and provider_payment_id=v_provider_payment_id and taxable_base_paise=10000
      and gst_paise=1800 and gateway_adjustment_paise=200 and total_paise=12000
  ) then
    raise exception 'Billing document QA failed: invoice breakdown or Razorpay references are incorrect.';
  end if;

  perform public.whatsapp_platform_issue_billing_invoice(v_payment_id);
  select count(*) into v_count from public.whatsapp_platform_billing_invoices where payment_id=v_payment_id;
  if v_count<>1 then raise exception 'Billing document QA failed: invoice issuance is not idempotent.'; end if;

  perform public.whatsapp_platform_record_billing_refund(v_refund_one,v_provider_payment_id,6000,'INR','processed','Partial refund','{}'::jsonb);
  if not exists(
    select 1 from public.whatsapp_platform_billing_credit_notes
    where invoice_id=v_invoice_id and provider_refund_id=v_refund_one
      and credit_note_number like 'TEST/CN/%' and total_paise=6000
  ) then
    raise exception 'Billing document QA failed: partial-refund credit note was not issued.';
  end if;
  if not exists(select 1 from public.whatsapp_platform_billing_invoices where id=v_invoice_id and status='partially_refunded') then
    raise exception 'Billing document QA failed: partial-refund invoice status is incorrect.';
  end if;

  perform public.whatsapp_platform_record_billing_refund(v_refund_one,v_provider_payment_id,6000,'INR','processed','Partial refund','{}'::jsonb);
  select count(*) into v_count from public.whatsapp_platform_billing_credit_notes where provider_refund_id=v_refund_one;
  if v_count<>1 then raise exception 'Billing document QA failed: credit-note issuance is not idempotent.'; end if;

  perform public.whatsapp_platform_record_billing_refund(v_refund_two,v_provider_payment_id,6000,'INR','processed','Final refund','{}'::jsonb);
  if not exists(select 1 from public.whatsapp_platform_billing_invoices where id=v_invoice_id and status='refunded') then
    raise exception 'Billing document QA failed: fully-refunded invoice status is incorrect.';
  end if;
  select count(*) into v_count from public.whatsapp_platform_billing_credit_notes where invoice_id=v_invoice_id;
  if v_count<>2 then raise exception 'Billing document QA failed: final refund did not issue exactly two credit notes.'; end if;

  delete from public.whatsapp_platform_billing_credit_notes where invoice_id=v_invoice_id;
  delete from public.whatsapp_platform_billing_refunds where invoice_id=v_invoice_id;
  delete from public.whatsapp_platform_billing_invoices where id=v_invoice_id;
  delete from public.whatsapp_platform_billing_payments where id=v_payment_id;
  delete from public.whatsapp_platform_billing_subscriptions where id=v_subscription_id;
  delete from public.whatsapp_platform_tenants where id=v_tenant_id;
end $$;
