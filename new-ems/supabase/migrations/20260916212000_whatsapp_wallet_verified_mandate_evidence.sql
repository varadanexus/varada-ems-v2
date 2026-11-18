-- Provider-verified authorization evidence only. No automatic-debit activation.
create table public.whatsapp_platform_wallet_verified_mandates (
  registration_id uuid primary key,
  tenant_id uuid not null,
  mode text not null,
  settings_revision integer not null,
  provider_customer_id text not null,
  provider_order_id text not null,
  provider_payment_id text not null check(provider_payment_id ~ '^pay_[A-Za-z0-9]+$'),
  provider_token_id text not null check(provider_token_id ~ '^token_[A-Za-z0-9]+$'),
  maximum_debit_minor bigint not null,
  expires_at timestamptz not null,
  verified_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  unique(mode,provider_payment_id),
  unique(mode,provider_token_id),
  foreign key(registration_id,tenant_id,mode)
    references public.whatsapp_platform_wallet_mandate_registrations(id,tenant_id,mode),
  foreign key(registration_id) references public.whatsapp_platform_wallet_mandate_orders(registration_id)
);
alter table public.whatsapp_platform_wallet_verified_mandates enable row level security;
revoke all on public.whatsapp_platform_wallet_verified_mandates from public,anon,authenticated;
grant select on public.whatsapp_platform_wallet_verified_mandates to service_role;
create trigger whatsapp_wallet_verified_mandate_immutable before update or delete on public.whatsapp_platform_wallet_verified_mandates
  for each row execute function public.whatsapp_wallet_fx_immutable();

create function public.whatsapp_wallet_record_verified_mandate(p_tenant uuid,p_mode text,p_registration uuid,p_evidence jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare w public.whatsapp_platform_wallets; s public.whatsapp_platform_wallet_auto_topup_preferences;
  r public.whatsapp_platform_wallet_mandate_registrations; o public.whatsapp_platform_wallet_mandate_orders;
  existing public.whatsapp_platform_wallet_verified_mandates; result public.whatsapp_platform_wallet_verified_mandates;
  evidence_expiry timestamptz; evidence_time timestamptz;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Server only' using errcode='42501'; end if;
  select * into strict w from public.whatsapp_platform_wallets where tenant_id=p_tenant and mode=p_mode for update;
  select * into strict r from public.whatsapp_platform_wallet_mandate_registrations where id=p_registration and tenant_id=p_tenant and mode=p_mode;
  select * into strict o from public.whatsapp_platform_wallet_mandate_orders where registration_id=r.id and tenant_id=p_tenant and mode=p_mode;
  evidence_expiry := (p_evidence->>'expiresAt')::timestamptz;
  evidence_time := (p_evidence->>'verifiedAt')::timestamptz;
  if p_evidence->>'registrationId' is distinct from r.id::text or p_evidence->'settingsRevision' is distinct from to_jsonb(r.settings_revision)
    or p_evidence->>'providerCustomerId' is distinct from o.provider_customer_id
    or p_evidence->>'providerOrderId' is distinct from o.provider_order_id
    or coalesce(p_evidence->>'providerPaymentId','') !~ '^pay_[A-Za-z0-9]+$'
    or coalesce(p_evidence->>'providerTokenId','') !~ '^token_[A-Za-z0-9]+$'
    or p_evidence->>'method' is distinct from 'emandate' or p_evidence->>'currency' is distinct from 'INR'
    or p_evidence->>'status' is distinct from 'confirmed' or p_evidence->'walletCreditMinor' is distinct from '0'::jsonb
    or p_evidence->'maximumDebitMinor' is distinct from to_jsonb(r.max_debit_minor)
    or evidence_expiry is distinct from to_timestamp(r.expires_at_seconds) or evidence_time is null then
    raise exception 'Verified mandate identity, limits or authorization evidence mismatch'; end if;
  select * into existing from public.whatsapp_platform_wallet_verified_mandates where registration_id=r.id;
  if existing.registration_id is not null then
    if existing.provider_payment_id is distinct from p_evidence->>'providerPaymentId'
      or existing.provider_token_id is distinct from p_evidence->>'providerTokenId' then raise exception 'Verified mandate replay conflict'; end if;
    -- Evidence retrieval is not proof that this mandate is still usable.
    return to_jsonb(existing);
  end if;
  select * into strict s from public.whatsapp_platform_wallet_auto_topup_preferences where tenant_id=p_tenant and mode=p_mode for update;
  if w.enabled is distinct from true or w.currency is distinct from 'INR' or r.settings_snapshot is distinct from to_jsonb(s)
    or evidence_expiry <= now() or evidence_time < now()-interval '10 minutes' or evidence_time > now()+interval '1 minute'
    or not exists(select 1 from public.whatsapp_platform_users where id=r.actor_id and tenant_id=p_tenant and status='active' and role_code in ('owner','admin'))
    or not exists(select 1 from public.whatsapp_platform_wallet_mandate_registration_slots where tenant_id=p_tenant and mode=p_mode and registration_id=r.id) then
    raise exception 'Fresh verification and current owned pending mandate settings required'; end if;
  insert into public.whatsapp_platform_wallet_verified_mandates(registration_id,tenant_id,mode,settings_revision,provider_customer_id,
    provider_order_id,provider_payment_id,provider_token_id,maximum_debit_minor,expires_at,verified_at)
    values(r.id,p_tenant,p_mode,r.settings_revision,o.provider_customer_id,o.provider_order_id,p_evidence->>'providerPaymentId',
      p_evidence->>'providerTokenId',r.max_debit_minor,evidence_expiry,evidence_time) returning * into result;
  return to_jsonb(result);
end; $$;
revoke all on function public.whatsapp_wallet_record_verified_mandate(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.whatsapp_wallet_record_verified_mandate(uuid,text,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
