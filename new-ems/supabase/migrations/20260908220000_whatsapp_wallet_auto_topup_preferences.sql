-- Customer preferences only. No debit scheduler, provider token or active mandate
-- is created here. A verified provider mandate/activation flow is still required.
create table public.whatsapp_platform_wallet_auto_topup_preferences (
  tenant_id uuid not null,
  mode text not null,
  currency text not null,
  revision integer not null default 1,
  requested_enabled boolean not null default false,
  state text not null check(state in ('disabled','awaiting_mandate')),
  threshold_minor bigint not null check(threshold_minor>=0),
  credit_minor bigint not null check(credit_minor>0),
  max_debit_minor bigint not null check(max_debit_minor>=credit_minor),
  monthly_cap_minor bigint not null check(monthly_cap_minor>=max_debit_minor),
  consent_version text not null,
  updated_by uuid not null references public.whatsapp_platform_users(id),
  updated_at timestamptz not null default now(),
  primary key(tenant_id,mode),
  foreign key(tenant_id,mode) references public.whatsapp_platform_wallets(tenant_id,mode)
);
create table public.whatsapp_platform_wallet_auto_topup_audit (
  id bigint generated always as identity primary key,
  tenant_id uuid not null,
  mode text not null,
  revision integer not null,
  actor_id uuid not null references public.whatsapp_platform_users(id),
  previous_settings jsonb,
  settings jsonb not null,
  created_at timestamptz not null default now(),
  unique(tenant_id,mode,revision),
  foreign key(tenant_id,mode) references public.whatsapp_platform_wallets(tenant_id,mode)
);
alter table public.whatsapp_platform_wallet_auto_topup_preferences enable row level security;
alter table public.whatsapp_platform_wallet_auto_topup_audit enable row level security;
revoke all on public.whatsapp_platform_wallet_auto_topup_preferences,public.whatsapp_platform_wallet_auto_topup_audit from public,anon,authenticated;
grant select on public.whatsapp_platform_wallet_auto_topup_preferences,public.whatsapp_platform_wallet_auto_topup_audit to service_role;
create trigger whatsapp_wallet_auto_topup_audit_immutable before update or delete on public.whatsapp_platform_wallet_auto_topup_audit
for each row execute function public.whatsapp_wallet_fx_immutable();

create function public.whatsapp_wallet_save_auto_topup(p_tenant uuid,p_mode text,p_user uuid,p_revision integer,p_enabled boolean,
  p_threshold bigint,p_credit bigint,p_max_debit bigint,p_monthly_cap bigint,p_consent text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare w public.whatsapp_platform_wallets; old_settings public.whatsapp_platform_wallet_auto_topup_preferences;
  result public.whatsapp_platform_wallet_auto_topup_preferences;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Server only' using errcode='42501'; end if;
  if not exists(select 1 from public.whatsapp_platform_users where id=p_user and tenant_id=p_tenant and status='active' and role_code in ('owner','admin')) then
    raise exception 'Active workspace owner or admin required'; end if;
  select * into strict w from public.whatsapp_platform_wallets where tenant_id=p_tenant and mode=p_mode for update;
  if w.currency not in ('INR','USD') then raise exception 'Auto top-up currency not supported'; end if;
  if p_enabled is null or p_threshold is null or p_threshold not between 0 and 1000000000
    or p_credit is null or p_credit not between 1 and 1000000000
    or p_max_debit is null or p_max_debit not between p_credit and 1000000000
    or p_monthly_cap is null or p_monthly_cap not between p_max_debit and 1000000000 then raise exception 'Invalid auto top-up limits'; end if;
  if p_consent is distinct from 'auto-topup-nonrefundable-v1' then raise exception 'Current auto top-up policy acceptance required'; end if;
  select * into old_settings from public.whatsapp_platform_wallet_auto_topup_preferences where tenant_id=p_tenant and mode=p_mode;
  if p_revision is distinct from coalesce(old_settings.revision,0) then raise exception 'Auto top-up settings changed; refresh before saving'; end if;
  insert into public.whatsapp_platform_wallet_auto_topup_preferences(tenant_id,mode,currency,revision,requested_enabled,state,
    threshold_minor,credit_minor,max_debit_minor,monthly_cap_minor,consent_version,updated_by)
    values(p_tenant,p_mode,w.currency,coalesce(old_settings.revision,0)+1,p_enabled,case when p_enabled then 'awaiting_mandate' else 'disabled' end,
      p_threshold,p_credit,p_max_debit,p_monthly_cap,p_consent,p_user)
    on conflict(tenant_id,mode) do update set currency=excluded.currency,revision=excluded.revision,
      requested_enabled=excluded.requested_enabled,state=excluded.state,threshold_minor=excluded.threshold_minor,
      credit_minor=excluded.credit_minor,max_debit_minor=excluded.max_debit_minor,monthly_cap_minor=excluded.monthly_cap_minor,
      consent_version=excluded.consent_version,updated_by=excluded.updated_by,updated_at=now()
    returning * into result;
  insert into public.whatsapp_platform_wallet_auto_topup_audit(tenant_id,mode,revision,actor_id,previous_settings,settings)
    values(p_tenant,p_mode,result.revision,p_user,case when old_settings.tenant_id is null then null else to_jsonb(old_settings) end,to_jsonb(result));
  return to_jsonb(result);
end; $$;
revoke all on function public.whatsapp_wallet_save_auto_topup(uuid,text,uuid,integer,boolean,bigint,bigint,bigint,bigint,text) from public,anon,authenticated;
grant execute on function public.whatsapp_wallet_save_auto_topup(uuid,text,uuid,integer,boolean,bigint,bigint,bigint,bigint,text) to service_role;
notify pgrst,'reload schema';
