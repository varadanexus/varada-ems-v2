-- Additive only: wallets are inactive until the payment and legacy-subscription
-- transition is completed. Balances are millionths of the selected currency,
-- NOT gateway cents/paise. USD service rates and FX evidence are stored separately.
create table public.whatsapp_platform_wallet_fx (
  id uuid primary key default gen_random_uuid(),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  units_per_usd numeric(20,8) not null check (units_per_usd>0),
  valid_from timestamptz not null default now(),
  valid_until timestamptz not null,
  source text not null check (length(source)>0),
  created_at timestamptz not null default now(),
  check (valid_until>valid_from)
);
create index whatsapp_wallet_fx_currency on public.whatsapp_platform_wallet_fx(currency,valid_until desc);
insert into public.whatsapp_platform_wallet_fx(currency,units_per_usd,valid_until,source)
  values('USD',1,'infinity','USD base currency');
create table public.whatsapp_platform_wallets (
  tenant_id uuid not null references public.whatsapp_platform_tenants(id) on delete restrict,
  mode text not null check (mode in ('test','live')),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  enabled boolean not null default false,
  balance_micros bigint not null default 0,
  reserved_micros bigint not null default 0 check (reserved_micros >= 0),
  minimum_available_usd_micros bigint not null default 350000 check (minimum_available_usd_micros >= 0),
  low_balance_usd_micros bigint not null default 2000000 check (low_balance_usd_micros >= minimum_available_usd_micros),
  minimum_topup_usd_micros bigint not null default 10000000 check (minimum_topup_usd_micros >= 1000000),
  enabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id,mode)
);

create table public.whatsapp_platform_wallet_usage (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  mode text not null,
  request_key text not null check (length(request_key) between 1 and 200),
  request_hash text check(request_hash ~ '^[a-f0-9]{64}$'),
  connection_id uuid not null,
  meta_message_id text,
  direction text not null check (direction in ('inbound','outbound')),
  source text not null check (length(source) between 1 and 80),
  message_type text not null default 'unknown',
  state text not null check (state in ('reserved','accepted','uncertain','charged','failed','released')),
  currency text not null,
  fx_quote_id uuid not null references public.whatsapp_platform_wallet_fx(id),
  fx_units_per_usd numeric(20,8) not null check (fx_units_per_usd>0),
  usd_rate_micros bigint not null default 3500 check (usd_rate_micros=3500),
  usd_failed_rate_micros bigint not null default 700 check (usd_failed_rate_micros=700),
  rate_micros bigint not null check (rate_micros > 0),
  failed_rate_micros bigint not null check (failed_rate_micros > 0 and failed_rate_micros<=rate_micros),
  charged_micros bigint not null default 0 check (charged_micros>=0),
  reserved_micros bigint not null default 0 check (reserved_micros>=0),
  rate_version text not null default '2026-09-08',
  error_code text,
  provider_status text,
  meta_pricing jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id,mode) references public.whatsapp_platform_wallets(tenant_id,mode),
  unique(tenant_id,mode,request_key),
  unique(mode,meta_message_id)
);

create table public.whatsapp_platform_wallet_ledger (
  id bigint generated always as identity primary key,
  tenant_id uuid not null,
  mode text not null,
  currency text not null,
  event_key text not null,
  kind text not null check (kind in ('reserve','capture','release','topup','refund','adjustment')),
  balance_delta_micros bigint not null,
  reserved_delta_micros bigint not null default 0,
  balance_after_micros bigint not null,
  reserved_after_micros bigint not null check (reserved_after_micros >= 0),
  usage_id uuid references public.whatsapp_platform_wallet_usage(id),
  reference text not null,
  created_at timestamptz not null default now(),
  foreign key (tenant_id,mode) references public.whatsapp_platform_wallets(tenant_id,mode),
  unique(tenant_id,mode,event_key)
);

-- A signed Meta callback may arrive before we have saved the send response.
create table public.whatsapp_platform_wallet_delivery_evidence (
  tenant_id uuid not null references public.whatsapp_platform_tenants(id) on delete restrict,
  mode text not null check (mode in ('test','live')),
  connection_id uuid not null,
  meta_message_id text not null,
  delivered boolean not null default false,
  failed boolean not null default false,
  provider_status text not null,
  error_code text,
  meta_pricing jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (mode,meta_message_id)
);

create index whatsapp_wallet_usage_history on public.whatsapp_platform_wallet_usage(tenant_id,mode,occurred_at desc,id);
create index whatsapp_wallet_usage_reconciliation on public.whatsapp_platform_wallet_usage(tenant_id,mode,state,updated_at);
create index whatsapp_wallet_ledger_history on public.whatsapp_platform_wallet_ledger(tenant_id,mode,id desc);
create index whatsapp_wallet_ledger_usage on public.whatsapp_platform_wallet_ledger(usage_id);

alter table public.whatsapp_platform_wallets enable row level security;
alter table public.whatsapp_platform_wallet_fx enable row level security;
alter table public.whatsapp_platform_wallet_usage enable row level security;
alter table public.whatsapp_platform_wallet_ledger enable row level security;
alter table public.whatsapp_platform_wallet_delivery_evidence enable row level security;
revoke all on public.whatsapp_platform_wallet_fx,public.whatsapp_platform_wallets, public.whatsapp_platform_wallet_usage,
  public.whatsapp_platform_wallet_ledger, public.whatsapp_platform_wallet_delivery_evidence from public,anon,authenticated;
grant select on public.whatsapp_platform_wallet_fx,public.whatsapp_platform_wallets, public.whatsapp_platform_wallet_usage,
  public.whatsapp_platform_wallet_ledger, public.whatsapp_platform_wallet_delivery_evidence to service_role;

create function public.whatsapp_wallet_ledger_immutable()
returns trigger language plpgsql set search_path=public as $$
begin raise exception 'Wallet ledger entries are immutable; post a compensating entry.'; end; $$;
create trigger whatsapp_wallet_ledger_immutable before update or delete on public.whatsapp_platform_wallet_ledger
for each row execute function public.whatsapp_wallet_ledger_immutable();

-- This primitive is intentionally not executable by any API role. All callers
-- must first lock the tenant wallet and validate their business operation.
create function public.whatsapp_wallet_post(p_tenant uuid,p_mode text,p_key text,p_kind text,
  p_balance bigint,p_reserved bigint,p_reference text,p_usage uuid default null)
returns void language plpgsql security definer set search_path=public as $$
declare w public.whatsapp_platform_wallets;
begin
  select * into strict w from public.whatsapp_platform_wallets where tenant_id=p_tenant and mode=p_mode for update;
  if exists(select 1 from public.whatsapp_platform_wallet_ledger where tenant_id=p_tenant and mode=p_mode and event_key=p_key) then return; end if;
  update public.whatsapp_platform_wallets set balance_micros=balance_micros+p_balance,
    reserved_micros=reserved_micros+p_reserved,updated_at=now()
    where tenant_id=p_tenant and mode=p_mode returning * into w;
  insert into public.whatsapp_platform_wallet_ledger(tenant_id,mode,currency,event_key,kind,balance_delta_micros,
    reserved_delta_micros,balance_after_micros,reserved_after_micros,usage_id,reference)
    values(p_tenant,p_mode,w.currency,p_key,p_kind,p_balance,p_reserved,w.balance_micros,w.reserved_micros,p_usage,p_reference);
end; $$;
revoke all on function public.whatsapp_wallet_post(uuid,text,text,text,bigint,bigint,text,uuid) from public,anon,authenticated,service_role;

create function public.whatsapp_wallet_reserve(p_tenant uuid,p_mode text,p_connection uuid,p_request_key text,p_source text,p_message_type text,p_request_hash text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare w public.whatsapp_platform_wallets; u public.whatsapp_platform_wallet_usage; fx public.whatsapp_platform_wallet_fx; rate bigint;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Server only' using errcode='42501'; end if;
  select * into w from public.whatsapp_platform_wallets where tenant_id=p_tenant and mode=p_mode for update;
  if not found or not w.enabled then return jsonb_build_object('enabled',false); end if;
  if not exists(select 1 from public.whatsapp_platform_connections where id=p_connection and tenant_id=p_tenant) then raise exception 'Connection does not belong to workspace'; end if;
  select * into u from public.whatsapp_platform_wallet_usage where tenant_id=p_tenant and mode=p_mode and request_key=p_request_key;
  if found then
    if u.connection_id<>p_connection or u.direction<>'outbound' or u.source<>p_source or u.message_type<>p_message_type or u.request_hash is distinct from p_request_hash then raise exception 'Usage idempotency conflict'; end if;
    return jsonb_build_object('enabled',true,'duplicate',true,'usageId',u.id,'state',u.state,'metaMessageId',u.meta_message_id);
  end if;
  select * into fx from public.whatsapp_platform_wallet_fx where currency=w.currency and valid_from<=now() and valid_until>now() order by valid_from desc,created_at desc limit 1;
  if not found then raise exception 'A current exchange rate is unavailable. Sending is paused until the rate is refreshed.'; end if;
  rate:=ceil(3500*fx.units_per_usd)::bigint;
  if w.balance_micros-w.reserved_micros-rate<ceil(w.minimum_available_usd_micros*fx.units_per_usd)::bigint then raise exception 'Insufficient Varada balance. Recharge to send messages.' using errcode='P0001'; end if;
  insert into public.whatsapp_platform_wallet_usage(tenant_id,mode,connection_id,request_key,request_hash,source,message_type,direction,state,reserved_micros,currency,fx_quote_id,fx_units_per_usd,rate_micros,failed_rate_micros)
    values(p_tenant,p_mode,p_connection,p_request_key,p_request_hash,p_source,p_message_type,'outbound','reserved',rate,w.currency,fx.id,fx.units_per_usd,rate,ceil(700*fx.units_per_usd)::bigint) returning * into u;
  perform public.whatsapp_wallet_post(p_tenant,p_mode,'reserve:'||u.id,'reserve',0,rate,'Outgoing message fee reserved',u.id);
  return jsonb_build_object('enabled',true,'duplicate',false,'usageId',u.id);
end; $$;

create function public.whatsapp_wallet_settle(p_usage uuid,p_result text,p_meta_id text default null,p_error text default null,p_pricing jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public as $$
declare u public.whatsapp_platform_wallet_usage; target bigint; result_state text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Server only' using errcode='42501'; end if;
  if p_result not in ('accepted','uncertain','delivered','failed','rejected') then raise exception 'Invalid wallet outcome'; end if;
  select * into strict u from public.whatsapp_platform_wallet_usage where id=p_usage;
  -- Every wallet mutation uses the same lock order: wallet, then usage.
  perform 1 from public.whatsapp_platform_wallets where tenant_id=u.tenant_id and mode=u.mode for update;
  select * into strict u from public.whatsapp_platform_wallet_usage where id=p_usage for update;
  if u.direction<>'outbound' then raise exception 'Outgoing usage required'; end if;
  if p_result='rejected' and (u.state<>'reserved' or u.meta_message_id is not null or p_meta_id is not null) then
    raise exception 'Accepted or uncertain sends require reconciliation, not automatic release';
  end if;
  if p_meta_id is not null and u.meta_message_id is not null and u.meta_message_id<>p_meta_id then raise exception 'Meta message identifier mismatch'; end if;
  if u.state='released' then return to_jsonb(u); end if;
  if p_result in ('accepted','uncertain') then
    if u.state in ('reserved','uncertain','accepted') then
      update public.whatsapp_platform_wallet_usage set state=p_result,meta_message_id=coalesce(p_meta_id,meta_message_id),error_code=left(p_error,160),updated_at=now() where id=u.id returning * into u;
    end if;
    return to_jsonb(u);
  end if;
  -- Delivery evidence wins over a late failed callback. Do not double-charge
  -- delivered/read; if failure arrived first, charge only the difference.
  target:=case when u.state='charged' or p_result='delivered' then u.rate_micros when p_result='failed' then u.failed_rate_micros else 0 end;
  if target<u.charged_micros then return to_jsonb(u); end if;
  result_state:=case when target=u.rate_micros then 'charged' when target=u.failed_rate_micros then 'failed' else 'released' end;
  if target<>u.charged_micros or u.reserved_micros<>0 then
    perform public.whatsapp_wallet_post(u.tenant_id,u.mode,'settle:'||u.id||':'||target,
      case when target=0 then 'release' else 'capture' end,-(target-u.charged_micros),-u.reserved_micros,
      case when target=u.failed_rate_micros then 'Failed message processing' when target=0 then 'Rejected before acceptance' else 'Outgoing message handling' end,u.id);
  end if;
  update public.whatsapp_platform_wallet_usage set state=result_state,charged_micros=target,reserved_micros=0,
    meta_message_id=coalesce(p_meta_id,meta_message_id),provider_status=p_result,error_code=left(p_error,160),
    meta_pricing=case when p_pricing='{}'::jsonb then meta_pricing else p_pricing end,updated_at=now() where id=u.id returning * into u;
  return to_jsonb(u);
end; $$;

create function public.whatsapp_wallet_inbound(p_tenant uuid,p_mode text,p_connection uuid,p_meta_id text,p_message_type text,p_occurred_at timestamptz)
returns jsonb language plpgsql security definer set search_path=public as $$
declare w public.whatsapp_platform_wallets; u public.whatsapp_platform_wallet_usage; fx public.whatsapp_platform_wallet_fx; rate bigint;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Server only' using errcode='42501'; end if;
  select * into w from public.whatsapp_platform_wallets where tenant_id=p_tenant and mode=p_mode for update;
  if not found or not w.enabled then return jsonb_build_object('enabled',false); end if;
  if p_meta_id is null or length(p_meta_id)=0 then raise exception 'Message identifier required'; end if;
  if not exists(select 1 from public.whatsapp_platform_connections where id=p_connection and tenant_id=p_tenant) then raise exception 'Connection does not belong to workspace'; end if;
  -- Retried historical callbacks must not charge pre-cutover messages.
  if p_occurred_at is null or w.enabled_at is null or p_occurred_at<w.enabled_at then return jsonb_build_object('enabled',true,'historical',true); end if;
  select * into fx from public.whatsapp_platform_wallet_fx where currency=w.currency and valid_from<=p_occurred_at and valid_until>p_occurred_at order by valid_from desc,created_at desc limit 1;
  if not found then raise exception 'Exchange-rate evidence missing for incoming usage; reconciliation required'; end if;
  rate:=ceil(3500*fx.units_per_usd)::bigint;
  insert into public.whatsapp_platform_wallet_usage(tenant_id,mode,connection_id,request_key,meta_message_id,direction,source,message_type,state,charged_micros,occurred_at,currency,fx_quote_id,fx_units_per_usd,rate_micros,failed_rate_micros)
    values(p_tenant,p_mode,p_connection,'inbound:'||p_meta_id,p_meta_id,'inbound','webhook',p_message_type,'charged',rate,p_occurred_at,w.currency,fx.id,fx.units_per_usd,rate,ceil(700*fx.units_per_usd)::bigint)
    on conflict(mode,meta_message_id) do nothing returning * into u;
  if u.id is null then
    select * into strict u from public.whatsapp_platform_wallet_usage where mode=p_mode and meta_message_id=p_meta_id;
    if u.tenant_id<>p_tenant or u.connection_id<>p_connection or u.direction<>'inbound' then raise exception 'Cross-workspace incoming identifier conflict'; end if;
    return jsonb_build_object('enabled',true,'duplicate',true);
  end if;
  -- Inbound messages cannot be stopped at Meta. Preserve receipt and record
  -- usage debt if necessary; future outbound reservations are then blocked.
  perform public.whatsapp_wallet_post(p_tenant,p_mode,'inbound:'||u.id,'capture',-rate,0,'Incoming message handling',u.id);
  return jsonb_build_object('enabled',true,'usageId',u.id);
end; $$;

create function public.whatsapp_wallet_record_delivery(p_tenant uuid,p_mode text,p_connection uuid,p_meta_id text,p_status text,p_error text default null,p_pricing jsonb default '{}')
returns void language plpgsql security definer set search_path=public as $$
declare u public.whatsapp_platform_wallet_usage; e public.whatsapp_platform_wallet_delivery_evidence;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Server only' using errcode='42501'; end if;
  if p_status not in ('sent','delivered','read','failed') then return; end if;
  perform 1 from public.whatsapp_platform_wallets where tenant_id=p_tenant and mode=p_mode and enabled for update;
  if not found then return; end if;
  if not exists(select 1 from public.whatsapp_platform_connections where id=p_connection and tenant_id=p_tenant) then raise exception 'Connection does not belong to workspace'; end if;
  insert into public.whatsapp_platform_wallet_delivery_evidence as old(tenant_id,mode,connection_id,meta_message_id,delivered,failed,provider_status,error_code,meta_pricing)
    values(p_tenant,p_mode,p_connection,p_meta_id,p_status in ('delivered','read'),p_status='failed',p_status,left(p_error,160),p_pricing)
    on conflict(mode,meta_message_id) do update set delivered=old.delivered or excluded.delivered,failed=old.failed or excluded.failed,
      provider_status=excluded.provider_status,error_code=excluded.error_code,
      meta_pricing=case when excluded.meta_pricing='{}'::jsonb then old.meta_pricing else excluded.meta_pricing end,updated_at=now()
    where old.tenant_id=excluded.tenant_id and old.connection_id=excluded.connection_id returning * into e;
  if e.meta_message_id is null then raise exception 'Cross-workspace delivery identifier conflict'; end if;
  select * into u from public.whatsapp_platform_wallet_usage where tenant_id=p_tenant and mode=p_mode and connection_id=p_connection and meta_message_id=p_meta_id;
  if u.id is not null and (e.delivered or e.failed) then
    perform public.whatsapp_wallet_settle(u.id,case when e.delivered then 'delivered' else 'failed' end,p_meta_id,e.error_code,e.meta_pricing);
  end if;
end; $$;

create function public.whatsapp_wallet_bind(p_usage uuid,p_meta_id text)
returns void language plpgsql security definer set search_path=public as $$
declare u public.whatsapp_platform_wallet_usage; e public.whatsapp_platform_wallet_delivery_evidence;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Server only' using errcode='42501'; end if;
  if p_meta_id is null or length(p_meta_id)=0 then raise exception 'Message identifier required'; end if;
  perform public.whatsapp_wallet_settle(p_usage,'accepted',p_meta_id);
  select * into strict u from public.whatsapp_platform_wallet_usage where id=p_usage;
  select * into e from public.whatsapp_platform_wallet_delivery_evidence where tenant_id=u.tenant_id and mode=u.mode and connection_id=u.connection_id and meta_message_id=p_meta_id;
  if e.delivered or e.failed then
    perform public.whatsapp_wallet_settle(u.id,case when e.delivered then 'delivered' else 'failed' end,p_meta_id,e.error_code,e.meta_pricing);
  end if;
end; $$;

revoke all on function public.whatsapp_wallet_reserve(uuid,text,uuid,text,text,text,text),
  public.whatsapp_wallet_settle(uuid,text,text,text,jsonb),
  public.whatsapp_wallet_inbound(uuid,text,uuid,text,text,timestamptz),
  public.whatsapp_wallet_record_delivery(uuid,text,uuid,text,text,text,jsonb),
  public.whatsapp_wallet_bind(uuid,text),public.whatsapp_wallet_ledger_immutable() from public,anon,authenticated;
grant execute on function public.whatsapp_wallet_reserve(uuid,text,uuid,text,text,text,text),
  public.whatsapp_wallet_settle(uuid,text,text,text,jsonb),
  public.whatsapp_wallet_inbound(uuid,text,uuid,text,text,timestamptz),
  public.whatsapp_wallet_record_delivery(uuid,text,uuid,text,text,text,jsonb),
  public.whatsapp_wallet_bind(uuid,text) to service_role;

comment on table public.whatsapp_platform_wallet_ledger is 'Immutable selected-currency micro-unit service-credit journal. USD pricing and FX evidence on usage rows. Meta charges never posted here. Test/live isolated.';
notify pgrst, 'reload schema';
