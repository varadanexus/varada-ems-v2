-- Deployment-time assertion for provider-success/local-write-failure safety.

do $$
declare v_tenant_id uuid:=gen_random_uuid();v_subscription_id uuid;v_payment_id uuid;v_request public.whatsapp_platform_billing_refund_requests;
begin
  insert into public.whatsapp_platform_tenants(id,name,slug,owner_email,status,plan_code)
  values(v_tenant_id,'Submitted refund QA','submitted-refund-qa-'||replace(v_tenant_id::text,'-',''),'submitted-refund-qa@example.invalid','active','launch');
  insert into public.whatsapp_platform_billing_subscriptions(tenant_id,package_code,billing_interval,provider_plan_id,provider_subscription_id,status,quantity,total_count,paid_count,recurring_base_paise,gst_rate_bps,safe_metadata)
  values(v_tenant_id,'launch','month','plan_submitted_refund_qa','sub_submitted_refund_qa_'||replace(v_tenant_id::text,'-',''),'active',1,12,1,10000,1800,jsonb_build_object('mode','test')) returning id into v_subscription_id;
  insert into public.whatsapp_platform_billing_payments(tenant_id,subscription_id,provider_payment_id,amount_paise,currency,status,captured,payment_method,paid_at)
  values(v_tenant_id,v_subscription_id,'pay_'||replace(gen_random_uuid()::text,'-',''),12000,'INR','captured',true,'upi',now()) returning id into v_payment_id;
  select * into v_request from public.whatsapp_platform_reserve_billing_refund(v_payment_id,7000,'Provider response persistence test',null);
  perform public.whatsapp_platform_finalize_billing_refund_request(v_request.id,'submitted','rfnd_'||replace(gen_random_uuid()::text,'-',''),'Simulated local ledger delay');
  begin
    perform public.whatsapp_platform_reserve_billing_refund(v_payment_id,6000,'This must exceed remaining balance',null);
    raise exception 'Submitted refund reservation QA failed: an unrecorded provider refund was released.';
  exception when others then
    if sqlerrm like 'Submitted refund reservation QA failed:%' then raise; end if;
  end;
  delete from public.whatsapp_platform_billing_refund_requests where payment_id=v_payment_id;
  delete from public.whatsapp_platform_billing_payments where id=v_payment_id;
  delete from public.whatsapp_platform_billing_subscriptions where id=v_subscription_id;
  delete from public.whatsapp_platform_tenants where id=v_tenant_id;
end $$;
