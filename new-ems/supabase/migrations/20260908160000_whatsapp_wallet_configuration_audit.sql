create table public.whatsapp_platform_wallet_config_audit (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.whatsapp_platform_tenants(id),
  mode text not null check(mode in ('test','live')),
  actor_id uuid not null,
  action text not null,
  reason text not null check(length(trim(reason)) between 10 and 1000),
  before_values jsonb,
  after_values jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.whatsapp_platform_wallet_config_audit enable row level security;
revoke all on public.whatsapp_platform_wallet_config_audit from public,anon,authenticated;
grant select on public.whatsapp_platform_wallet_config_audit to service_role;
create trigger whatsapp_wallet_configuration_immutable before update or delete on public.whatsapp_platform_wallet_config_audit
  for each row execute function public.whatsapp_wallet_ledger_immutable();

-- Actor identity is supplied by the authenticated EMS billing endpoint, never
-- accepted from a customer request. This operation cannot activate or credit.
create function public.whatsapp_wallet_configure(p_tenant uuid,p_mode text,p_actor uuid,p_currency text,
  p_minimum_available bigint,p_low_balance bigint,p_minimum_topup bigint,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare before_row public.whatsapp_platform_wallets; after_row public.whatsapp_platform_wallets;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Server only' using errcode='42501'; end if;
  if p_actor is null or p_reason is null or length(trim(p_reason)) not between 10 and 1000 then raise exception 'Actor and meaningful change reason required'; end if;
  if p_mode not in ('test','live') or p_currency is null or p_currency !~ '^[A-Z]{3}$' then raise exception 'Invalid wallet currency or mode'; end if;
  if p_minimum_available is null or p_minimum_available<0 or p_minimum_available>1000000000000
    or p_low_balance is null or p_low_balance<p_minimum_available or p_low_balance>1000000000000
    or p_minimum_topup is null or p_minimum_topup<1000000 or p_minimum_topup>1000000000000 then raise exception 'Invalid wallet thresholds'; end if;
  -- Tenant lock also serializes first-time creation before there is a wallet row.
  perform 1 from public.whatsapp_platform_tenants where id=p_tenant for update;
  if not found then raise exception 'Workspace not found'; end if;
  select * into before_row from public.whatsapp_platform_wallets where tenant_id=p_tenant and mode=p_mode for update;
  insert into public.whatsapp_platform_wallets(tenant_id,mode,currency,minimum_available_usd_micros,low_balance_usd_micros,minimum_topup_usd_micros)
    values(p_tenant,p_mode,p_currency,p_minimum_available,p_low_balance,p_minimum_topup)
    on conflict(tenant_id,mode) do update set currency=excluded.currency,
      minimum_available_usd_micros=excluded.minimum_available_usd_micros,
      low_balance_usd_micros=excluded.low_balance_usd_micros,minimum_topup_usd_micros=excluded.minimum_topup_usd_micros,updated_at=now()
    returning * into after_row;
  insert into public.whatsapp_platform_wallet_config_audit(tenant_id,mode,actor_id,action,reason,before_values,after_values)
    values(p_tenant,p_mode,p_actor,'configure',trim(p_reason),case when before_row.tenant_id is null then null else to_jsonb(before_row) end,to_jsonb(after_row));
  return to_jsonb(after_row);
end; $$;
revoke all on function public.whatsapp_wallet_configure(uuid,text,uuid,text,bigint,bigint,bigint,text) from public,anon,authenticated;
grant execute on function public.whatsapp_wallet_configure(uuid,text,uuid,text,bigint,bigint,bigint,text) to service_role;
notify pgrst,'reload schema';
