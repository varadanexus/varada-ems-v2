-- Calculator-only Meta references. Never used by wallet metering.
create table public.whatsapp_platform_meta_rate_versions (
  id uuid primary key default gen_random_uuid(),
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  marketing_micros bigint check (marketing_micros between 0 and 10000000),
  utility_micros bigint check (utility_micros between 0 and 10000000),
  authentication_micros bigint check (authentication_micros between 0 and 10000000),
  effective_from timestamptz not null,
  source_reference text not null check (length(source_reference) between 10 and 1000),
  reason text not null check (length(trim(reason)) between 10 and 1000),
  actor_id uuid not null,
  created_at timestamptz not null default now()
);
alter table public.whatsapp_platform_meta_rate_versions enable row level security;
revoke all on public.whatsapp_platform_meta_rate_versions from public,anon,authenticated;
grant select on public.whatsapp_platform_meta_rate_versions to service_role;
create index whatsapp_meta_reference_lookup on public.whatsapp_platform_meta_rate_versions(country_code,effective_from desc);
create trigger whatsapp_meta_reference_immutable before update or delete on public.whatsapp_platform_meta_rate_versions
for each row execute function public.whatsapp_wallet_fx_immutable();

create function public.whatsapp_meta_publish_reference(p_actor uuid,p_country text,p_marketing bigint,p_utility bigint,p_authentication bigint,p_from timestamptz,p_source text,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result public.whatsapp_platform_meta_rate_versions;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Server only' using errcode='42501'; end if;
  if p_actor is null or p_from is null then raise exception 'Actor and effective date required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('meta-reference:'||p_country,0));
  if exists(select 1 from public.whatsapp_platform_meta_rate_versions where country_code=p_country and effective_from>=p_from) then
    raise exception 'Effective date must follow the latest published version';
  end if;
  insert into public.whatsapp_platform_meta_rate_versions(country_code,marketing_micros,utility_micros,authentication_micros,effective_from,source_reference,reason,actor_id)
  values(p_country,p_marketing,p_utility,p_authentication,p_from,p_source,trim(p_reason),p_actor) returning * into result;
  return to_jsonb(result);
end $$;
revoke all on function public.whatsapp_meta_publish_reference(uuid,text,bigint,bigint,bigint,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.whatsapp_meta_publish_reference(uuid,text,bigint,bigint,bigint,timestamptz,text,text) to service_role;

create function public.whatsapp_platform_public_meta_rates()
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object('iso',r.country_code,'marketing',r.marketing_micros::numeric/1000000,'utility',r.utility_micros::numeric/1000000,'authentication',r.authentication_micros::numeric/1000000,'effectiveFrom',r.effective_from)),'[]'::jsonb)
  from (select distinct on(country_code) * from public.whatsapp_platform_meta_rate_versions where effective_from<=now() order by country_code,effective_from desc,created_at desc) r;
$$;
revoke all on function public.whatsapp_platform_public_meta_rates() from public;
grant execute on function public.whatsapp_platform_public_meta_rates() to anon,authenticated,service_role;
