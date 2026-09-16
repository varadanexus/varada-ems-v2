-- Recharge quote reference only. Do not alter existing wallet FX/metering.
create table public.whatsapp_recharge_fx_rates (
  id uuid primary key default gen_random_uuid(),
  units_per_usd numeric(18,8) not null check(units_per_usd between 1 and 1000),
  provider_updated_at timestamptz not null unique,
  next_update_at timestamptz not null,
  fetched_at timestamptz not null default now(),
  source text not null check(source='https://www.exchangerate-api.com'),
  check(next_update_at>provider_updated_at)
);
create table public.whatsapp_recharge_fx_controls (
  id uuid primary key default gen_random_uuid(),
  mode text not null check(mode in ('automatic','manual')),
  units_per_usd numeric(18,8),
  effective_from timestamptz not null,
  expires_at timestamptz,
  actor_id uuid not null,
  reason text not null check(length(trim(reason)) between 10 and 1000),
  created_at timestamptz not null default now(),
  check((mode='automatic' and units_per_usd is null and expires_at is null) or
    (mode='manual' and units_per_usd is not null and expires_at is not null and units_per_usd between 1 and 1000 and expires_at>effective_from and expires_at-effective_from<=interval '7 days'))
);
create table public.whatsapp_recharge_fx_refresh_guard (
  singleton boolean primary key default true check(singleton),
  attempted_at timestamptz not null
);
alter table public.whatsapp_recharge_fx_rates enable row level security;
alter table public.whatsapp_recharge_fx_controls enable row level security;
alter table public.whatsapp_recharge_fx_refresh_guard enable row level security;
revoke all on public.whatsapp_recharge_fx_rates,public.whatsapp_recharge_fx_controls,public.whatsapp_recharge_fx_refresh_guard from public,anon,authenticated;
grant select on public.whatsapp_recharge_fx_rates,public.whatsapp_recharge_fx_controls to service_role;
create trigger recharge_fx_rates_immutable before update or delete on public.whatsapp_recharge_fx_rates for each row execute function public.whatsapp_wallet_fx_immutable();
create trigger recharge_fx_controls_immutable before update or delete on public.whatsapp_recharge_fx_controls for each row execute function public.whatsapp_wallet_fx_immutable();

create function public.whatsapp_recharge_fx_claim_refresh() returns boolean language plpgsql security definer set search_path=public as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Server only';end if;
  perform pg_advisory_xact_lock(hashtextextended('recharge-fx-refresh',0));
  if exists(select 1 from whatsapp_recharge_fx_refresh_guard where attempted_at>now()-interval '5 minutes') then return false;end if;
  if exists(select 1 from whatsapp_recharge_fx_rates where next_update_at>now()) then return false;end if;
  insert into whatsapp_recharge_fx_refresh_guard(singleton,attempted_at) values(true,now()) on conflict(singleton) do update set attempted_at=excluded.attempted_at;
  return true;
end $$;
create function public.whatsapp_recharge_fx_record(p_rate numeric,p_updated timestamptz,p_next timestamptz) returns uuid language plpgsql security definer set search_path=public as $$
declare result uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Server only';end if;
  if p_updated is null or p_next is null or not isfinite(p_updated) or not isfinite(p_next) or p_updated>now()+interval '5 minutes' or p_updated<now()-interval '48 hours' or p_next<=p_updated or p_next>p_updated+interval '48 hours' or p_rate is null or round(p_rate,8)<>p_rate then raise exception 'Invalid provider rate evidence';end if;
  perform pg_advisory_xact_lock(hashtextextended('recharge-fx-refresh',0));
  select id into result from whatsapp_recharge_fx_rates where provider_updated_at=p_updated and units_per_usd=p_rate and next_update_at=p_next;
  if result is not null then return result;end if;
  insert into whatsapp_recharge_fx_rates(units_per_usd,provider_updated_at,next_update_at,source) values(p_rate,p_updated,p_next,'https://www.exchangerate-api.com') returning id into result;
  return result;
end $$;
create function public.whatsapp_recharge_fx_set_control(p_actor uuid,p_mode text,p_rate numeric,p_from timestamptz,p_until timestamptz,p_reason text) returns uuid language plpgsql security definer set search_path=public as $$
declare result uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Server only';end if;
  if p_from is null or not isfinite(p_from) or p_from<now()-interval '5 minutes' or p_from>now()+interval '7 days' or (p_until is not null and not isfinite(p_until)) or (p_rate is not null and round(p_rate,8)<>p_rate) then raise exception 'Invalid effective window or precision';end if;
  perform pg_advisory_xact_lock(hashtextextended('recharge-fx-controls',0));
  if exists(select 1 from whatsapp_recharge_fx_controls where effective_from>=p_from) then raise exception 'Effective time must follow the latest control';end if;
  insert into whatsapp_recharge_fx_controls(mode,units_per_usd,effective_from,expires_at,actor_id,reason) values(p_mode,p_rate,p_from,p_until,p_actor,trim(p_reason)) returning id into result;
  return result;
end $$;
create function public.whatsapp_recharge_fx_snapshot() returns jsonb language plpgsql stable security definer set search_path=public as $$
declare control whatsapp_recharge_fx_controls;rate whatsapp_recharge_fx_rates;usable boolean;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Server only';end if;
  select * into control from whatsapp_recharge_fx_controls where effective_from<=now() order by effective_from desc limit 1;
  select * into rate from whatsapp_recharge_fx_rates order by provider_updated_at desc limit 1;
  usable:=case when control.mode='manual' then control.expires_at>now() else coalesce(rate.provider_updated_at>now()-interval '48 hours' and rate.next_update_at+interval '24 hours'>now(),false) end;
  return jsonb_build_object('mode',coalesce(control.mode,'automatic'),'usable',usable,'unitsPerUsd',case when usable then case when control.mode='manual' then control.units_per_usd::text else rate.units_per_usd::text end else null end,
    'rateId',case when control.mode='manual' then control.id else rate.id end,'automatic',to_jsonb(rate),'control',to_jsonb(control),
    'history',coalesce((select jsonb_agg(to_jsonb(h)) from(select * from whatsapp_recharge_fx_controls order by created_at desc limit 50)h),'[]'::jsonb));
end $$;
revoke all on function public.whatsapp_recharge_fx_claim_refresh(),public.whatsapp_recharge_fx_record(numeric,timestamptz,timestamptz),public.whatsapp_recharge_fx_set_control(uuid,text,numeric,timestamptz,timestamptz,text),public.whatsapp_recharge_fx_snapshot() from public,anon,authenticated;
grant execute on function public.whatsapp_recharge_fx_claim_refresh(),public.whatsapp_recharge_fx_record(numeric,timestamptz,timestamptz),public.whatsapp_recharge_fx_set_control(uuid,text,numeric,timestamptz,timestamptz,text),public.whatsapp_recharge_fx_snapshot() to service_role;
notify pgrst,'reload schema';
