-- Immutable reconciliation evidence for moving cancelled legacy subscriptions
-- into PAYG. This migration records decisions only; it never activates a wallet,
-- changes a balance, refunds a payment or rewrites historical subscriptions.

create table public.whatsapp_platform_payg_subscription_reconciliations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.whatsapp_platform_tenants(id) on delete restrict,
  mode text not null check (mode in ('test','live')),
  subscription_id uuid not null references public.whatsapp_platform_billing_subscriptions(id) on delete restrict,
  outcome text not null check (outcome in ('test_only_no_live_value','paid_period_expired')),
  actor_id uuid not null,
  evidence_reference text not null check (length(trim(evidence_reference)) between 5 and 1000),
  reason text not null check (length(trim(reason)) between 10 and 1000),
  source_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique (subscription_id, mode)
);

create index whatsapp_payg_subscription_reconciliation_tenant
  on public.whatsapp_platform_payg_subscription_reconciliations(tenant_id,mode,created_at desc);

alter table public.whatsapp_platform_payg_subscription_reconciliations enable row level security;
revoke all on public.whatsapp_platform_payg_subscription_reconciliations from public,anon,authenticated;
grant select on public.whatsapp_platform_payg_subscription_reconciliations to service_role;

create trigger whatsapp_payg_subscription_reconciliation_immutable
before update or delete on public.whatsapp_platform_payg_subscription_reconciliations
for each row execute function public.whatsapp_wallet_ledger_immutable();

create or replace function public.whatsapp_payg_reconcile_legacy_subscription(
  p_tenant uuid,
  p_mode text,
  p_subscription uuid,
  p_actor uuid,
  p_outcome text,
  p_evidence_reference text,
  p_reason text,
  p_confirmed boolean
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  s public.whatsapp_platform_billing_subscriptions;
  existing_row public.whatsapp_platform_payg_subscription_reconciliations;
  created_row public.whatsapp_platform_payg_subscription_reconciliations;
  payment_count integer;
  captured_total bigint;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Server only' using errcode='42501';
  end if;
  if p_actor is null or p_confirmed is not true then raise exception 'Confirmed staff reconciliation required'; end if;
  if p_mode not in ('test','live') then raise exception 'Valid provider mode required'; end if;
  if p_outcome not in ('test_only_no_live_value','paid_period_expired') then raise exception 'Supported reconciliation outcome required'; end if;
  if coalesce(length(trim(p_evidence_reference)),0) not between 5 and 1000 then raise exception 'Evidence reference required'; end if;
  if coalesce(length(trim(p_reason)),0) not between 10 and 1000 then raise exception 'Meaningful reconciliation reason required'; end if;

  perform 1 from public.whatsapp_platform_tenants where id=p_tenant and status='active' for update;
  if not found then raise exception 'Active workspace required'; end if;
  select * into s from public.whatsapp_platform_billing_subscriptions
   where id=p_subscription and tenant_id=p_tenant for update;
  if s.id is null then raise exception 'Legacy subscription not found for this workspace'; end if;
  if coalesce(s.safe_metadata->>'mode','') is distinct from p_mode then raise exception 'Subscription provider mode mismatch'; end if;
  if lower(coalesce(s.status,'')) not in ('cancelled','completed','expired') then raise exception 'Only terminal legacy subscriptions can be reconciled'; end if;
  if s.subscription_kind='addon' and s.addon_code in ('extra_agent_seat','extra_whatsapp_number','extra_integration') then
    raise exception 'Retained paid capacity must be reconciled through its capacity period';
  end if;
  if p_outcome='paid_period_expired' and (s.current_end is null or s.current_end>now()) then
    raise exception 'The stored paid-through period has not expired';
  end if;

  select * into existing_row from public.whatsapp_platform_payg_subscription_reconciliations
   where subscription_id=p_subscription and mode=p_mode;
  if existing_row.id is not null then
    if existing_row.outcome=p_outcome and existing_row.evidence_reference=trim(p_evidence_reference)
      and existing_row.reason=trim(p_reason) then
      return jsonb_build_object('reconciliation',to_jsonb(existing_row),'changed',false);
    end if;
    raise exception 'This legacy subscription already has immutable transition evidence';
  end if;

  select count(*)::integer,coalesce(sum(case when captured and status='captured' then amount_paise else 0 end),0)::bigint
    into payment_count,captured_total
    from public.whatsapp_platform_billing_payments where subscription_id=s.id;

  if p_outcome='test_only_no_live_value' and (s.paid_count<>0 or captured_total<>0) then
    raise exception 'Captured or paid legacy value cannot be dismissed as Test-only';
  end if;

  insert into public.whatsapp_platform_payg_subscription_reconciliations(
    tenant_id,mode,subscription_id,outcome,actor_id,evidence_reference,reason,source_snapshot
  ) values (
    p_tenant,p_mode,s.id,p_outcome,p_actor,trim(p_evidence_reference),trim(p_reason),
    jsonb_build_object('subscription',to_jsonb(s),'linkedPaymentCount',payment_count,'capturedAmountPaise',captured_total)
  ) returning * into created_row;
  return jsonb_build_object('reconciliation',to_jsonb(created_row),'changed',true);
end;
$$;

revoke all on function public.whatsapp_payg_reconcile_legacy_subscription(uuid,text,uuid,uuid,text,text,text,boolean)
  from public,anon,authenticated;
grant execute on function public.whatsapp_payg_reconcile_legacy_subscription(uuid,text,uuid,uuid,text,text,text,boolean)
  to service_role;

create or replace function public.whatsapp_wallet_set_activation(
  p_tenant uuid,
  p_mode text,
  p_actor uuid,
  p_enabled boolean,
  p_reason text,
  p_evidence_reference text,
  p_confirmed boolean
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  before_row public.whatsapp_platform_wallets;
  after_row public.whatsapp_platform_wallets;
  runtime_mode text;
  current_count integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Server only' using errcode='42501'; end if;
  if p_actor is null or coalesce(length(trim(p_reason)),0) not between 10 and 1000 then raise exception 'Actor and meaningful activation reason required'; end if;
  if p_mode not in ('test','live') or p_enabled is null or p_confirmed is not true then raise exception 'Confirmed wallet mode and activation state required'; end if;
  if p_mode='live' and coalesce(length(trim(p_evidence_reference)),0) not between 5 and 1000 then raise exception 'Live transition evidence reference required'; end if;
  perform 1 from public.whatsapp_platform_tenants where id=p_tenant and status='active' for update;
  if not found then raise exception 'Active workspace required'; end if;
  select * into before_row from public.whatsapp_platform_wallets where tenant_id=p_tenant and mode=p_mode for update;
  if before_row.tenant_id is null then raise exception 'Wallet is not configured in this mode'; end if;
  if p_enabled then
    select provider_mode into runtime_mode from public.whatsapp_platform_billing_runtime where singleton=true;
    if runtime_mode is distinct from p_mode then raise exception 'Billing runtime and wallet activation mode do not match'; end if;
    if before_row.currency not in ('INR','USD') then raise exception 'Only verified INR or USD wallet currencies can be activated'; end if;
    select count(*) into current_count from public.whatsapp_platform_wallet_fx where currency=before_row.currency and valid_from<=now() and valid_until>now();
    if current_count<>1 then raise exception 'Exactly one current wallet exchange-rate record required'; end if;
    select count(*) into current_count from public.whatsapp_platform_wallet_charge_policies where tenant_id=p_tenant and mode=p_mode and currency=before_row.currency and valid_from<=now() and valid_until>now();
    if current_count<>1 then raise exception 'Exactly one current recharge charge policy required'; end if;
    perform public.whatsapp_wallet_resolve_message_price(p_tenant,now());
    if exists(select 1 from public.whatsapp_platform_wallet_events where tenant_id=p_tenant and mode=p_mode and processing_status='pending') then raise exception 'Pending wallet events must be reconciled before activation'; end if;
    if exists(select 1 from public.whatsapp_platform_wallet_recharges where tenant_id=p_tenant and mode=p_mode and state<>'captured' and (provider_order_id is not null or order_creation_started_at is not null)) then raise exception 'Unresolved provider recharge must be reconciled before activation'; end if;
    if p_mode='live' then
      if exists(select 1 from public.whatsapp_platform_billing_subscriptions where tenant_id=p_tenant and coalesce(safe_metadata->>'mode','') not in ('test','live')) then raise exception 'Subscription provider mode must be verified before Live activation'; end if;
      if exists(
        select 1 from public.whatsapp_platform_billing_subscriptions s
        where s.tenant_id=p_tenant and s.safe_metadata->>'mode'='live'
          and (s.subscription_kind='package' or s.subscription_kind<>'addon' or s.addon_code not in ('extra_agent_seat','extra_whatsapp_number','extra_integration'))
          and (lower(coalesce(s.status,'')) not in ('cancelled','completed','expired') or (
            (s.current_end is null or s.current_end>now()) and not exists (
            select 1 from public.whatsapp_platform_payg_subscription_reconciliations r
            where r.tenant_id=s.tenant_id and r.mode='live' and r.subscription_id=s.id
              and r.source_snapshot->'subscription'=to_jsonb(s)
              and r.outcome='test_only_no_live_value' and s.paid_count=0
              and not exists(select 1 from public.whatsapp_platform_billing_payments p where p.subscription_id=s.id and p.captured and p.status='captured' and p.amount_paise>0)
          )))
      ) then raise exception 'Live package or included-feature subscription must be cancelled and paid-through service reconciled before activation'; end if;
    end if;
  end if;
  if before_row.enabled is not distinct from p_enabled then return jsonb_build_object('wallet',to_jsonb(before_row),'changed',false); end if;
  update public.whatsapp_platform_wallets set enabled=p_enabled,enabled_at=case when p_enabled then now() else null end,updated_at=now()
   where tenant_id=p_tenant and mode=p_mode returning * into after_row;
  insert into public.whatsapp_platform_wallet_config_audit(tenant_id,mode,actor_id,action,reason,evidence_reference,before_values,after_values)
   values(p_tenant,p_mode,p_actor,case when p_enabled then 'activate_'||p_mode else 'deactivate_'||p_mode end,trim(p_reason),nullif(trim(p_evidence_reference),''),to_jsonb(before_row),to_jsonb(after_row));
  return jsonb_build_object('wallet',to_jsonb(after_row),'changed',true);
end;
$$;

revoke all on function public.whatsapp_wallet_set_activation(uuid,text,uuid,boolean,text,text,boolean) from public,anon,authenticated;
grant execute on function public.whatsapp_wallet_set_activation(uuid,text,uuid,boolean,text,text,boolean) to service_role;

notify pgrst,'reload schema';
