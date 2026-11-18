-- One authoritative payment-access decision for every customer Edge API.
-- Browser roles cannot call this function or read the private subscription
-- tables. Billing recovery remains available through the billing Edge Function.

create or replace function public.whatsapp_platform_billing_entitlement(p_tenant_id uuid)
returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare
  v_subscription public.whatsapp_platform_billing_subscriptions;
  v_trial_ends_at timestamptz;
begin
  if auth.role()<>'service_role' then
    raise exception 'Billing entitlement is server-only' using errcode='42501';
  end if;
  if not exists(select 1 from public.whatsapp_platform_tenants where id=p_tenant_id and status='active') then
    return jsonb_build_object('allowed',false,'state','workspace_inactive','reason','This workspace is inactive.');
  end if;

  select * into v_subscription
  from public.whatsapp_platform_billing_subscriptions s
  where s.tenant_id=p_tenant_id
    and s.status='active'
    and (s.current_end is null or s.current_end>now())
  order by coalesce(s.current_end,'infinity'::timestamptz) desc,s.updated_at desc
  limit 1;
  if found then
    return jsonb_build_object(
      'allowed',true,'state','paid','reason','Active paid subscription',
      'subscriptionId',v_subscription.id,'subscriptionStatus',v_subscription.status,
      'packageCode',v_subscription.package_code,'accessUntil',v_subscription.current_end,
      'cancelAtCycleEnd',v_subscription.cancel_at_cycle_end
    );
  end if;

  select * into v_subscription
  from public.whatsapp_platform_billing_subscriptions s
  where s.tenant_id=p_tenant_id and s.status='authenticated'
    and coalesce(s.safe_metadata->>'trial_days','') ~ '^[1-9][0-9]{0,2}$'
    and s.charge_at>now()
    and (s.checkout_verified_at is not null or exists(
      select 1 from public.whatsapp_platform_billing_checkout_quotes q
      where q.subscription_id=s.id and q.status='consumed'
    ))
  order by s.charge_at desc,s.updated_at desc
  limit 1;
  if found then
    v_trial_ends_at:=v_subscription.charge_at;
    return jsonb_build_object(
      'allowed',true,'state','trial','reason','Authorized free trial',
      'subscriptionId',v_subscription.id,'subscriptionStatus',v_subscription.status,
      'packageCode',v_subscription.package_code,'trialEndsAt',v_trial_ends_at,
      'accessUntil',v_trial_ends_at,'cancelAtCycleEnd',v_subscription.cancel_at_cycle_end
    );
  end if;

  return jsonb_build_object(
    'allowed',false,'state','payment_required',
    'reason','A valid authorized trial or active paid subscription is required.',
    'recoveryPath','/whatsapp-platform/workspace/billing/'
  );
end; $$;

revoke all on function public.whatsapp_platform_billing_entitlement(uuid) from public,anon,authenticated;
grant execute on function public.whatsapp_platform_billing_entitlement(uuid) to service_role;

comment on function public.whatsapp_platform_billing_entitlement(uuid) is
  'Server-only source of truth for paid workspace access. Allows an active paid period or a provider-authorized, unexpired trial.';

notify pgrst, 'reload schema';
