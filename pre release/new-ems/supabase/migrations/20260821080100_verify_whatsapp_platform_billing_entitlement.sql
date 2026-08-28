-- Deployment-time assertions for the paid-access invariant. All QA rows are
-- created and removed inside this migration transaction.

do $$
declare
  v_tenant_id uuid:=gen_random_uuid();
  v_subscription_id uuid;
  v_result jsonb;
begin
  perform set_config('request.jwt.claim.role','service_role',true);
  insert into public.whatsapp_platform_tenants(id,name,slug,owner_email,status,plan_code)
  values(v_tenant_id,'Billing gate migration QA','billing-gate-qa-'||replace(v_tenant_id::text,'-',''),'billing-gate-qa@example.invalid','active','launch');

  v_result:=public.whatsapp_platform_billing_entitlement(v_tenant_id);
  if coalesce((v_result->>'allowed')::boolean,true) or v_result->>'state'<>'payment_required' then
    raise exception 'Billing gate QA failed: unpaid workspace was allowed (%).',v_result;
  end if;

  insert into public.whatsapp_platform_billing_subscriptions
    (tenant_id,package_code,billing_interval,provider_plan_id,provider_subscription_id,status,quantity,total_count,paid_count,current_start,current_end,activated_at)
  values
    (v_tenant_id,'launch','month','plan_billing_gate_qa','sub_billing_gate_'||replace(v_tenant_id::text,'-',''),'active',1,12,1,now()-interval '1 day',now()+interval '29 days',now()-interval '1 day')
  returning id into v_subscription_id;
  v_result:=public.whatsapp_platform_billing_entitlement(v_tenant_id);
  if not coalesce((v_result->>'allowed')::boolean,false) or v_result->>'state'<>'paid' then
    raise exception 'Billing gate QA failed: active paid workspace was denied (%).',v_result;
  end if;

  update public.whatsapp_platform_billing_subscriptions
  set status='authenticated',current_start=null,current_end=null,activated_at=null,
      charge_at=now()+interval '14 days',checkout_verified_at=now(),safe_metadata=jsonb_build_object('trial_days',14)
  where id=v_subscription_id;
  v_result:=public.whatsapp_platform_billing_entitlement(v_tenant_id);
  if not coalesce((v_result->>'allowed')::boolean,false) or v_result->>'state'<>'trial' then
    raise exception 'Billing gate QA failed: authorized trial was denied (%).',v_result;
  end if;

  update public.whatsapp_platform_billing_subscriptions set charge_at=now()-interval '1 second' where id=v_subscription_id;
  v_result:=public.whatsapp_platform_billing_entitlement(v_tenant_id);
  if coalesce((v_result->>'allowed')::boolean,true) or v_result->>'state'<>'payment_required' then
    raise exception 'Billing gate QA failed: expired trial was allowed (%).',v_result;
  end if;

  delete from public.whatsapp_platform_billing_subscriptions where id=v_subscription_id;
  delete from public.whatsapp_platform_tenants where id=v_tenant_id;
end $$;
