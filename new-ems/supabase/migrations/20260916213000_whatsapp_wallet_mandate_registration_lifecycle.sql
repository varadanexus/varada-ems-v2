-- Terminal registration audit, not provider mandate cancellation/activation.
create table public.whatsapp_platform_wallet_mandate_registration_outcomes (
  registration_id uuid primary key,
  tenant_id uuid not null,
  mode text not null,
  outcome text not null check(outcome in ('abandoned_before_provider','authorization_verified')),
  actor_id uuid not null references public.whatsapp_platform_users(id),
  reason text not null check(length(reason) between 10 and 1000),
  created_at timestamptz not null default now(),
  foreign key(registration_id,tenant_id,mode)
    references public.whatsapp_platform_wallet_mandate_registrations(id,tenant_id,mode)
);
alter table public.whatsapp_platform_wallet_mandate_registration_outcomes enable row level security;
revoke all on public.whatsapp_platform_wallet_mandate_registration_outcomes from public,anon,authenticated;
grant select on public.whatsapp_platform_wallet_mandate_registration_outcomes to service_role;
create trigger whatsapp_wallet_mandate_registration_outcome_immutable before update or delete on public.whatsapp_platform_wallet_mandate_registration_outcomes
  for each row execute function public.whatsapp_wallet_fx_immutable();

create function public.whatsapp_wallet_close_mandate_registration(p_tenant uuid,p_mode text,p_user uuid,
  p_registration uuid,p_outcome text,p_reason text,p_confirmed boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.whatsapp_platform_wallet_mandate_registrations;
  existing public.whatsapp_platform_wallet_mandate_registration_outcomes;
  result public.whatsapp_platform_wallet_mandate_registration_outcomes;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Server only' using errcode='42501'; end if;
  if p_confirmed is distinct from true or p_outcome is null or p_outcome not in ('abandoned_before_provider','authorization_verified')
    or p_reason is null or length(trim(p_reason)) not between 10 and 1000 then raise exception 'Explicit registration outcome confirmation and reason required'; end if;
  if not exists(select 1 from public.whatsapp_platform_users where id=p_user and tenant_id=p_tenant and status='active' and role_code in ('owner','admin')) then
    raise exception 'Active workspace owner or admin required'; end if;
  perform 1 from public.whatsapp_platform_wallets where tenant_id=p_tenant and mode=p_mode for update;
  select * into strict r from public.whatsapp_platform_wallet_mandate_registrations where id=p_registration and tenant_id=p_tenant and mode=p_mode;
  select * into existing from public.whatsapp_platform_wallet_mandate_registration_outcomes where registration_id=r.id;
  if existing.registration_id is not null then
    if existing.outcome is distinct from p_outcome or existing.actor_id is distinct from p_user or existing.reason is distinct from trim(p_reason) then
      raise exception 'Registration outcome replay conflict'; end if;
    return to_jsonb(existing);
  end if;
  if not exists(select 1 from public.whatsapp_platform_wallet_mandate_registration_slots where tenant_id=p_tenant and mode=p_mode and registration_id=r.id) then
    raise exception 'Pending registration required'; end if;
  if p_outcome='abandoned_before_provider' then
    if exists(select 1 from public.whatsapp_platform_wallet_mandate_order_attempts where registration_id=r.id) then
      raise exception 'Provider attempt exists; reconcile authorization instead of abandoning'; end if;
  elsif not exists(select 1 from public.whatsapp_platform_wallet_verified_mandates where registration_id=r.id and tenant_id=p_tenant and mode=p_mode) then
    raise exception 'Verified provider authorization evidence required';
  end if;
  insert into public.whatsapp_platform_wallet_mandate_registration_outcomes(registration_id,tenant_id,mode,outcome,actor_id,reason)
    values(r.id,p_tenant,p_mode,p_outcome,p_user,trim(p_reason)) returning * into result;
  delete from public.whatsapp_platform_wallet_mandate_registration_slots where tenant_id=p_tenant and mode=p_mode and registration_id=r.id;
  -- No provider cancellation, automatic debit activation or funds movement.
  return to_jsonb(result);
end; $$;
revoke all on function public.whatsapp_wallet_close_mandate_registration(uuid,text,uuid,uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.whatsapp_wallet_close_mandate_registration(uuid,text,uuid,uuid,text,text,boolean) to service_role;
notify pgrst,'reload schema';
