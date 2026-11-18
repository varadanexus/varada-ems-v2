-- Append-only rate evidence. No invented market rate is seeded here.
alter table public.whatsapp_platform_wallet_fx
  add column recorded_by uuid,
  add column recorded_reason text,
  add column source_reference text;

create function public.whatsapp_wallet_publish_fx(p_actor uuid,p_currency text,p_units_per_usd numeric,
  p_valid_from timestamptz,p_valid_until timestamptz,p_source text,p_reference text,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare rate public.whatsapp_platform_wallet_fx;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Server only' using errcode='42501'; end if;
  if p_actor is null or p_reason is null or length(trim(p_reason)) not between 10 and 1000 then raise exception 'Actor and meaningful reason required'; end if;
  if p_currency is null or p_currency !~ '^[A-Z]{3}$' or p_currency='USD' then raise exception 'USD is fixed at one; select a non-USD currency'; end if;
  if p_units_per_usd is null or p_units_per_usd<=0 or p_units_per_usd>100000000 or round(p_units_per_usd,8)<>p_units_per_usd then raise exception 'Invalid exchange rate precision or range'; end if;
  if p_valid_from is null or p_valid_until is null or not isfinite(p_valid_from) or not isfinite(p_valid_until)
    or p_valid_until<=p_valid_from or p_valid_until-p_valid_from>interval '7 days' then raise exception 'Rate evidence needs a finite validity period of up to seven days'; end if;
  if p_source is null or length(trim(p_source)) not between 3 and 200 or p_reference is null or length(trim(p_reference)) not between 5 and 1000 then raise exception 'Rate source and reference are required'; end if;
  -- All writers use the same currency lock; conflicting quote windows cannot
  -- silently change which rate will be selected for a historical timestamp.
  perform pg_advisory_xact_lock(hashtextextended('whatsapp-wallet-fx:'||p_currency,0));
  if exists(select 1 from public.whatsapp_platform_wallet_fx where currency=p_currency
    and valid_from<p_valid_until and valid_until>p_valid_from) then raise exception 'Rate validity overlaps existing immutable evidence'; end if;
  insert into public.whatsapp_platform_wallet_fx(currency,units_per_usd,valid_from,valid_until,source,recorded_by,recorded_reason,source_reference)
    values(p_currency,p_units_per_usd,p_valid_from,p_valid_until,trim(p_source),p_actor,trim(p_reason),trim(p_reference)) returning * into rate;
  return to_jsonb(rate);
end; $$;
revoke all on function public.whatsapp_wallet_publish_fx(uuid,text,numeric,timestamptz,timestamptz,text,text,text) from public,anon,authenticated;
grant execute on function public.whatsapp_wallet_publish_fx(uuid,text,numeric,timestamptz,timestamptz,text,text,text) to service_role;
notify pgrst,'reload schema';
