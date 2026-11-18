-- Commercial WhatsApp pricing catalogue used by the public pricing page and
-- private customer offers. This is deliberately separate from the active
-- wallet meter: publishing a marketing rate must not silently change wallet
-- deductions before category-aware PAYG charging is approved and deployed.
create table public.whatsapp_platform_message_rate_cards (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.whatsapp_platform_tenants(id) on delete restrict,
  usd_incoming_rate_micros bigint not null check (usd_incoming_rate_micros between 1 and 1000000),
  usd_service_rate_micros bigint not null check (usd_service_rate_micros between 1 and 1000000),
  usd_utility_rate_micros bigint not null check (usd_utility_rate_micros between 1 and 1000000),
  usd_authentication_rate_micros bigint not null check (usd_authentication_rate_micros between 1 and 1000000),
  usd_marketing_rate_micros bigint not null check (usd_marketing_rate_micros between 1 and 1000000),
  usd_failed_rate_micros bigint not null check (usd_failed_rate_micros between 0 and 1000000),
  valid_from timestamptz not null,
  valid_until timestamptz not null check (valid_until > valid_from),
  verified_by uuid not null,
  reason text not null check (length(trim(reason)) between 10 and 1000),
  created_at timestamptz not null default now()
);

create index whatsapp_message_rate_card_lookup
  on public.whatsapp_platform_message_rate_cards(tenant_id,valid_from desc,valid_until);
alter table public.whatsapp_platform_message_rate_cards enable row level security;
revoke all on public.whatsapp_platform_message_rate_cards from public,anon,authenticated;
grant select on public.whatsapp_platform_message_rate_cards to service_role;
create trigger whatsapp_message_rate_card_immutable
  before update or delete on public.whatsapp_platform_message_rate_cards
  for each row execute function public.whatsapp_wallet_fx_immutable();

-- Preserve the approved public offer as the first independently editable
-- category card. Historical wallet price versions remain untouched.
insert into public.whatsapp_platform_message_rate_cards(
  tenant_id,usd_incoming_rate_micros,usd_service_rate_micros,
  usd_utility_rate_micros,usd_authentication_rate_micros,
  usd_marketing_rate_micros,usd_failed_rate_micros,
  valid_from,valid_until,verified_by,reason
) values (
  null,3500,3500,3500,3500,3500,700,
  '2026-09-08 00:00:00+00','2036-09-08 00:00:00+00',
  '29b046aa-565b-49cf-980f-77879c6c66ed',
  'Initial category rate card derived from the approved public PAYG message offer'
);

create function public.whatsapp_pricing_publish_rate_card(
  p_actor uuid,p_tenant uuid,
  p_incoming_rate bigint,p_service_rate bigint,p_utility_rate bigint,
  p_authentication_rate bigint,p_marketing_rate bigint,p_failed_rate bigint,
  p_from timestamptz,p_until timestamptz,p_reason text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare result public.whatsapp_platform_message_rate_cards;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Server only' using errcode='42501';
  end if;
  if p_actor is null or coalesce(length(trim(p_reason)),0) not between 10 and 1000 then
    raise exception 'Reviewer and meaningful reason required';
  end if;
  if p_incoming_rate not between 1 and 1000000
    or p_service_rate not between 1 and 1000000
    or p_utility_rate not between 1 and 1000000
    or p_authentication_rate not between 1 and 1000000
    or p_marketing_rate not between 1 and 1000000
    or p_failed_rate not between 0 and 1000000 then
    raise exception 'Invalid USD micro-unit message prices';
  end if;
  if p_from is null or p_until is null or not isfinite(p_from) or not isfinite(p_until)
    or p_until<=p_from or p_until-p_from>interval '3660 days' then
    raise exception 'Finite price validity of up to ten years required';
  end if;
  if p_tenant is not null and not exists(
    select 1 from public.whatsapp_platform_tenants where id=p_tenant
  ) then raise exception 'Customer workspace not found'; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'whatsapp-commercial-rate-card:'||coalesce(p_tenant::text,'global'),0
  ));
  if exists(
    select 1 from public.whatsapp_platform_message_rate_cards
    where tenant_id is not distinct from p_tenant and valid_from>=p_from
  ) then raise exception 'Message rate card must start after the latest published version'; end if;

  insert into public.whatsapp_platform_message_rate_cards(
    tenant_id,usd_incoming_rate_micros,usd_service_rate_micros,
    usd_utility_rate_micros,usd_authentication_rate_micros,
    usd_marketing_rate_micros,usd_failed_rate_micros,
    valid_from,valid_until,verified_by,reason
  ) values (
    p_tenant,p_incoming_rate,p_service_rate,p_utility_rate,
    p_authentication_rate,p_marketing_rate,p_failed_rate,
    p_from,p_until,p_actor,trim(p_reason)
  ) returning * into result;
  return to_jsonb(result);
end; $$;
revoke all on function public.whatsapp_pricing_publish_rate_card(uuid,uuid,bigint,bigint,bigint,bigint,bigint,bigint,timestamptz,timestamptz,text) from public,anon,authenticated;
grant execute on function public.whatsapp_pricing_publish_rate_card(uuid,uuid,bigint,bigint,bigint,bigint,bigint,bigint,timestamptz,timestamptz,text) to service_role;

create function public.whatsapp_pricing_resolve_rate_card(
  p_tenant uuid,p_at timestamptz default now()
) returns public.whatsapp_platform_message_rate_cards
language plpgsql stable security definer set search_path=public as $$
declare result public.whatsapp_platform_message_rate_cards;
begin
  select * into result from public.whatsapp_platform_message_rate_cards
  where tenant_id=p_tenant and valid_from<=p_at and valid_until>p_at
  order by valid_from desc,created_at desc limit 1;
  if result.id is null then
    select * into result from public.whatsapp_platform_message_rate_cards
    where tenant_id is null and valid_from<=p_at and valid_until>p_at
    order by valid_from desc,created_at desc limit 1;
  end if;
  if result.id is null then raise exception 'Current commercial message rate card is unavailable'; end if;
  return result;
end; $$;
revoke all on function public.whatsapp_pricing_resolve_rate_card(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.whatsapp_pricing_resolve_rate_card(uuid,timestamptz) to service_role;

create or replace function public.whatsapp_platform_public_message_price()
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'currency','USD',
    -- Backward compatible values for older clients.
    'rateMicros',p.usd_incoming_rate_micros,
    'failedRateMicros',p.usd_failed_rate_micros,
    'rates',jsonb_build_object(
      'incoming',p.usd_incoming_rate_micros,
      'service',p.usd_service_rate_micros,
      'utility',p.usd_utility_rate_micros,
      'authentication',p.usd_authentication_rate_micros,
      'marketing',p.usd_marketing_rate_micros
    ),
    'validFrom',p.valid_from,'validUntil',p.valid_until
  )
  from public.whatsapp_platform_message_rate_cards p
  where p.tenant_id is null and p.valid_from<=now() and p.valid_until>now()
  order by p.valid_from desc,p.created_at desc limit 1
$$;
revoke all on function public.whatsapp_platform_public_message_price() from public;
grant execute on function public.whatsapp_platform_public_message_price() to anon,authenticated,service_role;

notify pgrst,'reload schema';
