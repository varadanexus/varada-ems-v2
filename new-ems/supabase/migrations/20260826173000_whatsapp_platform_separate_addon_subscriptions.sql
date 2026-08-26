-- Keep the master package subscription and recurring add-on subscriptions
-- independent. Add-ons may share the package renewal boundary, but they never
-- replace, cancel, or mutate the package subscription.

alter table public.whatsapp_platform_billing_subscriptions
  add column if not exists subscription_kind text not null default 'package',
  add column if not exists addon_code text references public.whatsapp_platform_addon_master(code) on delete restrict,
  add column if not exists addon_quantity integer,
  add column if not exists parent_subscription_id uuid references public.whatsapp_platform_billing_subscriptions(id) on delete cascade;

alter table public.whatsapp_platform_billing_subscriptions
  drop constraint if exists whatsapp_platform_billing_subscriptions_kind_check,
  add constraint whatsapp_platform_billing_subscriptions_kind_check
    check (subscription_kind in ('package','addon')),
  drop constraint if exists whatsapp_platform_billing_subscriptions_addon_shape_check,
  add constraint whatsapp_platform_billing_subscriptions_addon_shape_check
    check (
      (subscription_kind = 'package' and addon_code is null and addon_quantity is null and parent_subscription_id is null)
      or
      (subscription_kind = 'addon' and addon_code is not null and addon_quantity is not null and addon_quantity > 0 and parent_subscription_id is not null)
    );

create index if not exists whatsapp_platform_billing_subscriptions_kind_idx
  on public.whatsapp_platform_billing_subscriptions(tenant_id, subscription_kind, created_at desc);
create index if not exists whatsapp_platform_billing_addon_subscriptions_idx
  on public.whatsapp_platform_billing_subscriptions(tenant_id, addon_code, created_at desc)
  where subscription_kind = 'addon';

alter table public.whatsapp_platform_billing_addon_change_intents
  add column if not exists addon_code text references public.whatsapp_platform_addon_master(code) on delete restrict,
  add column if not exists from_addon_subscription_id uuid references public.whatsapp_platform_billing_subscriptions(id) on delete restrict;

update public.whatsapp_platform_billing_addon_change_intents i
set addon_code = i.target_selections->0->>'code'
where i.addon_code is null
  and jsonb_array_length(i.target_selections) = 1;

drop index if exists public.whatsapp_platform_addon_change_intents_open_uidx;
create unique index if not exists whatsapp_platform_addon_change_intents_open_uidx
  on public.whatsapp_platform_billing_addon_change_intents(tenant_id, addon_code)
  where status in ('checkout_pending','processing') and addon_code is not null;

comment on column public.whatsapp_platform_billing_subscriptions.subscription_kind is
  'package is the master plan; addon is a separately cancellable recurring add-on subscription.';
comment on column public.whatsapp_platform_billing_subscriptions.parent_subscription_id is
  'Package subscription that establishes eligibility and renewal boundary for an independent add-on subscription.';

create or replace function public.whatsapp_platform_billing_entitlement(p_tenant_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_subscription public.whatsapp_platform_billing_subscriptions; v_trial_ends_at timestamptz;
begin
  if auth.role()<>'service_role' then raise exception 'Billing entitlement is server-only' using errcode='42501'; end if;
  if not exists(select 1 from public.whatsapp_platform_tenants where id=p_tenant_id and status='active') then
    return jsonb_build_object('allowed',false,'state','workspace_inactive','reason','This workspace is inactive.');
  end if;
  select * into v_subscription from public.whatsapp_platform_billing_subscriptions s
  where s.tenant_id=p_tenant_id and s.subscription_kind='package' and s.status='active'
    and (s.current_end is null or s.current_end>now())
  order by coalesce(s.current_end,'infinity'::timestamptz) desc,s.updated_at desc limit 1;
  if found then return jsonb_build_object('allowed',true,'state','paid','reason','Active paid subscription','subscriptionId',v_subscription.id,'subscriptionStatus',v_subscription.status,'packageCode',v_subscription.package_code,'accessUntil',v_subscription.current_end,'cancelAtCycleEnd',v_subscription.cancel_at_cycle_end); end if;
  select * into v_subscription from public.whatsapp_platform_billing_subscriptions s
  where s.tenant_id=p_tenant_id and s.subscription_kind='package' and s.status='authenticated'
    and coalesce(s.safe_metadata->>'trial_days','') ~ '^[1-9][0-9]{0,2}$' and s.charge_at>now()
    and (s.checkout_verified_at is not null or exists(select 1 from public.whatsapp_platform_billing_checkout_quotes q where q.subscription_id=s.id and q.status='consumed'))
  order by s.charge_at desc,s.updated_at desc limit 1;
  if found then v_trial_ends_at:=v_subscription.charge_at; return jsonb_build_object('allowed',true,'state','trial','reason','Authorized free trial','subscriptionId',v_subscription.id,'subscriptionStatus',v_subscription.status,'packageCode',v_subscription.package_code,'trialEndsAt',v_trial_ends_at,'accessUntil',v_trial_ends_at,'cancelAtCycleEnd',v_subscription.cancel_at_cycle_end); end if;
  return jsonb_build_object('allowed',false,'state','payment_required','reason','A valid authorized trial or active paid subscription is required.','recoveryPath','/whatsapp-platform/workspace/billing/');
end; $$;

revoke all on function public.whatsapp_platform_billing_entitlement(uuid) from public,anon,authenticated;
grant execute on function public.whatsapp_platform_billing_entitlement(uuid) to service_role;
notify pgrst, 'reload schema';
