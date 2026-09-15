-- No rates are seeded. Each policy requires verified tenant-specific tax and
-- gateway evidence; installing this migration does not enable checkout.
create table public.whatsapp_platform_wallet_charge_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  mode text not null check(mode in ('test','live')),
  currency text not null check(currency in ('INR','USD')),
  policy jsonb not null check(jsonb_typeof(policy)='object'),
  evidence_reference text not null check(length(trim(evidence_reference))>0),
  recorded_reason text not null check(length(trim(recorded_reason)) between 10 and 1000),
  verified_by uuid not null,
  valid_from timestamptz not null,
  valid_until timestamptz not null check(valid_until>valid_from),
  created_at timestamptz not null default now(),
  foreign key(tenant_id,mode) references public.whatsapp_platform_wallets(tenant_id,mode)
);
alter table public.whatsapp_platform_wallet_charge_policies enable row level security;
revoke all on public.whatsapp_platform_wallet_charge_policies from public,anon,authenticated;
grant select on public.whatsapp_platform_wallet_charge_policies to service_role;
create trigger whatsapp_wallet_charge_policy_immutable before update or delete on public.whatsapp_platform_wallet_charge_policies
for each row execute function public.whatsapp_wallet_fx_immutable();

create function public.whatsapp_wallet_publish_charge_policy(p_tenant uuid,p_mode text,p_actor uuid,p_currency text,
  p_policy jsonb,p_reference text,p_reason text,p_from timestamptz,p_until timestamptz)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result public.whatsapp_platform_wallet_charge_policies; field text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Server only' using errcode='42501'; end if;
  if p_actor is null or coalesce(length(trim(p_reference)),0) not between 5 and 1000
    or coalesce(length(trim(p_reason)),0) not between 10 and 1000 then raise exception 'Reviewer, evidence reference and reason required'; end if;
  if p_from is null or p_until is null or not isfinite(p_from) or not isfinite(p_until)
    or p_until<=p_from or p_until-p_from>interval '366 days' then raise exception 'Finite policy validity of up to 366 days required'; end if;
  if jsonb_typeof(p_policy) is distinct from 'object' then raise exception 'Charge policy required'; end if;
  foreach field in array array['serviceGstBps','gatewayBps','gatewayGstBps','gatewayFixedMinor'] loop
    if coalesce(p_policy->>field,'') !~ '^[0-9]{1,10}$' then raise exception 'Integer policy rates and fixed fee required'; end if;
  end loop;
  if (p_policy->>'serviceGstBps')::bigint>10000 or (p_policy->>'gatewayGstBps')::bigint>10000
    or (p_policy->>'gatewayBps')::bigint>9999 or (p_policy->>'gatewayFixedMinor')::bigint>1000000000
    or coalesce(p_policy->>'gatewayBasis','') not in ('subtotal','collected_total') then raise exception 'Policy rate or fee basis invalid'; end if;
  if (p_policy->>'gatewayBps')::numeric*(1+(p_policy->>'gatewayGstBps')::numeric/10000)>=10000 then raise exception 'Gateway fee including tax must be below collected total'; end if;
  perform 1 from public.whatsapp_platform_wallets where tenant_id=p_tenant and mode=p_mode and currency=p_currency for update;
  if not found then raise exception 'Configure the matching wallet currency first'; end if;
  if exists(select 1 from public.whatsapp_platform_wallet_charge_policies where tenant_id=p_tenant and mode=p_mode and currency=p_currency
    and valid_from<p_until and valid_until>p_from) then raise exception 'Policy validity overlaps existing evidence'; end if;
  insert into public.whatsapp_platform_wallet_charge_policies(tenant_id,mode,currency,policy,evidence_reference,recorded_reason,verified_by,valid_from,valid_until)
    values(p_tenant,p_mode,p_currency,p_policy,trim(p_reference),trim(p_reason),p_actor,p_from,p_until) returning * into result;
  return to_jsonb(result);
end; $$;
revoke all on function public.whatsapp_wallet_publish_charge_policy(uuid,text,uuid,text,jsonb,text,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.whatsapp_wallet_publish_charge_policy(uuid,text,uuid,text,jsonb,text,text,timestamptz,timestamptz) to service_role;

create table public.whatsapp_platform_wallet_recharge_consents (
  recharge_id uuid primary key references public.whatsapp_platform_wallet_recharges(id),
  user_id uuid not null references public.whatsapp_platform_users(id),
  policy_version text not null check(policy_version='service-balance-nonrefundable-v1'),
  accepted_total_minor bigint not null,
  accepted_at timestamptz not null default now()
);
alter table public.whatsapp_platform_wallet_recharge_consents enable row level security;
revoke all on public.whatsapp_platform_wallet_recharge_consents from public,anon,authenticated;
grant select on public.whatsapp_platform_wallet_recharge_consents to service_role;
create trigger whatsapp_wallet_recharge_consent_immutable before update or delete on public.whatsapp_platform_wallet_recharge_consents
for each row execute function public.whatsapp_wallet_fx_immutable();

create table public.whatsapp_platform_wallet_discarded_quotes (
  recharge_id uuid primary key references public.whatsapp_platform_wallet_recharges(id),
  user_id uuid not null references public.whatsapp_platform_users(id),
  discarded_at timestamptz not null default now()
);
alter table public.whatsapp_platform_wallet_discarded_quotes enable row level security;
revoke all on public.whatsapp_platform_wallet_discarded_quotes from public,anon,authenticated;
grant select on public.whatsapp_platform_wallet_discarded_quotes to service_role;
create trigger whatsapp_wallet_discarded_quote_immutable before update or delete on public.whatsapp_platform_wallet_discarded_quotes
for each row execute function public.whatsapp_wallet_fx_immutable();

create function public.whatsapp_wallet_discard_quote(p_tenant uuid,p_mode text,p_recharge uuid,p_user uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare r public.whatsapp_platform_wallet_recharges;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Server only' using errcode='42501'; end if;
  if not exists(select 1 from public.whatsapp_platform_users where id=p_user and tenant_id=p_tenant and status='active' and role_code in ('owner','admin')) then
    raise exception 'Active workspace owner or admin required';
  end if;
  perform 1 from public.whatsapp_platform_wallets where tenant_id=p_tenant and mode=p_mode for update;
  select * into strict r from public.whatsapp_platform_wallet_recharges where id=p_recharge and tenant_id=p_tenant and mode=p_mode for update;
  if r.order_creation_started_at is not null or r.provider_order_id is not null or r.state<>'prepared'
    or exists(select 1 from public.whatsapp_platform_wallet_recharge_consents where recharge_id=r.id) then
    raise exception 'Payment may have started; reconcile this recharge instead';
  end if;
  insert into public.whatsapp_platform_wallet_discarded_quotes(recharge_id,user_id) values(r.id,p_user) on conflict do nothing;
  return true;
end; $$;
revoke all on function public.whatsapp_wallet_discard_quote(uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.whatsapp_wallet_discard_quote(uuid,text,uuid,uuid) to service_role;

create function public.whatsapp_wallet_accept_recharge(p_tenant uuid,p_mode text,p_recharge uuid,p_user uuid,p_total bigint,p_policy text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.whatsapp_platform_wallet_recharges;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Server only' using errcode='42501'; end if;
  if not exists(select 1 from public.whatsapp_platform_users where id=p_user and tenant_id=p_tenant and status='active' and role_code in ('owner','admin')) then
    raise exception 'Active workspace owner or admin required';
  end if;
  select * into strict r from public.whatsapp_platform_wallet_recharges where id=p_recharge and tenant_id=p_tenant and mode=p_mode for update;
  if exists(select 1 from public.whatsapp_platform_wallet_discarded_quotes where recharge_id=r.id) then raise exception 'Recharge quote was discarded'; end if;
  if r.charge_breakdown is null or p_total is distinct from r.amount_minor
    or p_policy is distinct from 'service-balance-nonrefundable-v1' then raise exception 'Quoted total and policy acceptance required'; end if;
  if not exists(select 1 from public.whatsapp_platform_wallet_recharge_consents where recharge_id=r.id)
    and r.created_at<now()-interval '15 minutes' then raise exception 'Recharge quote expired; request a new quote'; end if;
  insert into public.whatsapp_platform_wallet_recharge_consents(recharge_id,user_id,policy_version,accepted_total_minor)
    values(r.id,p_user,p_policy,p_total) on conflict(recharge_id) do nothing;
  return to_jsonb(r);
end; $$;
revoke all on function public.whatsapp_wallet_accept_recharge(uuid,text,uuid,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.whatsapp_wallet_accept_recharge(uuid,text,uuid,uuid,bigint,text) to service_role;
notify pgrst,'reload schema';
