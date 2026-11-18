create table public.whatsapp_platform_wallet_alert_state (
  tenant_id uuid not null,
  mode text not null,
  is_low boolean not null default false,
  episode bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key(tenant_id,mode),
  foreign key(tenant_id,mode) references public.whatsapp_platform_wallets(tenant_id,mode)
);
alter table public.whatsapp_platform_wallet_alert_state enable row level security;
revoke all on public.whatsapp_platform_wallet_alert_state from public,anon,authenticated;
grant select on public.whatsapp_platform_wallet_alert_state to service_role;

create function public.whatsapp_wallet_check_balance_alerts()
returns integer language plpgsql security definer set search_path=public as $$
declare w record; rate numeric; threshold bigint; available bigint; s public.whatsapp_platform_wallet_alert_state;
  low boolean; sent integer:=0; recipients integer;
begin
  if auth.role() is distinct from 'service_role' and auth.role() is not null then raise exception 'Server only' using errcode='42501'; end if;
  -- Single runner keeps episode state consistent without locking message wallets.
  if not pg_try_advisory_xact_lock(hashtextextended('whatsapp-wallet-balance-alerts',0)) then return 0; end if;
  for w in select * from public.whatsapp_platform_wallets where enabled loop
    select units_per_usd into rate from public.whatsapp_platform_wallet_fx where currency=w.currency
      and valid_from<=now() and valid_until>now() order by valid_from desc,created_at desc limit 1;
    if not found then continue; end if; -- FX availability is a separate operational alert.
    threshold:=ceil(w.low_balance_usd_micros*rate);available:=w.balance_micros-w.reserved_micros;
    low:=available<threshold;
    insert into public.whatsapp_platform_wallet_alert_state(tenant_id,mode) values(w.tenant_id,w.mode) on conflict do nothing;
    select * into strict s from public.whatsapp_platform_wallet_alert_state where tenant_id=w.tenant_id and mode=w.mode for update;
    if low and not s.is_low then
      recipients:=public.whatsapp_platform_dispatch_notification(w.tenant_id,'wallet_low_balance',
        case when w.mode='test' then 'Test wallet balance is low' else 'Service balance is low' end,
        'Your '||w.currency||' service balance is below the configured alert threshold. Review reserved charges and recharge to keep sending. Meta payments are separate.',
        'warning','billing','Review balance','/whatsapp-platform/workspace/billing/',
        'whatsapp_platform_wallet',w.tenant_id::text,'wallet-low:'||w.mode||':'||w.tenant_id||':'||(s.episode+1),
        array['owner','admin'],jsonb_build_object('mode',w.mode,'currency',w.currency,'available_micros',available::text,'threshold_micros',threshold::text));
      if recipients>0 then
        update public.whatsapp_platform_wallet_alert_state set is_low=true,episode=episode+1,updated_at=now() where tenant_id=w.tenant_id and mode=w.mode;
        sent:=sent+recipients;
      end if;
    elsif not low and s.is_low then
      update public.whatsapp_platform_wallet_alert_state set is_low=false,updated_at=now() where tenant_id=w.tenant_id and mode=w.mode;
    end if;
  end loop;
  return sent;
end; $$;
revoke all on function public.whatsapp_wallet_check_balance_alerts() from public,anon,authenticated;
grant execute on function public.whatsapp_wallet_check_balance_alerts() to service_role;

create function public.whatsapp_wallet_scheduled_alerts()
returns integer language sql security definer set search_path=public
as $$ select public.whatsapp_wallet_check_balance_alerts(); $$;
revoke all on function public.whatsapp_wallet_scheduled_alerts() from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
