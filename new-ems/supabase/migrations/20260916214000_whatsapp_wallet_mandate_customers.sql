-- One provider-customer creation attempt per tenant/mode. Unknown outcomes are
-- retained for explicit server reconciliation; no automatic duplicate POST.
create table public.whatsapp_platform_wallet_mandate_customer_attempts (
  tenant_id uuid not null, mode text not null, registration_id uuid not null,
  started_at timestamptz not null default now(),
  primary key(tenant_id,mode),
  foreign key(registration_id,tenant_id,mode) references public.whatsapp_platform_wallet_mandate_registrations(id,tenant_id,mode)
);
create table public.whatsapp_platform_wallet_mandate_customers (
  tenant_id uuid not null, mode text not null,
  provider_customer_id text not null check(provider_customer_id ~ '^cust_[A-Za-z0-9]+$'),
  created_at timestamptz not null default now(),
  primary key(tenant_id,mode), unique(mode,provider_customer_id),
  foreign key(tenant_id,mode) references public.whatsapp_platform_wallet_mandate_customer_attempts(tenant_id,mode)
);
alter table public.whatsapp_platform_wallet_mandate_customer_attempts enable row level security;
alter table public.whatsapp_platform_wallet_mandate_customers enable row level security;
revoke all on public.whatsapp_platform_wallet_mandate_customer_attempts,public.whatsapp_platform_wallet_mandate_customers from public,anon,authenticated;
grant select on public.whatsapp_platform_wallet_mandate_customer_attempts,public.whatsapp_platform_wallet_mandate_customers to service_role;
create trigger whatsapp_wallet_mandate_customer_attempt_immutable before update or delete on public.whatsapp_platform_wallet_mandate_customer_attempts
  for each row execute function public.whatsapp_wallet_fx_immutable();
create trigger whatsapp_wallet_mandate_customer_immutable before update or delete on public.whatsapp_platform_wallet_mandate_customers
  for each row execute function public.whatsapp_wallet_fx_immutable();

create function public.whatsapp_wallet_claim_mandate_customer(p_tenant uuid,p_mode text,p_registration uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare w public.whatsapp_platform_wallets; r public.whatsapp_platform_wallet_mandate_registrations;
  s public.whatsapp_platform_wallet_auto_topup_preferences;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Server only' using errcode='42501'; end if;
  select * into strict w from public.whatsapp_platform_wallets where tenant_id=p_tenant and mode=p_mode for update;
  select * into strict r from public.whatsapp_platform_wallet_mandate_registrations where id=p_registration and tenant_id=p_tenant and mode=p_mode;
  select * into strict s from public.whatsapp_platform_wallet_auto_topup_preferences where tenant_id=p_tenant and mode=p_mode for update;
  if w.enabled is distinct from true or w.currency is distinct from 'INR' or r.settings_snapshot is distinct from to_jsonb(s)
    or r.expires_at_seconds <= extract(epoch from now())
    or not exists(select 1 from public.whatsapp_platform_users where id=r.actor_id and tenant_id=p_tenant and status='active' and role_code in ('owner','admin'))
    or not exists(select 1 from public.whatsapp_platform_wallet_mandate_registration_slots where tenant_id=p_tenant and mode=p_mode and registration_id=r.id) then
    raise exception 'Current owned pending registration required'; end if;
  if exists(select 1 from public.whatsapp_platform_wallet_mandate_customer_attempts where tenant_id=p_tenant and mode=p_mode) then return false; end if;
  insert into public.whatsapp_platform_wallet_mandate_customer_attempts(tenant_id,mode,registration_id) values(p_tenant,p_mode,r.id);
  return true;
end; $$;
create function public.whatsapp_wallet_bind_mandate_customer(p_tenant uuid,p_mode text,p_customer jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.whatsapp_platform_wallet_mandate_customer_attempts;
  existing public.whatsapp_platform_wallet_mandate_customers; result public.whatsapp_platform_wallet_mandate_customers;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Server only' using errcode='42501'; end if;
  perform 1 from public.whatsapp_platform_wallets where tenant_id=p_tenant and mode=p_mode for update;
  select * into strict a from public.whatsapp_platform_wallet_mandate_customer_attempts where tenant_id=p_tenant and mode=p_mode;
  if p_customer->>'entity' is distinct from 'customer' or coalesce(p_customer->>'id','') !~ '^cust_[A-Za-z0-9]+$'
    or p_customer->'notes'->>'tenant_id' is distinct from p_tenant::text or p_customer->'notes'->>'mode' is distinct from p_mode
    or p_customer->'notes'->>'purpose' is distinct from 'varada_wallet_mandate_customer'
    or p_customer->'notes'->>'creation_registration_id' is distinct from a.registration_id::text then
    raise exception 'Provider customer creation identity mismatch'; end if;
  select * into existing from public.whatsapp_platform_wallet_mandate_customers where tenant_id=p_tenant and mode=p_mode;
  if existing.provider_customer_id is not null then
    if existing.provider_customer_id is distinct from p_customer->>'id' then raise exception 'Provider customer binding replay conflict'; end if;
    return to_jsonb(existing);
  end if;
  insert into public.whatsapp_platform_wallet_mandate_customers(tenant_id,mode,provider_customer_id)
    values(p_tenant,p_mode,p_customer->>'id') returning * into result;
  return to_jsonb(result);
end; $$;
revoke all on function public.whatsapp_wallet_claim_mandate_customer(uuid,text,uuid),public.whatsapp_wallet_bind_mandate_customer(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.whatsapp_wallet_claim_mandate_customer(uuid,text,uuid),public.whatsapp_wallet_bind_mandate_customer(uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';
