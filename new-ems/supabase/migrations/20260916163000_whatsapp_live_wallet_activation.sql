-- Audited activation boundary for production PAYG wallets.
-- Installing this migration never activates a wallet. Full-authority EMS staff
-- must explicitly confirm activation through the billing Edge Function.

alter table public.whatsapp_platform_wallet_config_audit
  add column if not exists evidence_reference text;

create or replace function public.whatsapp_wallet_set_activation(
  p_tenant uuid,
  p_mode text,
  p_actor uuid,
  p_enabled boolean,
  p_reason text,
  p_evidence_reference text,
  p_confirmed boolean
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  before_row public.whatsapp_platform_wallets;
  after_row public.whatsapp_platform_wallets;
  runtime_mode text;
  current_count integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Server only' using errcode='42501';
  end if;
  if p_actor is null or coalesce(length(trim(p_reason)),0) not between 10 and 1000 then
    raise exception 'Actor and meaningful activation reason required';
  end if;
  if p_mode not in ('test','live') or p_enabled is null or p_confirmed is not true then
    raise exception 'Confirmed wallet mode and activation state required';
  end if;
  if p_mode='live' and coalesce(length(trim(p_evidence_reference)),0) not between 5 and 1000 then
    raise exception 'Live transition evidence reference required';
  end if;

  perform 1 from public.whatsapp_platform_tenants where id=p_tenant and status='active' for update;
  if not found then raise exception 'Active workspace required'; end if;

  select * into before_row from public.whatsapp_platform_wallets
   where tenant_id=p_tenant and mode=p_mode for update;
  if before_row.tenant_id is null then raise exception 'Wallet is not configured in this mode'; end if;

  if p_enabled then
    select provider_mode into runtime_mode
      from public.whatsapp_platform_billing_runtime where singleton=true;
    if runtime_mode is distinct from p_mode then
      raise exception 'Billing runtime and wallet activation mode do not match';
    end if;
    if before_row.currency not in ('INR','USD') then
      raise exception 'Only verified INR or USD wallet currencies can be activated';
    end if;

    select count(*) into current_count from public.whatsapp_platform_wallet_fx
     where currency=before_row.currency and valid_from<=now() and valid_until>now();
    if current_count<>1 then raise exception 'Exactly one current wallet exchange-rate record required'; end if;

    select count(*) into current_count from public.whatsapp_platform_wallet_charge_policies
     where tenant_id=p_tenant and mode=p_mode and currency=before_row.currency
       and valid_from<=now() and valid_until>now();
    if current_count<>1 then raise exception 'Exactly one current recharge charge policy required'; end if;

    -- Raises if neither a customer override nor the global price is current.
    perform public.whatsapp_wallet_resolve_message_price(p_tenant,now());

    if exists(select 1 from public.whatsapp_platform_wallet_events
      where tenant_id=p_tenant and mode=p_mode and processing_status='pending') then
      raise exception 'Pending wallet events must be reconciled before activation';
    end if;
    if exists(select 1 from public.whatsapp_platform_wallet_recharges
      where tenant_id=p_tenant and mode=p_mode and state<>'captured'
        and (provider_order_id is not null or order_creation_started_at is not null)) then
      raise exception 'Unresolved provider recharge must be reconciled before activation';
    end if;

    if p_mode='live' then
      if exists(select 1 from public.whatsapp_platform_billing_subscriptions
        where tenant_id=p_tenant and coalesce(safe_metadata->>'mode','') not in ('test','live')) then
        raise exception 'Subscription provider mode must be verified before Live activation';
      end if;
      if exists(select 1 from public.whatsapp_platform_billing_subscriptions
        where tenant_id=p_tenant and safe_metadata->>'mode'='live'
          and (
            subscription_kind='package'
            or subscription_kind<>'addon'
            or addon_code not in ('extra_agent_seat','extra_whatsapp_number','extra_integration')
          )
          and (
            lower(coalesce(status,'')) not in ('cancelled','completed','expired')
            or current_end is null
            or current_end>now()
          )) then
        raise exception 'Live package or included-feature subscription must be cancelled and paid-through service reconciled before activation';
      end if;
    end if;
  end if;

  if before_row.enabled is not distinct from p_enabled then
    return jsonb_build_object('wallet',to_jsonb(before_row),'changed',false);
  end if;

  update public.whatsapp_platform_wallets
     set enabled=p_enabled,
         enabled_at=case when p_enabled then now() else null end,
         updated_at=now()
   where tenant_id=p_tenant and mode=p_mode
   returning * into after_row;

  insert into public.whatsapp_platform_wallet_config_audit(
    tenant_id,mode,actor_id,action,reason,evidence_reference,before_values,after_values
  ) values (
    p_tenant,p_mode,p_actor,
    case when p_enabled then 'activate_'||p_mode else 'deactivate_'||p_mode end,
    trim(p_reason),nullif(trim(p_evidence_reference),''),to_jsonb(before_row),to_jsonb(after_row)
  );
  return jsonb_build_object('wallet',to_jsonb(after_row),'changed',true);
end;
$$;

revoke all on function public.whatsapp_wallet_set_activation(uuid,text,uuid,boolean,text,text,boolean)
  from public,anon,authenticated;
grant execute on function public.whatsapp_wallet_set_activation(uuid,text,uuid,boolean,text,text,boolean)
  to service_role;

comment on function public.whatsapp_wallet_set_activation(uuid,text,uuid,boolean,text,text,boolean) is
  'Server-only audited PAYG wallet activation. Live activation fails closed on runtime, pricing, FX, charge-policy, pending-payment and legacy-subscription transition checks.';

notify pgrst,'reload schema';
