alter table public.whatsapp_platform_wallet_config_audit add column actor_kind text not null default 'staff' check(actor_kind in ('staff','customer'));

create function public.whatsapp_wallet_choose_currency(p_tenant uuid,p_user uuid,p_mode text,p_currency text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare old_wallet public.whatsapp_platform_wallets; new_wallet public.whatsapp_platform_wallets;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Server only' using errcode='42501'; end if;
  if not exists(select 1 from public.whatsapp_platform_users where id=p_user and tenant_id=p_tenant and status='active' and role_code in ('owner','admin')) then
    raise exception 'Only workspace owners or admins can choose wallet currency' using errcode='42501';
  end if;
  if p_mode is null or p_mode not in ('test','live') or p_currency is null or p_currency !~ '^[A-Z]{3}$' then raise exception 'Invalid wallet currency or mode'; end if;
  perform 1 from public.whatsapp_platform_tenants where id=p_tenant for update;
  select * into old_wallet from public.whatsapp_platform_wallets where tenant_id=p_tenant and mode=p_mode for update;
  if old_wallet.tenant_id is not null and old_wallet.currency=p_currency then return to_jsonb(old_wallet); end if;
  insert into public.whatsapp_platform_wallets(tenant_id,mode,currency) values(p_tenant,p_mode,p_currency)
    on conflict(tenant_id,mode) do update set currency=excluded.currency,updated_at=now() returning * into new_wallet;
  -- Existing currency guard blocks changes after activation or financial activity.
  insert into public.whatsapp_platform_wallet_config_audit(tenant_id,mode,actor_id,actor_kind,action,reason,before_values,after_values)
    values(p_tenant,p_mode,p_user,'customer','choose_currency','Customer selected native wallet currency',
      case when old_wallet.tenant_id is null then null else to_jsonb(old_wallet) end,to_jsonb(new_wallet));
  return to_jsonb(new_wallet);
end; $$;
revoke all on function public.whatsapp_wallet_choose_currency(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.whatsapp_wallet_choose_currency(uuid,uuid,text,text) to service_role;
notify pgrst,'reload schema';
