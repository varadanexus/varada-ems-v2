-- Test-only activation boundary for authenticated end-to-end recharge checks.
-- Live wallet activation remains intentionally unavailable and requires a
-- separately reviewed production rollout.
create function public.whatsapp_wallet_set_test_activation(
  p_tenant uuid,
  p_actor uuid,
  p_enabled boolean,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  before_row public.whatsapp_platform_wallets;
  after_row public.whatsapp_platform_wallets;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Server only' using errcode='42501';
  end if;
  if p_actor is null or coalesce(length(trim(p_reason)),0) not between 10 and 1000 then
    raise exception 'Actor and meaningful activation reason required';
  end if;
  if p_enabled is null then raise exception 'Activation state required'; end if;

  perform 1 from public.whatsapp_platform_users
   where id=p_actor and tenant_id=p_tenant and status='active' and role_code in ('owner','admin');
  if not found then raise exception 'Active workspace owner or admin required'; end if;

  select * into before_row from public.whatsapp_platform_wallets
   where tenant_id=p_tenant and mode='test' for update;
  if before_row.tenant_id is null then raise exception 'Test wallet is not configured'; end if;

  if p_enabled then
    perform 1 from public.whatsapp_platform_wallet_fx
     where currency=before_row.currency and valid_from<=now() and valid_until>now();
    if not found then raise exception 'Current wallet exchange-rate evidence required'; end if;

    perform 1 from public.whatsapp_platform_wallet_charge_policies
     where tenant_id=p_tenant and mode='test' and currency=before_row.currency
       and valid_from<=now() and valid_until>now();
    if not found then raise exception 'Current test recharge charge policy required'; end if;
  end if;

  if before_row.enabled is not distinct from p_enabled then return to_jsonb(before_row); end if;

  update public.whatsapp_platform_wallets
     set enabled=p_enabled,
         enabled_at=case when p_enabled then now() else null end,
         updated_at=now()
   where tenant_id=p_tenant and mode='test'
   returning * into after_row;

  insert into public.whatsapp_platform_wallet_config_audit(
    tenant_id,mode,actor_id,action,reason,before_values,after_values
  ) values (
    p_tenant,'test',p_actor,
    case when p_enabled then 'activate_test' else 'deactivate_test' end,
    trim(p_reason),to_jsonb(before_row),to_jsonb(after_row)
  );
  return to_jsonb(after_row);
end;
$$;

revoke all on function public.whatsapp_wallet_set_test_activation(uuid,uuid,boolean,text)
  from public,anon,authenticated;
grant execute on function public.whatsapp_wallet_set_test_activation(uuid,uuid,boolean,text)
  to service_role;

notify pgrst,'reload schema';
