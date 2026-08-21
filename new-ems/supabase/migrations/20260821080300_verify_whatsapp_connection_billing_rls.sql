-- Deployment-time assertions for the payment-aware connection RLS predicate.

do $$
declare
  v_tenant_id uuid:=gen_random_uuid();
  v_auth_user_id uuid:=gen_random_uuid();
  v_subscription_id uuid;
  v_policy_qual text;
begin
  insert into public.whatsapp_platform_tenants(id,name,slug,owner_email,status,plan_code)
  values(v_tenant_id,'Connection billing RLS QA','connection-billing-rls-qa-'||replace(v_tenant_id::text,'-',''),'connection-billing-rls-qa@example.invalid','active','launch');
  insert into public.whatsapp_platform_users(auth_user_id,tenant_id,display_name,email,password_hash,role_code,status)
  values(v_auth_user_id,v_tenant_id,'Billing RLS QA','connection-billing-rls-qa@example.invalid','not-a-login-credential','owner','active');

  perform set_config('request.jwt.claim.sub',v_auth_user_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  if public.current_whatsapp_platform_billing_entitled() then
    raise exception 'Connection RLS QA failed: unpaid identity was entitled.';
  end if;

  insert into public.whatsapp_platform_billing_subscriptions
    (tenant_id,package_code,billing_interval,provider_plan_id,provider_subscription_id,status,quantity,total_count,paid_count,current_start,current_end,activated_at)
  values
    (v_tenant_id,'launch','month','plan_connection_rls_qa','sub_connection_rls_'||replace(v_tenant_id::text,'-',''),'active',1,12,1,now()-interval '1 day',now()+interval '29 days',now()-interval '1 day')
  returning id into v_subscription_id;
  if not public.current_whatsapp_platform_billing_entitled() then
    raise exception 'Connection RLS QA failed: active paid identity was denied.';
  end if;

  select qual into v_policy_qual
  from pg_policies
  where schemaname='public' and tablename='whatsapp_platform_connections' and policyname='whatsapp_platform_connection_read';
  if coalesce(v_policy_qual,'') not like '%current_whatsapp_platform_billing_entitled%' then
    raise exception 'Connection RLS QA failed: payment predicate is absent from the read policy.';
  end if;

  delete from public.whatsapp_platform_billing_subscriptions where id=v_subscription_id;
  delete from public.whatsapp_platform_users where tenant_id=v_tenant_id;
  delete from public.whatsapp_platform_tenants where id=v_tenant_id;
end $$;
