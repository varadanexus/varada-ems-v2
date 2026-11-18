-- Versioned PAYG message pricing. Global prices are public; tenant overrides
-- remain private. Every usage row snapshots the effective version and amount.
create table public.whatsapp_platform_message_price_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.whatsapp_platform_tenants(id) on delete restrict,
  usd_rate_micros bigint not null check(usd_rate_micros between 1 and 1000000),
  usd_failed_rate_micros bigint not null check(usd_failed_rate_micros between 0 and usd_rate_micros),
  valid_from timestamptz not null,
  valid_until timestamptz not null check(valid_until>valid_from),
  verified_by uuid not null,
  reason text not null check(length(trim(reason)) between 10 and 1000),
  created_at timestamptz not null default now()
);
create index whatsapp_message_price_lookup on public.whatsapp_platform_message_price_versions(tenant_id,valid_from desc,valid_until);
alter table public.whatsapp_platform_message_price_versions enable row level security;
revoke all on public.whatsapp_platform_message_price_versions from public,anon,authenticated;
grant select on public.whatsapp_platform_message_price_versions to service_role;
create trigger whatsapp_message_price_immutable before update or delete on public.whatsapp_platform_message_price_versions
for each row execute function public.whatsapp_wallet_fx_immutable();

-- Preserve the already-approved USD 0.0035 / 0.0007 prices as the first
-- global version. Future changes append; they never rewrite usage history.
insert into public.whatsapp_platform_message_price_versions(
  tenant_id,usd_rate_micros,usd_failed_rate_micros,valid_from,valid_until,verified_by,reason
) values (
  null,3500,700,'2026-09-08 00:00:00+00','2036-09-08 00:00:00+00',
  '29b046aa-565b-49cf-980f-77879c6c66ed','Initial approved PAYG platform message prices migrated from the release configuration'
);

create function public.whatsapp_wallet_publish_message_price(
  p_actor uuid,p_tenant uuid,p_rate bigint,p_failed_rate bigint,
  p_from timestamptz,p_until timestamptz,p_reason text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare result public.whatsapp_platform_message_price_versions;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Server only' using errcode='42501'; end if;
  if p_actor is null or coalesce(length(trim(p_reason)),0) not between 10 and 1000 then raise exception 'Reviewer and meaningful reason required'; end if;
  if p_rate is null or p_rate not between 1 and 1000000 or p_failed_rate is null or p_failed_rate not between 0 and p_rate then raise exception 'Invalid USD micro-unit message prices'; end if;
  if p_from is null or p_until is null or not isfinite(p_from) or not isfinite(p_until) or p_until<=p_from or p_until-p_from>interval '3660 days' then raise exception 'Finite price validity of up to ten years required'; end if;
  if p_tenant is not null and not exists(select 1 from public.whatsapp_platform_tenants where id=p_tenant) then raise exception 'Customer workspace not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('whatsapp-message-price:'||coalesce(p_tenant::text,'global'),0));
  -- Existing rows are immutable evidence. A newer row supersedes an older
  -- active row because resolvers always choose the latest valid_from value.
  -- This avoids rewriting the approved history merely to close its interval.
  if exists(select 1 from public.whatsapp_platform_message_price_versions
    where tenant_id is not distinct from p_tenant and valid_from>=p_from) then
    raise exception 'Message price must start after the latest published version';
  end if;
  insert into public.whatsapp_platform_message_price_versions(tenant_id,usd_rate_micros,usd_failed_rate_micros,valid_from,valid_until,verified_by,reason)
    values(p_tenant,p_rate,p_failed_rate,p_from,p_until,p_actor,trim(p_reason)) returning * into result;
  return to_jsonb(result);
end; $$;
revoke all on function public.whatsapp_wallet_publish_message_price(uuid,uuid,bigint,bigint,timestamptz,timestamptz,text) from public,anon,authenticated;
grant execute on function public.whatsapp_wallet_publish_message_price(uuid,uuid,bigint,bigint,timestamptz,timestamptz,text) to service_role;

create function public.whatsapp_wallet_resolve_message_price(p_tenant uuid,p_at timestamptz default now())
returns public.whatsapp_platform_message_price_versions language plpgsql stable security definer set search_path=public as $$
declare result public.whatsapp_platform_message_price_versions;
begin
  select * into result from public.whatsapp_platform_message_price_versions
   where tenant_id=p_tenant and valid_from<=p_at and valid_until>p_at order by valid_from desc,created_at desc limit 1;
  if result.id is null then
    select * into result from public.whatsapp_platform_message_price_versions
     where tenant_id is null and valid_from<=p_at and valid_until>p_at order by valid_from desc,created_at desc limit 1;
  end if;
  if result.id is null then raise exception 'Current message price is unavailable'; end if;
  return result;
end; $$;
revoke all on function public.whatsapp_wallet_resolve_message_price(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.whatsapp_wallet_resolve_message_price(uuid,timestamptz) to service_role;

create function public.whatsapp_platform_public_message_price()
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('currency','USD','rateMicros',p.usd_rate_micros,
    'failedRateMicros',p.usd_failed_rate_micros,'validFrom',p.valid_from,'validUntil',p.valid_until)
  from public.whatsapp_platform_message_price_versions p
  where p.tenant_id is null and p.valid_from<=now() and p.valid_until>now()
  order by p.valid_from desc,p.created_at desc limit 1
$$;
revoke all on function public.whatsapp_platform_public_message_price() from public;
grant execute on function public.whatsapp_platform_public_message_price() to anon,authenticated,service_role;

alter table public.whatsapp_platform_wallet_usage
  drop constraint if exists whatsapp_platform_wallet_usage_usd_rate_micros_check,
  drop constraint if exists whatsapp_platform_wallet_usage_usd_failed_rate_micros_check,
  add column price_version_id uuid references public.whatsapp_platform_message_price_versions(id) on delete restrict,
  add constraint whatsapp_wallet_usage_usd_rate_check check(usd_rate_micros between 1 and 1000000),
  add constraint whatsapp_wallet_usage_usd_failed_rate_check check(usd_failed_rate_micros between 0 and usd_rate_micros);

create or replace function public.whatsapp_wallet_reserve(p_tenant uuid,p_mode text,p_connection uuid,p_request_key text,p_source text,p_message_type text,p_request_hash text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare w public.whatsapp_platform_wallets; u public.whatsapp_platform_wallet_usage; fx public.whatsapp_platform_wallet_fx; price public.whatsapp_platform_message_price_versions; rate bigint;
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
  price:=public.whatsapp_wallet_resolve_message_price(p_tenant,now());
  rate:=ceil(price.usd_rate_micros*fx.units_per_usd)::bigint;
  if w.balance_micros-w.reserved_micros-rate<ceil(w.minimum_available_usd_micros*fx.units_per_usd)::bigint then raise exception 'Insufficient Varada balance. Recharge to send messages.' using errcode='P0001'; end if;
  insert into public.whatsapp_platform_wallet_usage(tenant_id,mode,connection_id,request_key,request_hash,source,message_type,direction,state,reserved_micros,currency,fx_quote_id,fx_units_per_usd,rate_micros,failed_rate_micros,usd_rate_micros,usd_failed_rate_micros,price_version_id)
    values(p_tenant,p_mode,p_connection,p_request_key,p_request_hash,p_source,p_message_type,'outbound','reserved',rate,w.currency,fx.id,fx.units_per_usd,rate,ceil(price.usd_failed_rate_micros*fx.units_per_usd)::bigint,price.usd_rate_micros,price.usd_failed_rate_micros,price.id) returning * into u;
  perform public.whatsapp_wallet_post(p_tenant,p_mode,'reserve:'||u.id,'reserve',0,rate,'Outgoing message fee reserved',u.id);
  return jsonb_build_object('enabled',true,'duplicate',false,'usageId',u.id);
end; $$;

create or replace function public.whatsapp_wallet_inbound(p_tenant uuid,p_mode text,p_connection uuid,p_meta_id text,p_message_type text,p_occurred_at timestamptz)
returns jsonb language plpgsql security definer set search_path=public as $$
declare w public.whatsapp_platform_wallets; u public.whatsapp_platform_wallet_usage; fx public.whatsapp_platform_wallet_fx; price public.whatsapp_platform_message_price_versions; rate bigint;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Server only' using errcode='42501'; end if;
  select * into w from public.whatsapp_platform_wallets where tenant_id=p_tenant and mode=p_mode for update;
  if not found or not w.enabled then return jsonb_build_object('enabled',false); end if;
  if p_meta_id is null or length(p_meta_id)=0 then raise exception 'Message identifier required'; end if;
  if not exists(select 1 from public.whatsapp_platform_connections where id=p_connection and tenant_id=p_tenant) then raise exception 'Connection does not belong to workspace'; end if;
  if p_occurred_at is null or w.enabled_at is null or p_occurred_at<w.enabled_at then return jsonb_build_object('enabled',true,'historical',true); end if;
  select * into fx from public.whatsapp_platform_wallet_fx where currency=w.currency and valid_from<=p_occurred_at and valid_until>p_occurred_at order by valid_from desc,created_at desc limit 1;
  if not found then raise exception 'Exchange-rate evidence missing for incoming usage; reconciliation required'; end if;
  price:=public.whatsapp_wallet_resolve_message_price(p_tenant,p_occurred_at);
  rate:=ceil(price.usd_rate_micros*fx.units_per_usd)::bigint;
  insert into public.whatsapp_platform_wallet_usage(tenant_id,mode,connection_id,request_key,meta_message_id,direction,source,message_type,state,charged_micros,occurred_at,currency,fx_quote_id,fx_units_per_usd,rate_micros,failed_rate_micros,usd_rate_micros,usd_failed_rate_micros,price_version_id)
    values(p_tenant,p_mode,p_connection,'inbound:'||p_meta_id,p_meta_id,'inbound','webhook',p_message_type,'charged',rate,p_occurred_at,w.currency,fx.id,fx.units_per_usd,rate,ceil(price.usd_failed_rate_micros*fx.units_per_usd)::bigint,price.usd_rate_micros,price.usd_failed_rate_micros,price.id)
    on conflict(mode,meta_message_id) do nothing returning * into u;
  if u.id is null then
    select * into strict u from public.whatsapp_platform_wallet_usage where mode=p_mode and meta_message_id=p_meta_id;
    if u.tenant_id<>p_tenant or u.connection_id<>p_connection or u.direction<>'inbound' then raise exception 'Cross-workspace incoming identifier conflict'; end if;
    return jsonb_build_object('enabled',true,'duplicate',true);
  end if;
  perform public.whatsapp_wallet_post(p_tenant,p_mode,'inbound:'||u.id,'capture',-rate,0,'Incoming message handling',u.id);
  return jsonb_build_object('enabled',true,'usageId',u.id);
end; $$;

revoke all on function public.whatsapp_wallet_reserve(uuid,text,uuid,text,text,text,text),public.whatsapp_wallet_inbound(uuid,text,uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.whatsapp_wallet_reserve(uuid,text,uuid,text,text,text,text),public.whatsapp_wallet_inbound(uuid,text,uuid,text,text,timestamptz) to service_role;
notify pgrst,'reload schema';
