-- Minimal signed-provider billing evidence, independent of inbox processing.
-- No message body, contact details, credential, or raw webhook is retained here.
create table public.whatsapp_platform_wallet_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null,
  mode text not null,
  connection_id uuid not null references public.whatsapp_platform_connections(id),
  meta_message_id text not null check(length(meta_message_id) between 1 and 200),
  event_kind text not null check(event_kind in ('inbound','sent','delivered','read','failed')),
  message_type text not null,
  occurred_at timestamptz not null,
  error_code text,
  meta_pricing jsonb not null default '{}',
  callback_usage_id uuid references public.whatsapp_platform_wallet_usage(id),
  processing_status text not null default 'pending' check(processing_status in ('pending','processed')),
  attempts integer not null default 0,
  last_error text,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  foreign key(tenant_id,mode) references public.whatsapp_platform_wallets(tenant_id,mode),
  unique(mode,meta_message_id,event_kind)
);
alter table public.whatsapp_platform_wallet_events enable row level security;
revoke all on public.whatsapp_platform_wallet_events from public,anon,authenticated;
grant select on public.whatsapp_platform_wallet_events to service_role;
create index whatsapp_wallet_events_retry on public.whatsapp_platform_wallet_events(next_attempt_at,id) where processing_status='pending';

create function public.whatsapp_wallet_process_event(p_event bigint)
returns boolean language plpgsql security definer set search_path=public as $$
declare e public.whatsapp_platform_wallet_events; result jsonb;
begin
  -- Direct service-role callers and the private pg_cron wrapper are allowed.
  -- The wrapper has no JWT claim; its EXECUTE privilege is revoked from API roles.
  if auth.role() is distinct from 'service_role' and auth.role() is not null then raise exception 'Server only' using errcode='42501'; end if;
  select * into strict e from public.whatsapp_platform_wallet_events where id=p_event for update;
  if e.processing_status='processed' then return true; end if;
  begin
    -- Disabling a wallet pauses queued accounting, not silently discards it.
    perform 1 from public.whatsapp_platform_wallets where tenant_id=e.tenant_id and mode=e.mode and enabled for update;
    if not found then
      raise exception 'Wallet processing paused';
    end if;
    if e.event_kind='inbound' then
      result:=public.whatsapp_wallet_inbound(e.tenant_id,e.mode,e.connection_id,e.meta_message_id,e.message_type,e.occurred_at);
      if result->>'enabled' is distinct from 'true' then raise exception 'Wallet processing paused'; end if;
    else
      if e.callback_usage_id is not null then
        if not exists(select 1 from public.whatsapp_platform_wallet_usage where id=e.callback_usage_id
          and tenant_id=e.tenant_id and mode=e.mode and connection_id=e.connection_id and direction='outbound') then
          raise exception 'Callback reservation ownership mismatch';
        end if;
        perform public.whatsapp_wallet_bind(e.callback_usage_id,e.meta_message_id);
      end if;
      perform public.whatsapp_wallet_record_delivery(e.tenant_id,e.mode,e.connection_id,e.meta_message_id,e.event_kind,e.error_code,e.meta_pricing);
    end if;
    update public.whatsapp_platform_wallet_events set processing_status='processed',attempts=attempts+1,
      last_error=null,processed_at=now() where id=e.id;
    return true;
  exception when others then
    -- Nested transaction rolls back failed billing only; evidence survives.
    update public.whatsapp_platform_wallet_events set attempts=attempts+1,last_error=left(sqlerrm,500),
      next_attempt_at=now()+make_interval(secs=>least(3600,30*power(2,least(e.attempts,7)))::integer) where id=e.id;
    return false;
  end;
end; $$;

create function public.whatsapp_wallet_enqueue_event(p_tenant uuid,p_mode text,p_connection uuid,p_meta_id text,
  p_kind text,p_message_type text,p_occurred_at timestamptz,p_error text default null,p_pricing jsonb default '{}',p_callback_usage uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare e public.whatsapp_platform_wallet_events;
begin
  if auth.role() is distinct from 'service_role' and auth.role() is not null then raise exception 'Server only' using errcode='42501'; end if;
  if not exists(select 1 from public.whatsapp_platform_connections where id=p_connection and tenant_id=p_tenant) then
    raise exception 'Connection does not belong to workspace';
  end if;
  if not exists(select 1 from public.whatsapp_platform_wallets where tenant_id=p_tenant and mode=p_mode and enabled) then
    return jsonb_build_object('enabled',false);
  end if;
  insert into public.whatsapp_platform_wallet_events(tenant_id,mode,connection_id,meta_message_id,event_kind,message_type,occurred_at,error_code,meta_pricing,callback_usage_id)
    values(p_tenant,p_mode,p_connection,p_meta_id,p_kind,p_message_type,p_occurred_at,left(p_error,160),coalesce(p_pricing,'{}'),p_callback_usage)
    on conflict(mode,meta_message_id,event_kind) do nothing returning * into e;
  if e.id is null then
    select * into strict e from public.whatsapp_platform_wallet_events where mode=p_mode and meta_message_id=p_meta_id and event_kind=p_kind;
    if e.tenant_id<>p_tenant or e.connection_id<>p_connection then raise exception 'Cross-workspace billing event conflict'; end if;
  end if;
  return jsonb_build_object('enabled',true,'eventId',e.id,'processed',public.whatsapp_wallet_process_event(e.id));
end; $$;

create function public.whatsapp_wallet_retry_events(p_limit integer default 100)
returns integer language plpgsql security definer set search_path=public as $$
declare e record; processed integer:=0;
begin
  if auth.role() is distinct from 'service_role' and auth.role() is not null then raise exception 'Server only' using errcode='42501'; end if;
  for e in select id from public.whatsapp_platform_wallet_events where processing_status='pending' and next_attempt_at<=now()
    order by next_attempt_at,id limit least(500,greatest(1,coalesce(p_limit,100))) for update skip locked loop
    if public.whatsapp_wallet_process_event(e.id) then processed:=processed+1; end if;
  end loop;
  return processed;
end; $$;

revoke all on function public.whatsapp_wallet_process_event(bigint),
  public.whatsapp_wallet_enqueue_event(uuid,text,uuid,text,text,text,timestamptz,text,jsonb,uuid),
  public.whatsapp_wallet_retry_events(integer) from public,anon,authenticated;
grant execute on function public.whatsapp_wallet_process_event(bigint),
  public.whatsapp_wallet_enqueue_event(uuid,text,uuid,text,text,text,timestamptz,text,jsonb,uuid),
  public.whatsapp_wallet_retry_events(integer) to service_role;

-- Only the database owner/scheduler can assume the service claim for this narrow
-- SQL-only runner. It cannot be invoked by browser or service-role REST clients.
create function public.whatsapp_wallet_scheduled_retry()
returns integer language sql security definer set search_path=public
as $$ select public.whatsapp_wallet_retry_events(100); $$;
revoke all on function public.whatsapp_wallet_scheduled_retry() from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
