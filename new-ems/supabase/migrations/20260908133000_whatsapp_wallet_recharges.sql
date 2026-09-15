-- Server-only payment journal. Gateway verification happens in the billing
-- Edge Function before capture; browser checkout callbacks cannot credit money.
create table public.whatsapp_platform_wallet_recharges (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  mode text not null,
  request_key text not null check(length(request_key) between 1 and 200),
  currency text not null,
  currency_exponent integer not null check(currency_exponent between 0 and 3),
  amount_minor bigint not null check(amount_minor>0 and amount_minor<=1000000000),
  credit_amount_minor bigint not null check(credit_amount_minor>0),
  charge_breakdown jsonb,
  check(amount_minor>=credit_amount_minor),
  credit_micros bigint not null check(credit_micros>0),
  fx_quote_id uuid not null references public.whatsapp_platform_wallet_fx(id),
  fx_units_per_usd numeric(20,8) not null check(fx_units_per_usd>0),
  usd_equivalent_micros bigint not null check(usd_equivalent_micros>0),
  provider_order_id text,
  provider_payment_id text,
  order_creation_started_at timestamptz,
  state text not null default 'prepared' check(state in('prepared','ordered','captured')),
  captured_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key(tenant_id,mode) references public.whatsapp_platform_wallets(tenant_id,mode),
  unique(tenant_id,mode,request_key),
  unique(mode,provider_order_id),
  unique(mode,provider_payment_id)
);
alter table public.whatsapp_platform_wallet_recharges enable row level security;
revoke all on public.whatsapp_platform_wallet_recharges from public,anon,authenticated;
grant select on public.whatsapp_platform_wallet_recharges to service_role;
create index whatsapp_wallet_recharge_history on public.whatsapp_platform_wallet_recharges(tenant_id,mode,created_at desc);

create function public.whatsapp_wallet_recharge_financial_guard() returns trigger
language plpgsql set search_path=public as $$
begin
  if tg_op='DELETE' then raise exception 'Recharge financial evidence is immutable'; end if;
  if (to_jsonb(new)-array['provider_order_id','provider_payment_id','order_creation_started_at','state','captured_at'])
    is distinct from (to_jsonb(old)-array['provider_order_id','provider_payment_id','order_creation_started_at','state','captured_at']) then
    raise exception 'Recharge financial evidence is immutable';
  end if;
  return new;
end; $$;
create trigger whatsapp_wallet_recharge_financial_guard before update or delete on public.whatsapp_platform_wallet_recharges
for each row execute function public.whatsapp_wallet_recharge_financial_guard();
revoke all on function public.whatsapp_wallet_recharge_financial_guard() from public,anon,authenticated;

create function public.whatsapp_wallet_fx_immutable() returns trigger
language plpgsql set search_path=public as $$
begin raise exception 'Exchange-rate evidence is immutable; append a new quote'; end; $$;
create trigger whatsapp_wallet_fx_immutable before update or delete on public.whatsapp_platform_wallet_fx
for each row execute function public.whatsapp_wallet_fx_immutable();

create function public.whatsapp_wallet_currency_guard() returns trigger
language plpgsql set search_path=public as $$
begin
  if new.currency is distinct from old.currency and (old.enabled or old.balance_micros<>0 or old.reserved_micros<>0
    or exists(select 1 from public.whatsapp_platform_wallet_ledger where tenant_id=old.tenant_id and mode=old.mode)
    or exists(select 1 from public.whatsapp_platform_wallet_recharges where tenant_id=old.tenant_id and mode=old.mode)) then
    raise exception 'Wallet currency is locked after activation or financial activity';
  end if;
  return new;
end; $$;
create trigger whatsapp_wallet_currency_guard before update on public.whatsapp_platform_wallets
for each row execute function public.whatsapp_wallet_currency_guard();

create function public.whatsapp_wallet_prepare_recharge(p_tenant uuid,p_mode text,p_request_key text,p_amount_minor bigint,p_exponent integer,p_charge_breakdown jsonb default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare w public.whatsapp_platform_wallets; r public.whatsapp_platform_wallet_recharges; fx public.whatsapp_platform_wallet_fx; credit bigint;
  total bigint; service_gst bigint; gateway_fee bigint; gateway_gst bigint;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Server only' using errcode='42501'; end if;
  select * into strict w from public.whatsapp_platform_wallets where tenant_id=p_tenant and mode=p_mode for update;
  if not w.enabled then raise exception 'Wallet is not active'; end if;
  if p_exponent is null or p_exponent not between 0 and 3 or p_amount_minor is null or p_amount_minor not between 1 and 1000000000 then raise exception 'Invalid recharge amount'; end if;
  total:=p_amount_minor;
  if p_charge_breakdown is not null then
    if jsonb_typeof(p_charge_breakdown) is distinct from 'object'
      or coalesce(length(p_charge_breakdown->>'policyId'),0)=0
      or (p_charge_breakdown->>'currency') is distinct from w.currency
      or (p_charge_breakdown->>'creditMinor') is distinct from p_amount_minor::text
      or coalesce(p_charge_breakdown->>'serviceGstMinor','') !~ '^[0-9]{1,10}$'
      or coalesce(p_charge_breakdown->>'gatewayFeeMinor','') !~ '^[0-9]{1,10}$'
      or coalesce(p_charge_breakdown->>'gatewayGstMinor','') !~ '^[0-9]{1,10}$'
      or coalesce(p_charge_breakdown->>'totalMinor','') !~ '^[0-9]{1,10}$' then
      raise exception 'Invalid recharge charge breakdown';
    end if;
    service_gst:=(p_charge_breakdown->>'serviceGstMinor')::bigint;
    gateway_fee:=(p_charge_breakdown->>'gatewayFeeMinor')::bigint;
    gateway_gst:=(p_charge_breakdown->>'gatewayGstMinor')::bigint;
    total:=(p_charge_breakdown->>'totalMinor')::bigint;
    if total<>p_amount_minor+service_gst+gateway_fee+gateway_gst or total>1000000000 then
      raise exception 'Recharge total does not match charge breakdown';
    end if;
  end if;
  select * into r from public.whatsapp_platform_wallet_recharges where tenant_id=p_tenant and mode=p_mode and request_key=p_request_key;
  if found then
    if r.credit_amount_minor<>p_amount_minor or r.currency_exponent<>p_exponent
      or r.charge_breakdown is distinct from p_charge_breakdown then raise exception 'Recharge idempotency conflict'; end if;
    return to_jsonb(r);
  end if;
  select * into fx from public.whatsapp_platform_wallet_fx where currency=w.currency and valid_from<=now() and valid_until>now() order by valid_from desc,created_at desc limit 1;
  if not found then raise exception 'Current exchange-rate evidence is unavailable'; end if;
  credit:=p_amount_minor*power(10,6-p_exponent)::bigint;
  if credit < ceil(w.minimum_topup_usd_micros*fx.units_per_usd) then raise exception 'Recharge is below the minimum amount'; end if;
  insert into public.whatsapp_platform_wallet_recharges(tenant_id,mode,request_key,currency,currency_exponent,amount_minor,credit_amount_minor,charge_breakdown,credit_micros,fx_quote_id,fx_units_per_usd,usd_equivalent_micros)
    values(p_tenant,p_mode,p_request_key,w.currency,p_exponent,total,p_amount_minor,p_charge_breakdown,credit,fx.id,fx.units_per_usd,floor(credit/fx.units_per_usd)::bigint) returning * into r;
  return to_jsonb(r);
end; $$;

create function public.whatsapp_wallet_bind_recharge(p_recharge uuid,p_order_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.whatsapp_platform_wallet_recharges;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Server only' using errcode='42501'; end if;
  if p_order_id is null or p_order_id !~ '^order_[A-Za-z0-9]+$' then raise exception 'Invalid provider order'; end if;
  select * into strict r from public.whatsapp_platform_wallet_recharges where id=p_recharge;
  perform 1 from public.whatsapp_platform_wallets where tenant_id=r.tenant_id and mode=r.mode for update;
  select * into strict r from public.whatsapp_platform_wallet_recharges where id=p_recharge for update;
  if r.provider_order_id is not null and r.provider_order_id<>p_order_id then raise exception 'Recharge already belongs to another order'; end if;
  update public.whatsapp_platform_wallet_recharges set provider_order_id=p_order_id,state=case when state='captured' then state else 'ordered' end where id=r.id returning * into r;
  return to_jsonb(r);
end; $$;

-- Exactly one process may attempt gateway order creation. If it loses the
-- response, retain the prepared intent for reconciliation by its receipt ID.
create function public.whatsapp_wallet_claim_recharge_order(p_recharge uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare r public.whatsapp_platform_wallet_recharges;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Server only' using errcode='42501'; end if;
  select * into strict r from public.whatsapp_platform_wallet_recharges where id=p_recharge;
  perform 1 from public.whatsapp_platform_wallets where tenant_id=r.tenant_id and mode=r.mode for update;
  update public.whatsapp_platform_wallet_recharges set order_creation_started_at=now()
    where id=p_recharge and order_creation_started_at is null and provider_order_id is null;
  return found;
end; $$;

create function public.whatsapp_wallet_capture_recharge(p_tenant uuid,p_mode text,p_order_id text,p_payment_id text,p_amount_minor bigint,p_currency text,p_captured_at timestamptz)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.whatsapp_platform_wallet_recharges;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Server only' using errcode='42501'; end if;
  if p_payment_id is null or p_payment_id !~ '^pay_[A-Za-z0-9]+$' or p_captured_at is null then raise exception 'Captured payment evidence required'; end if;
  perform 1 from public.whatsapp_platform_wallets where tenant_id=p_tenant and mode=p_mode for update;
  select * into strict r from public.whatsapp_platform_wallet_recharges where tenant_id=p_tenant and mode=p_mode and provider_order_id=p_order_id for update;
  if p_amount_minor is distinct from r.amount_minor or p_currency is distinct from r.currency then raise exception 'Payment amount or currency mismatch'; end if;
  if r.provider_payment_id is not null and r.provider_payment_id<>p_payment_id then raise exception 'Recharge already credited by another payment'; end if;
  if r.state='captured' then return to_jsonb(r); end if;
  perform public.whatsapp_wallet_post(p_tenant,p_mode,'recharge:'||r.id,'topup',r.credit_micros,0,'Captured Razorpay service advance '||p_payment_id);
  update public.whatsapp_platform_wallet_recharges set provider_payment_id=p_payment_id,state='captured',captured_at=p_captured_at where id=r.id returning * into r;
  return to_jsonb(r);
end; $$;

revoke all on function public.whatsapp_wallet_prepare_recharge(uuid,text,text,bigint,integer,jsonb),public.whatsapp_wallet_bind_recharge(uuid,text),
  public.whatsapp_wallet_claim_recharge_order(uuid),
  public.whatsapp_wallet_capture_recharge(uuid,text,text,text,bigint,text,timestamptz),public.whatsapp_wallet_fx_immutable(),public.whatsapp_wallet_currency_guard() from public,anon,authenticated;
grant execute on function public.whatsapp_wallet_prepare_recharge(uuid,text,text,bigint,integer,jsonb),public.whatsapp_wallet_bind_recharge(uuid,text),
  public.whatsapp_wallet_claim_recharge_order(uuid),
  public.whatsapp_wallet_capture_recharge(uuid,text,text,text,bigint,text,timestamptz) to service_role;
notify pgrst,'reload schema';
