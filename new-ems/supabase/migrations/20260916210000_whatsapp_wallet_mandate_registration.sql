-- Registration intent only: no provider call, active mandate, debit or credit.
create table public.whatsapp_platform_wallet_mandate_registrations (
  id uuid primary key,
  tenant_id uuid not null,
  mode text not null check (mode in ('test','live')),
  actor_id uuid not null references public.whatsapp_platform_users(id),
  currency text not null check (currency = 'INR'),
  settings_revision integer not null check (settings_revision > 0),
  settings_snapshot jsonb not null,
  max_debit_minor bigint not null check (max_debit_minor between 1 and 1000000000),
  expires_at_seconds bigint not null,
  consent_version text not null check (consent_version = 'auto-topup-emandate-v1'),
  confirmed boolean not null check (confirmed),
  created_at timestamptz not null default now(),
  unique (id,tenant_id,mode),
  foreign key (tenant_id,mode) references public.whatsapp_platform_wallets(tenant_id,mode)
);
-- Keep the in-flight slot even after expiry: an unknown provider outcome must
-- be reconciled before another registration is permitted.
create table public.whatsapp_platform_wallet_mandate_registration_slots (
  tenant_id uuid not null,
  mode text not null,
  registration_id uuid not null,
  primary key (tenant_id,mode),
  foreign key (registration_id,tenant_id,mode)
    references public.whatsapp_platform_wallet_mandate_registrations(id,tenant_id,mode)
);
alter table public.whatsapp_platform_wallet_mandate_registrations enable row level security;
alter table public.whatsapp_platform_wallet_mandate_registration_slots enable row level security;
revoke all on public.whatsapp_platform_wallet_mandate_registrations,public.whatsapp_platform_wallet_mandate_registration_slots from public,anon,authenticated;
grant select on public.whatsapp_platform_wallet_mandate_registrations,public.whatsapp_platform_wallet_mandate_registration_slots to service_role;
create trigger whatsapp_wallet_mandate_registration_immutable before update or delete
  on public.whatsapp_platform_wallet_mandate_registrations
  for each row execute function public.whatsapp_wallet_fx_immutable();

create function public.whatsapp_wallet_begin_mandate_registration(p_tenant uuid,p_mode text,p_user uuid,
  p_id uuid,p_revision integer,p_expires bigint,p_consent text,p_confirmed boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare w public.whatsapp_platform_wallets;
  s public.whatsapp_platform_wallet_auto_topup_preferences;
  previous public.whatsapp_platform_wallet_mandate_registrations;
  result public.whatsapp_platform_wallet_mandate_registrations;
  epoch_now bigint := floor(extract(epoch from now()));
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Server only' using errcode='42501'; end if;
  if p_id is null or p_mode is null or p_mode not in ('test','live') or p_confirmed is distinct from true
    or p_consent is distinct from 'auto-topup-emandate-v1' then raise exception 'Explicit current mandate consent required'; end if;
  if not exists(select 1 from public.whatsapp_platform_users where id=p_user and tenant_id=p_tenant
    and status='active' and role_code in ('owner','admin')) then raise exception 'Active workspace owner or admin required'; end if;
  select * into strict w from public.whatsapp_platform_wallets where tenant_id=p_tenant and mode=p_mode for update;
  select * into strict s from public.whatsapp_platform_wallet_auto_topup_preferences where tenant_id=p_tenant and mode=p_mode for update;
  if w.enabled is distinct from true or w.currency is distinct from 'INR' or s.currency is distinct from w.currency
    or s.requested_enabled is distinct from true or s.state is distinct from 'awaiting_mandate'
    or s.revision is distinct from p_revision or s.consent_version is distinct from 'auto-topup-nonrefundable-v1' then
    raise exception 'Active INR wallet and current pending settings required'; end if;
  select * into previous from public.whatsapp_platform_wallet_mandate_registrations where id=p_id;
  if previous.id is not null then
    if previous.tenant_id is distinct from p_tenant or previous.mode is distinct from p_mode
      or previous.actor_id is distinct from p_user or previous.settings_snapshot is distinct from to_jsonb(s)
      or previous.expires_at_seconds is distinct from p_expires then raise exception 'Mandate registration replay conflict'; end if;
    if not exists(select 1 from public.whatsapp_platform_wallet_mandate_registration_slots
      where tenant_id=p_tenant and mode=p_mode and registration_id=p_id) then raise exception 'Registration is no longer pending'; end if;
    return to_jsonb(previous);
  end if;
  if p_expires is null or p_expires <= epoch_now or p_expires > epoch_now + 366*86400 then
    raise exception 'Approved mandate expiry invalid'; end if;
  if exists(select 1 from public.whatsapp_platform_wallet_mandate_registration_slots where tenant_id=p_tenant and mode=p_mode) then
    raise exception 'A mandate registration is already pending; reconcile it before retrying'; end if;
  insert into public.whatsapp_platform_wallet_mandate_registrations
    (id,tenant_id,mode,actor_id,currency,settings_revision,settings_snapshot,max_debit_minor,expires_at_seconds,consent_version,confirmed)
    values(p_id,p_tenant,p_mode,p_user,w.currency,s.revision,to_jsonb(s),s.max_debit_minor,p_expires,p_consent,true)
    returning * into result;
  insert into public.whatsapp_platform_wallet_mandate_registration_slots values(p_tenant,p_mode,p_id);
  return to_jsonb(result);
end; $$;
revoke all on function public.whatsapp_wallet_begin_mandate_registration(uuid,text,uuid,uuid,integer,bigint,text,boolean) from public,anon,authenticated;
grant execute on function public.whatsapp_wallet_begin_mandate_registration(uuid,text,uuid,uuid,integer,bigint,text,boolean) to service_role;
notify pgrst,'reload schema';
