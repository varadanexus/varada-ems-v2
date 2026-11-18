-- Keep Razorpay test evidence available for audit without allowing it to grant
-- production entitlement after the provider credentials are switched to live.

create table if not exists public.whatsapp_platform_billing_runtime (
  singleton boolean primary key default true check (singleton),
  provider_mode text not null default 'test' check (provider_mode in ('test','live')),
  changed_at timestamptz not null default now(),
  changed_by uuid references public.app_users(id) on delete set null
);

insert into public.whatsapp_platform_billing_runtime(singleton,provider_mode)
values(true,'test') on conflict(singleton) do nothing;

alter table public.whatsapp_platform_billing_runtime enable row level security;
revoke all on table public.whatsapp_platform_billing_runtime from public,anon,authenticated;
grant select,insert,update on table public.whatsapp_platform_billing_runtime to service_role;

update public.whatsapp_platform_billing_subscriptions
set safe_metadata=jsonb_set(safe_metadata,'{mode}','"test"'::jsonb,true)
where coalesce(safe_metadata->>'mode','') not in ('test','live');

update public.whatsapp_platform_billing_payments p
set safe_metadata=jsonb_set(
  p.safe_metadata,'{mode}',to_jsonb(coalesce(s.safe_metadata->>'mode','test')),true
)
from public.whatsapp_platform_billing_subscriptions s
where s.id=p.subscription_id
  and coalesce(p.safe_metadata->>'mode','') not in ('test','live');

create or replace function public.whatsapp_platform_billing_entitlement(p_tenant_id uuid)
returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare
  v_subscription public.whatsapp_platform_billing_subscriptions;
  v_trial_ends_at timestamptz;
  v_mode text;
begin
  if auth.role()<>'service_role' then
    raise exception 'Billing entitlement is server-only' using errcode='42501';
  end if;
  select provider_mode into v_mode from public.whatsapp_platform_billing_runtime where singleton=true;
  v_mode:=coalesce(v_mode,'test');
  if not exists(select 1 from public.whatsapp_platform_tenants where id=p_tenant_id and status='active') then
    return jsonb_build_object('allowed',false,'state','workspace_inactive','reason','This workspace is inactive.','mode',v_mode);
  end if;

  select * into v_subscription
  from public.whatsapp_platform_billing_subscriptions s
  where s.tenant_id=p_tenant_id and s.status='active'
    and coalesce(s.safe_metadata->>'mode','test')=v_mode
    and (s.current_end is null or s.current_end>now())
  order by coalesce(s.current_end,'infinity'::timestamptz) desc,s.updated_at desc limit 1;
  if found then
    return jsonb_build_object(
      'allowed',true,'state','paid','reason','Active paid subscription','mode',v_mode,
      'subscriptionId',v_subscription.id,'subscriptionStatus',v_subscription.status,
      'packageCode',v_subscription.package_code,'accessUntil',v_subscription.current_end,
      'cancelAtCycleEnd',v_subscription.cancel_at_cycle_end
    );
  end if;

  select * into v_subscription
  from public.whatsapp_platform_billing_subscriptions s
  where s.tenant_id=p_tenant_id and s.status='authenticated'
    and coalesce(s.safe_metadata->>'mode','test')=v_mode
    and coalesce(s.safe_metadata->>'trial_days','') ~ '^[1-9][0-9]{0,2}$'
    and s.charge_at>now()
    and (s.checkout_verified_at is not null or exists(
      select 1 from public.whatsapp_platform_billing_checkout_quotes q
      where q.subscription_id=s.id and q.status='consumed'
    ))
  order by s.charge_at desc,s.updated_at desc limit 1;
  if found then
    v_trial_ends_at:=v_subscription.charge_at;
    return jsonb_build_object(
      'allowed',true,'state','trial','reason','Authorized free trial','mode',v_mode,
      'subscriptionId',v_subscription.id,'subscriptionStatus',v_subscription.status,
      'packageCode',v_subscription.package_code,'trialEndsAt',v_trial_ends_at,
      'accessUntil',v_trial_ends_at,'cancelAtCycleEnd',v_subscription.cancel_at_cycle_end
    );
  end if;

  return jsonb_build_object(
    'allowed',false,'state','payment_required','mode',v_mode,
    'reason',case when v_mode='live'
      then 'A live payment authorization or active live subscription is required.'
      else 'A valid authorized trial or active paid subscription is required.' end,
    'recoveryPath','/whatsapp-platform/workspace/billing/'
  );
end; $$;

revoke all on function public.whatsapp_platform_billing_entitlement(uuid) from public,anon,authenticated;
grant execute on function public.whatsapp_platform_billing_entitlement(uuid) to service_role;

comment on table public.whatsapp_platform_billing_runtime is
  'Server-only Razorpay operating mode. Entitlements fail closed across test/live credential rotation.';

notify pgrst, 'reload schema';
