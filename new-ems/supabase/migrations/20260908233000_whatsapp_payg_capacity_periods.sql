-- Append-only paid-period evidence for standalone capacity subscriptions.
-- Does not alter legacy tenant_addons or grant capacity merely on authorization.
create table public.whatsapp_platform_payg_capacity_periods (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.whatsapp_platform_tenants(id),
  mode text not null check(mode in ('test','live')),
  subscription_id uuid not null references public.whatsapp_platform_billing_subscriptions(id),
  addon_code text not null check(addon_code in ('extra_agent_seat','extra_whatsapp_number','extra_integration')),
  quantity integer not null check(quantity>0),
  provider_payment_id text not null,
  paid_from timestamptz not null,
  paid_until timestamptz not null check(paid_until>paid_from),
  evidence jsonb not null,
  created_at timestamptz not null default now(),
  unique(mode,provider_payment_id),
  unique(subscription_id,paid_from)
);
alter table public.whatsapp_platform_payg_capacity_periods enable row level security;
revoke all on public.whatsapp_platform_payg_capacity_periods from public,anon,authenticated;
grant select on public.whatsapp_platform_payg_capacity_periods to service_role;
create trigger whatsapp_payg_capacity_period_immutable before update or delete on public.whatsapp_platform_payg_capacity_periods
for each row execute function public.whatsapp_wallet_fx_immutable();

create table public.whatsapp_platform_payg_capacity_corrections (
  period_id uuid primary key references public.whatsapp_platform_payg_capacity_periods(id),
  actor_id uuid not null,
  reason text not null check(length(trim(reason)) between 10 and 1000),
  evidence_reference text not null check(length(trim(evidence_reference)) between 5 and 1000),
  effective_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.whatsapp_platform_payg_capacity_corrections enable row level security;
revoke all on public.whatsapp_platform_payg_capacity_corrections from public,anon,authenticated;
grant select on public.whatsapp_platform_payg_capacity_corrections to service_role;
create trigger whatsapp_payg_capacity_correction_immutable before update or delete on public.whatsapp_platform_payg_capacity_corrections
for each row execute function public.whatsapp_wallet_fx_immutable();

create function public.whatsapp_payg_correct_capacity_period(p_tenant uuid,p_mode text,p_period uuid,p_actor uuid,p_reason text,p_reference text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result public.whatsapp_platform_payg_capacity_corrections;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Server only' using errcode='42501'; end if;
  if p_actor is null or coalesce(length(trim(p_reason)),0) not between 10 and 1000
    or coalesce(length(trim(p_reference)),0) not between 5 and 1000 then raise exception 'Reviewer, correction reason and evidence required'; end if;
  perform 1 from public.whatsapp_platform_payg_capacity_periods where id=p_period and tenant_id=p_tenant and mode=p_mode for update;
  if not found then raise exception 'Paid capacity period not found in this workspace and mode'; end if;
  select * into result from public.whatsapp_platform_payg_capacity_corrections where period_id=p_period;
  if found then
    if result.actor_id<>p_actor or result.reason<>trim(p_reason) or result.evidence_reference<>trim(p_reference) then raise exception 'Capacity correction replay conflict'; end if;
    return to_jsonb(result);
  end if;
  insert into public.whatsapp_platform_payg_capacity_corrections(period_id,actor_id,reason,evidence_reference)
    values(p_period,p_actor,trim(p_reason),trim(p_reference)) returning * into result;
  return to_jsonb(result);
end; $$;
revoke all on function public.whatsapp_payg_correct_capacity_period(uuid,text,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.whatsapp_payg_correct_capacity_period(uuid,text,uuid,uuid,text,text) to service_role;

create function public.whatsapp_payg_record_capacity_period(p_tenant uuid,p_mode text,p_subscription uuid,p_payment text,
  p_from timestamptz,p_until timestamptz,p_evidence jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.whatsapp_platform_billing_subscriptions; result public.whatsapp_platform_payg_capacity_periods;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Server only' using errcode='42501'; end if;
  select * into strict s from public.whatsapp_platform_billing_subscriptions where id=p_subscription and tenant_id=p_tenant for update;
  if not s.payg_standalone or s.subscription_kind<>'addon' or (s.safe_metadata->>'mode') is distinct from p_mode then raise exception 'Standalone subscription identity or mode mismatch'; end if;
  if p_payment is null or p_payment !~ '^pay_[A-Za-z0-9]+$' or p_from is null or p_until is null
    or not isfinite(p_from) or not isfinite(p_until) or p_until<=p_from then raise exception 'Verified payment and finite paid period required'; end if;
  -- Edge must fetch payment AND provider invoice/subscription, verify amount,
  -- currency and period, then pass this minimal receipt. Never browser evidence.
  if jsonb_typeof(p_evidence) is distinct from 'object' or p_evidence->>'status' is distinct from 'captured'
    or p_evidence->>'paymentId' is distinct from p_payment
    or p_evidence->>'subscriptionId' is distinct from s.provider_subscription_id
    or coalesce(p_evidence->>'amountMinor','') !~ '^[1-9][0-9]{0,9}$'
    or coalesce(p_evidence->>'currency','') !~ '^[A-Z]{3}$' then raise exception 'Captured provider receipt required'; end if;
  select * into result from public.whatsapp_platform_payg_capacity_periods where mode=p_mode and provider_payment_id=p_payment;
  if found then
    if result.tenant_id<>p_tenant or result.subscription_id<>p_subscription or result.paid_from<>p_from or result.paid_until<>p_until
      or result.evidence is distinct from p_evidence then raise exception 'Capacity payment replay conflict'; end if;
    return to_jsonb(result);
  end if;
  if exists(select 1 from public.whatsapp_platform_payg_capacity_periods where subscription_id=p_subscription and paid_from<p_until and paid_until>p_from) then
    raise exception 'Paid period overlaps existing capacity evidence'; end if;
  insert into public.whatsapp_platform_payg_capacity_periods(tenant_id,mode,subscription_id,addon_code,quantity,provider_payment_id,paid_from,paid_until,evidence)
    values(p_tenant,p_mode,p_subscription,s.addon_code,s.addon_quantity,p_payment,p_from,p_until,p_evidence) returning * into result;
  return to_jsonb(result);
end; $$;
revoke all on function public.whatsapp_payg_record_capacity_period(uuid,text,uuid,text,timestamptz,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.whatsapp_payg_record_capacity_period(uuid,text,uuid,text,timestamptz,timestamptz,jsonb) to service_role;
create function public.whatsapp_payg_capacity_totals(p_tenant uuid,p_mode text,p_at timestamptz default now())
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Server only' using errcode='42501'; end if;
  if p_mode is null or p_mode not in ('test','live') or p_at is null or not isfinite(p_at) then raise exception 'Valid capacity mode and timestamp required'; end if;
  select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into result from (
    select addon_code,sum(quantity)::bigint quantity
    from public.whatsapp_platform_payg_capacity_periods p
    where tenant_id=p_tenant and mode=p_mode and paid_from<=p_at and paid_until>p_at
      and not exists(select 1 from public.whatsapp_platform_payg_capacity_corrections c where c.period_id=p.id and c.effective_at<=p_at)
    group by addon_code order by addon_code
  ) t;
  return result;
end; $$;
revoke all on function public.whatsapp_payg_capacity_totals(uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.whatsapp_payg_capacity_totals(uuid,text,timestamptz) to service_role;
notify pgrst,'reload schema';
