-- Immutable provider identity binding. Does not activate a mandate or debit.
create table public.whatsapp_platform_wallet_mandate_order_attempts (
  registration_id uuid primary key references public.whatsapp_platform_wallet_mandate_registrations(id),
  provider_customer_id text not null check (provider_customer_id ~ '^cust_[A-Za-z0-9]+$'),
  started_at timestamptz not null default now()
);
alter table public.whatsapp_platform_wallet_mandate_order_attempts enable row level security;
revoke all on public.whatsapp_platform_wallet_mandate_order_attempts from public,anon,authenticated;
grant select on public.whatsapp_platform_wallet_mandate_order_attempts to service_role;
create trigger whatsapp_wallet_mandate_order_attempt_immutable before update or delete on public.whatsapp_platform_wallet_mandate_order_attempts
  for each row execute function public.whatsapp_wallet_fx_immutable();

create function public.whatsapp_wallet_claim_mandate_order(p_tenant uuid,p_mode text,p_registration uuid,p_customer jsonb)
returns boolean language plpgsql security definer set search_path=public as $$
declare r public.whatsapp_platform_wallet_mandate_registrations;
  s public.whatsapp_platform_wallet_auto_topup_preferences;
  w public.whatsapp_platform_wallets;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Server only' using errcode='42501'; end if;
  select * into strict w from public.whatsapp_platform_wallets where tenant_id=p_tenant and mode=p_mode for update;
  select * into strict r from public.whatsapp_platform_wallet_mandate_registrations where id=p_registration and tenant_id=p_tenant and mode=p_mode;
  select * into strict s from public.whatsapp_platform_wallet_auto_topup_preferences where tenant_id=p_tenant and mode=p_mode for update;
  if w.enabled is distinct from true or w.currency is distinct from 'INR' or r.settings_snapshot is distinct from to_jsonb(s)
    or r.expires_at_seconds <= extract(epoch from now())
    or not exists(select 1 from public.whatsapp_platform_users where id=r.actor_id and tenant_id=p_tenant and status='active' and role_code in ('owner','admin'))
    or not exists(select 1 from public.whatsapp_platform_wallet_mandate_registration_slots where tenant_id=p_tenant and mode=p_mode and registration_id=r.id) then
    raise exception 'Current owned pending mandate settings required'; end if;
  if p_customer->>'entity' is distinct from 'customer' or coalesce(p_customer->>'id','') !~ '^cust_[A-Za-z0-9]+$'
    or p_customer->'notes'->>'tenant_id' is distinct from p_tenant::text or p_customer->'notes'->>'mode' is distinct from p_mode
    or p_customer->'notes'->>'purpose' is distinct from 'varada_wallet_mandate_customer' then raise exception 'Provider customer ownership mismatch'; end if;
  if exists(select 1 from public.whatsapp_platform_wallet_mandate_order_attempts where registration_id=r.id) then
    if not exists(select 1 from public.whatsapp_platform_wallet_mandate_order_attempts where registration_id=r.id and provider_customer_id=p_customer->>'id') then
      raise exception 'Provider customer attempt conflict'; end if;
    return false;
  end if;
  insert into public.whatsapp_platform_wallet_mandate_order_attempts(registration_id,provider_customer_id) values(r.id,p_customer->>'id');
  return true;
end; $$;
revoke all on function public.whatsapp_wallet_claim_mandate_order(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.whatsapp_wallet_claim_mandate_order(uuid,text,uuid,jsonb) to service_role;

create table public.whatsapp_platform_wallet_mandate_orders (
  registration_id uuid primary key,
  tenant_id uuid not null,
  mode text not null,
  provider_customer_id text not null check (provider_customer_id ~ '^cust_[A-Za-z0-9]+$'),
  provider_order_id text not null check (provider_order_id ~ '^order_[A-Za-z0-9]+$'),
  created_at timestamptz not null default now(),
  unique (mode,provider_order_id),
  foreign key (registration_id,tenant_id,mode)
    references public.whatsapp_platform_wallet_mandate_registrations(id,tenant_id,mode)
);
alter table public.whatsapp_platform_wallet_mandate_orders enable row level security;
revoke all on public.whatsapp_platform_wallet_mandate_orders from public,anon,authenticated;
grant select on public.whatsapp_platform_wallet_mandate_orders to service_role;
create trigger whatsapp_wallet_mandate_order_immutable before update or delete on public.whatsapp_platform_wallet_mandate_orders
  for each row execute function public.whatsapp_wallet_fx_immutable();

create function public.whatsapp_wallet_bind_mandate_order(p_tenant uuid,p_mode text,p_registration uuid,p_customer jsonb,p_order jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.whatsapp_platform_wallet_mandate_registrations;
  existing public.whatsapp_platform_wallet_mandate_orders;
  result public.whatsapp_platform_wallet_mandate_orders;
  s public.whatsapp_platform_wallet_auto_topup_preferences;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Server only' using errcode='42501'; end if;
  perform 1 from public.whatsapp_platform_wallets where tenant_id=p_tenant and mode=p_mode for update;
  select * into strict r from public.whatsapp_platform_wallet_mandate_registrations
    where id=p_registration and tenant_id=p_tenant and mode=p_mode;
  if not exists(select 1 from public.whatsapp_platform_wallet_mandate_registration_slots
    where tenant_id=p_tenant and mode=p_mode and registration_id=r.id) then raise exception 'Pending registration required'; end if;
  if not exists(select 1 from public.whatsapp_platform_wallet_mandate_order_attempts
    where registration_id=r.id and provider_customer_id=p_customer->>'id') then raise exception 'Matching claimed order attempt required'; end if;
  -- Identity and zero amount are checked before persistence; raw provider bank,
  -- contact and token-secret fields are deliberately never stored here.
  if p_customer->>'entity' is distinct from 'customer' or coalesce(p_customer->>'id','') !~ '^cust_[A-Za-z0-9]+$'
    or p_customer->'notes'->>'tenant_id' is distinct from p_tenant::text
    or p_customer->'notes'->>'mode' is distinct from p_mode
    or p_customer->'notes'->>'purpose' is distinct from 'varada_wallet_mandate_customer'
    or p_order->>'entity' is distinct from 'order' or coalesce(p_order->>'id','') !~ '^order_[A-Za-z0-9]+$'
    or p_order->'amount' is distinct from '0'::jsonb or p_order->>'currency' is distinct from 'INR'
    or p_order->>'receipt' is distinct from r.id::text
    or p_order->'notes'->>'tenant_id' is distinct from p_tenant::text
    or p_order->'notes'->>'mode' is distinct from p_mode
    or p_order->'notes'->>'purpose' is distinct from 'varada_wallet_mandate'
    or p_order->'notes'->>'registration_id' is distinct from r.id::text
    or p_order->'notes'->>'settings_revision' is distinct from r.settings_revision::text
    or (p_order ? 'customer_id' and p_order->>'customer_id' is distinct from p_customer->>'id') then
    raise exception 'Provider mandate order or customer ownership mismatch'; end if;
  select * into existing from public.whatsapp_platform_wallet_mandate_orders where registration_id=r.id;
  if existing.registration_id is not null then
    if existing.provider_order_id is distinct from p_order->>'id'
      or existing.provider_customer_id is distinct from p_customer->>'id' then raise exception 'Mandate order binding replay conflict'; end if;
    return to_jsonb(existing);
  end if;
  -- Persist recovery evidence even if settings changed while the external order
  -- was created. It cannot be used for activation without current snapshot checks.
  select * into strict s from public.whatsapp_platform_wallet_auto_topup_preferences where tenant_id=p_tenant and mode=p_mode for update;
  insert into public.whatsapp_platform_wallet_mandate_orders(registration_id,tenant_id,mode,provider_customer_id,provider_order_id)
    values(r.id,p_tenant,p_mode,p_customer->>'id',p_order->>'id') returning * into result;
  return to_jsonb(result);
end; $$;
revoke all on function public.whatsapp_wallet_bind_mandate_order(uuid,text,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.whatsapp_wallet_bind_mandate_order(uuid,text,uuid,jsonb,jsonb) to service_role;
notify pgrst,'reload schema';
