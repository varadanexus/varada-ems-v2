-- Deployment-time proof that test subscriptions cannot grant live entitlement
-- and live subscriptions cannot grant test entitlement.

do $$
declare
  v_tenant_id uuid:=gen_random_uuid();
  v_original_mode text;
  v_result jsonb;
begin
  perform set_config('request.jwt.claim.role','service_role',true);
  select provider_mode into v_original_mode
  from public.whatsapp_platform_billing_runtime where singleton=true for update;

  insert into public.whatsapp_platform_tenants(id,name,slug,owner_email,status,plan_code)
  values(v_tenant_id,'Billing mode migration QA','billing-mode-qa-'||replace(v_tenant_id::text,'-',''),'billing-mode-qa@example.invalid','active','launch');

  insert into public.whatsapp_platform_billing_subscriptions
    (tenant_id,package_code,billing_interval,provider_plan_id,provider_subscription_id,status,quantity,total_count,paid_count,current_start,current_end,activated_at,safe_metadata)
  values
    (v_tenant_id,'launch','month','plan_mode_test_qa','sub_mode_test_'||replace(v_tenant_id::text,'-',''),'active',1,12,1,now()-interval '1 day',now()+interval '29 days',now()-interval '1 day',jsonb_build_object('mode','test'));

  update public.whatsapp_platform_billing_runtime set provider_mode='live',changed_at=now() where singleton=true;
  v_result:=public.whatsapp_platform_billing_entitlement(v_tenant_id);
  if coalesce((v_result->>'allowed')::boolean,true) or v_result->>'mode'<>'live' then
    raise exception 'Billing mode QA failed: test subscription granted live access (%).',v_result;
  end if;

  insert into public.whatsapp_platform_billing_subscriptions
    (tenant_id,package_code,billing_interval,provider_plan_id,provider_subscription_id,status,quantity,total_count,paid_count,current_start,current_end,activated_at,safe_metadata)
  values
    (v_tenant_id,'launch','month','plan_mode_live_qa','sub_mode_live_'||replace(v_tenant_id::text,'-',''),'active',1,12,1,now()-interval '1 day',now()+interval '29 days',now()-interval '1 day',jsonb_build_object('mode','live'));
  v_result:=public.whatsapp_platform_billing_entitlement(v_tenant_id);
  if not coalesce((v_result->>'allowed')::boolean,false) or v_result->>'mode'<>'live' or v_result->>'state'<>'paid' then
    raise exception 'Billing mode QA failed: live subscription did not grant live access (%).',v_result;
  end if;

  update public.whatsapp_platform_billing_runtime set provider_mode='test',changed_at=now() where singleton=true;
  v_result:=public.whatsapp_platform_billing_entitlement(v_tenant_id);
  if not coalesce((v_result->>'allowed')::boolean,false) or v_result->>'mode'<>'test' or v_result->>'state'<>'paid' then
    raise exception 'Billing mode QA failed: test subscription did not grant test access (%).',v_result;
  end if;

  delete from public.whatsapp_platform_billing_subscriptions where tenant_id=v_tenant_id;
  delete from public.whatsapp_platform_tenants where id=v_tenant_id;
  update public.whatsapp_platform_billing_runtime
  set provider_mode=coalesce(v_original_mode,'test'),changed_at=now() where singleton=true;
end $$;
