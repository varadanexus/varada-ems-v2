-- Use the durable event stream as the platform-log source. This captures all
-- present and future channel events (contacts, conversations, messages and
-- campaigns) without coupling the monitor to the WhatsApp message table.
drop trigger if exists whatsapp_platform_message_developer_log on public.whatsapp_platform_messages;

create or replace function public.whatsapp_platform_log_developer_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_summary text;
begin
  v_status := coalesce(nullif(new.data #>> '{data,status}', ''), 'recorded');
  v_summary := case
    when new.event_type = 'message.received' then 'Inbound message received'
    when new.event_type = 'message.sent' then 'Outbound message accepted'
    when new.event_type = 'message.status' then 'Message delivery status changed'
    when new.event_type = 'contact.created' then 'Contact created'
    when new.event_type = 'contact.updated' then 'Contact updated'
    when new.event_type = 'conversation.created' then 'Conversation created'
    when new.event_type = 'conversation.updated' then 'Conversation updated'
    when new.event_type = 'campaign.completed' then 'Campaign completed'
    else initcap(replace(new.event_type, '.', ' '))
  end;
  insert into public.whatsapp_platform_developer_logs
    (tenant_id, connection_id, product, channel, category, event_type, status, summary, resource_id, metadata, created_at)
  values
    (new.tenant_id, new.connection_id, 'messaging', 'whatsapp', 'platform', new.event_type,
     v_status, v_summary, new.resource_id,
     jsonb_build_object('developerEventId', new.id, 'eventKey', new.event_key, 'occurredAt', new.occurred_at),
     new.created_at);
  return new;
end $$;

drop trigger if exists whatsapp_platform_developer_event_log on public.whatsapp_platform_developer_events;
create trigger whatsapp_platform_developer_event_log
after insert on public.whatsapp_platform_developer_events
for each row execute function public.whatsapp_platform_log_developer_event();

revoke all on function public.whatsapp_platform_log_developer_event() from public, anon, authenticated;
grant execute on function public.whatsapp_platform_log_developer_event() to service_role;

comment on column public.whatsapp_platform_developer_logs.product is 'Product family such as messaging, email, voice or verify.';
comment on column public.whatsapp_platform_developer_logs.channel is 'Delivery channel such as whatsapp, sms, rcs, email or voice.';
notify pgrst, 'reload schema';
