-- Deployment-time adversarial assertions for webhook recovery and immutable
-- financial evidence. All QA rows are removed before the migration completes.

do $$
declare
  v_event_id uuid := gen_random_uuid();
  v_event public.whatsapp_platform_billing_webhook_events;
  v_tenant_id uuid := gen_random_uuid();
  v_subscription_id uuid;
  v_payment_id uuid;
  v_provider_payment_id text := 'pay_' || replace(gen_random_uuid()::text, '-', '');
  v_provider_invoice_id text := 'inv_' || replace(gen_random_uuid()::text, '-', '');
  v_provider_refund_id text := 'rfnd_' || replace(gen_random_uuid()::text, '-', '');
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);

  insert into public.whatsapp_platform_billing_webhook_events
    (id, provider_event_id, event_type, payload_sha256)
  values
    (v_event_id, 'qa-' || v_event_id::text, 'payment.captured', repeat('a', 64));

  v_event := public.whatsapp_platform_claim_billing_webhook_event(v_event_id);
  if v_event.processing_status <> 'processing' or v_event.attempt_count <> 1 then
    raise exception 'Billing recovery QA failed: first webhook claim was not atomic.';
  end if;
  if public.whatsapp_platform_claim_billing_webhook_event(v_event_id) is not null then
    raise exception 'Billing recovery QA failed: concurrent webhook claim was allowed.';
  end if;

  update public.whatsapp_platform_billing_webhook_events
  set processing_status = 'failed', processing_error = 'qa transient failure'
  where id = v_event_id;
  v_event := public.whatsapp_platform_claim_billing_webhook_event(v_event_id);
  if v_event.processing_status <> 'processing' or v_event.attempt_count <> 2 then
    raise exception 'Billing recovery QA failed: failed webhook was not reclaimable.';
  end if;
  update public.whatsapp_platform_billing_webhook_events
  set processing_status = 'processed', processed_at = now()
  where id = v_event_id;
  if public.whatsapp_platform_claim_billing_webhook_event(v_event_id) is not null then
    raise exception 'Billing recovery QA failed: processed webhook was reclaimed.';
  end if;

  insert into public.whatsapp_platform_tenants(id, name, slug, owner_email, status, plan_code)
  values(v_tenant_id, 'Billing recovery QA', 'billing-recovery-qa-' || replace(v_tenant_id::text, '-', ''), 'billing-recovery-qa@example.invalid', 'active', 'launch');
  insert into public.whatsapp_platform_billing_subscriptions
    (tenant_id, package_code, billing_interval, provider_plan_id, provider_subscription_id, status, quantity, total_count, paid_count, recurring_base_paise, gst_rate_bps, safe_metadata)
  values
    (v_tenant_id, 'launch', 'month', 'plan_recovery_qa', 'sub_recovery_qa_' || replace(v_tenant_id::text, '-', ''), 'active', 1, 12, 1, 10000, 1800, jsonb_build_object('mode', 'test'))
  returning id into v_subscription_id;
  insert into public.whatsapp_platform_billing_payments
    (tenant_id, subscription_id, provider_payment_id, provider_invoice_id, amount_paise, currency, status, captured, payment_method, paid_at)
  values
    (v_tenant_id, v_subscription_id, v_provider_payment_id, v_provider_invoice_id, 12000, 'INR', 'captured', true, 'upi', now())
  returning id into v_payment_id;

  begin
    update public.whatsapp_platform_billing_payments set amount_paise = 11999 where id = v_payment_id;
    raise exception 'Billing recovery QA failed: payment amount mutation was allowed.';
  exception when others then
    if sqlerrm = 'Billing recovery QA failed: payment amount mutation was allowed.' then raise; end if;
  end;

  perform public.whatsapp_platform_record_billing_refund(v_provider_refund_id, v_provider_payment_id, 6000, 'INR', 'processed', 'Billing recovery partial refund QA', '{}'::jsonb);
  begin
    perform public.whatsapp_platform_record_billing_refund('rfnd_' || replace(gen_random_uuid()::text, '-', ''), v_provider_payment_id, 7000, 'INR', 'processed', 'Billing recovery excess refund QA', '{}'::jsonb);
    raise exception 'Billing recovery QA failed: aggregate over-refund was allowed.';
  exception when others then
    if sqlerrm = 'Billing recovery QA failed: aggregate over-refund was allowed.' then raise; end if;
  end;
  begin
    perform public.whatsapp_platform_record_billing_refund('rfnd_' || replace(gen_random_uuid()::text, '-', ''), v_provider_payment_id, 1000, 'USD', 'processed', 'Billing recovery currency mismatch QA', '{}'::jsonb);
    raise exception 'Billing recovery QA failed: refund currency mismatch was allowed.';
  exception when others then
    if sqlerrm = 'Billing recovery QA failed: refund currency mismatch was allowed.' then raise; end if;
  end;

  delete from public.whatsapp_platform_billing_credit_notes where provider_payment_id = v_provider_payment_id;
  delete from public.whatsapp_platform_billing_refunds where payment_id = v_payment_id;
  delete from public.whatsapp_platform_billing_invoices where payment_id = v_payment_id;
  delete from public.whatsapp_platform_billing_payments where id = v_payment_id;
  delete from public.whatsapp_platform_billing_subscriptions where id = v_subscription_id;
  delete from public.whatsapp_platform_tenants where id = v_tenant_id;
  delete from public.whatsapp_platform_billing_webhook_events where id = v_event_id;
end;
$$;
