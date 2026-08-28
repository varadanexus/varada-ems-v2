-- Deployment-time assertions for auditable, single-flight add-on replacements.

do $$
declare
  v_tenant_id uuid:=gen_random_uuid();
  v_from_id uuid;
  v_replacement_id uuid;
  v_replacement_2_id uuid;
  v_intent_id uuid;
begin
  insert into public.whatsapp_platform_tenants(id,name,slug,owner_email,status,plan_code)
  values(v_tenant_id,'Add-on proration QA','addon-proration-qa-'||replace(v_tenant_id::text,'-',''),'addon-proration-qa@example.invalid','active','launch');
  insert into public.whatsapp_platform_billing_subscriptions
    (tenant_id,package_code,billing_interval,provider_plan_id,provider_subscription_id,status,quantity,total_count,paid_count,current_start,current_end,activated_at,recurring_base_paise)
  values
    (v_tenant_id,'launch','month','plan_addon_from_qa','sub_addon_from_'||replace(v_tenant_id::text,'-',''),'active',1,12,1,now()-interval '1 day',now()+interval '29 days',now()-interval '1 day',99900)
  returning id into v_from_id;
  insert into public.whatsapp_platform_billing_subscriptions
    (tenant_id,package_code,billing_interval,provider_plan_id,provider_subscription_id,status,quantity,total_count,paid_count,charge_at,recurring_base_paise)
  values
    (v_tenant_id,'launch','month','plan_addon_target_qa','sub_addon_target_'||replace(v_tenant_id::text,'-',''),'authenticated',1,12,0,now()+interval '29 days',119900)
  returning id into v_replacement_id;
  insert into public.whatsapp_platform_billing_subscriptions
    (tenant_id,package_code,billing_interval,provider_plan_id,provider_subscription_id,status,quantity,total_count,paid_count,charge_at,recurring_base_paise)
  values
    (v_tenant_id,'launch','month','plan_addon_target_2_qa','sub_addon_target_2_'||replace(v_tenant_id::text,'-',''),'created',1,12,0,now()+interval '29 days',109900)
  returning id into v_replacement_2_id;
  insert into public.whatsapp_platform_billing_addon_change_intents
    (tenant_id,from_subscription_id,replacement_subscription_id,package_code,billing_interval,currency,cycle_end,billable_remaining_days,before_selections,target_selections,current_recurring_base_paise,target_recurring_base_paise,incremental_recurring_base_paise,prorated_base_paise,gst_paise,gateway_adjustment_paise,checkout_amount_paise)
  values
    (v_tenant_id,v_from_id,v_replacement_id,'launch','month','INR',now()+interval '29 days',29,'[]'::jsonb,jsonb_build_array(jsonb_build_object('code','extra_agent_seat','quantity',1)),99900,119900,20000,19333,3480,552,23365)
  returning id into v_intent_id;
  if not exists(select 1 from public.whatsapp_platform_billing_addon_change_intents where id=v_intent_id and status='checkout_pending') then
    raise exception 'Add-on proration QA failed: intent was not recorded.';
  end if;
  begin
    insert into public.whatsapp_platform_billing_addon_change_intents
      (tenant_id,from_subscription_id,replacement_subscription_id,package_code,billing_interval,currency,cycle_end,billable_remaining_days,target_selections,current_recurring_base_paise,target_recurring_base_paise,incremental_recurring_base_paise,prorated_base_paise,gst_paise,gateway_adjustment_paise,checkout_amount_paise)
    values
      (v_tenant_id,v_from_id,v_replacement_2_id,'launch','month','INR',now()+interval '29 days',29,'[]'::jsonb,99900,109900,10000,9667,1740,276,11683);
    raise exception 'Add-on proration QA failed: duplicate open intent was allowed.';
  exception when unique_violation then
    null;
  end;
  update public.whatsapp_platform_billing_addon_change_intents set status='completed',completed_at=now() where id=v_intent_id;
  if not exists(select 1 from public.whatsapp_platform_billing_addon_change_intents where id=v_intent_id and status='completed' and completed_at is not null) then
    raise exception 'Add-on proration QA failed: completion transition was not persisted.';
  end if;
  delete from public.whatsapp_platform_billing_addon_change_intents where id=v_intent_id;
  delete from public.whatsapp_platform_billing_subscriptions where id in(v_from_id,v_replacement_id,v_replacement_2_id);
  delete from public.whatsapp_platform_tenants where id=v_tenant_id;
end $$;
