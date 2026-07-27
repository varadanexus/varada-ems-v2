-- Omnichannel campaign delivery for Notification Studio.
-- In-app remains the immutable source of truth; push, email and WhatsApp are
-- independently delivered and audited per recipient.

alter table public.notification_events
  add column if not exists whatsapp_dispatched_at timestamptz;

create table if not exists public.notification_channel_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.notification_campaigns(id) on delete cascade,
  notification_id uuid not null references public.notification_events(id) on delete cascade,
  channel text not null,
  identity_kind text not null,
  identity_id uuid not null,
  destination text,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  provider_message_id text,
  provider_payload jsonb not null default '{}'::jsonb,
  last_error text,
  first_attempt_at timestamptz,
  last_attempt_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_channel_kind_chk check (channel in ('email','whatsapp')),
  constraint notification_channel_identity_chk check (identity_kind in ('staff','external_portal','transport_portal','direct')),
  constraint notification_channel_status_chk check (status in ('pending','processing','sent','failed','skipped')),
  constraint notification_channel_recipient_uniq unique(notification_id,channel,identity_kind,identity_id)
);

create index if not exists idx_notification_channel_campaign
  on public.notification_channel_deliveries(campaign_id,channel,status);
create index if not exists idx_notification_channel_retry
  on public.notification_channel_deliveries(notification_id,channel,status,last_attempt_at);

alter table public.notification_channel_deliveries enable row level security;
revoke all on public.notification_channel_deliveries from anon, authenticated;

create or replace function public.preview_notification_campaign_audience(
  p_audience_mode text,
  p_audience jsonb default '{}'::jsonb,
  p_respect_preferences boolean default true
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  m text:=lower(coalesce(nullif(btrim(p_audience_mode),''),'everyone'));
  a jsonb:=coalesce(p_audience,'{}'::jsonb);
  s integer; e integer; t integer;
  sw integer; ew integer; tw integer;
  se integer; ee integer; te integer;
  sm integer; em integer; tm integer; de integer; dm integer;
begin
  if not public.notification_studio_can_manage() then raise exception 'Notification Studio access denied'; end if;
  if m not in ('everyone','all_staff','staff_roles','staff_divisions','staff_users','all_portals','portal_types','portal_users','smart') then raise exception 'Invalid audience mode'; end if;

  select count(distinct u.id),
    count(distinct case when ps.id is not null or nt.id is not null then u.id end),
    count(distinct case when coalesce(nullif(btrim(u.email),''),'')<>'' and (not p_respect_preferences or coalesce(np.email_enabled,false)) then u.id end),
    count(distinct case when coalesce(nullif(btrim(u.phone),''),'')<>'' and (not p_respect_preferences or coalesce(np.whatsapp_enabled,false)) then u.id end)
  into s,sw,se,sm
  from public.app_users u
  left join public.user_roles ur on ur.user_id=u.id
  left join public.roles r on r.id=ur.role_id
  left join public.user_divisions ud on ud.user_id=u.id
  left join public.notification_preferences np on np.app_user_id=u.id
  left join public.push_subscriptions ps on ps.app_user_id=u.id
  left join public.native_push_tokens nt on nt.app_user_id=u.id and nt.enabled
  where u.deleted_at is null and u.status='active' and not coalesce(u.is_locked,false)
    and (not p_respect_preferences or coalesce(np.in_app_enabled,true))
    and (
      m in ('everyone','all_staff')
      or (m='staff_users' and u.id::text in(select jsonb_array_elements_text(coalesce(a->'staff_user_ids','[]'::jsonb))))
      or (m='staff_roles' and r.code in(select jsonb_array_elements_text(coalesce(a->'role_codes','[]'::jsonb))))
      or (m='staff_divisions' and ud.division_id::text in(select jsonb_array_elements_text(coalesce(a->'division_ids','[]'::jsonb))))
      or (m='smart' and (u.id::text in(select jsonb_array_elements_text(coalesce(a->'staff_user_ids','[]'::jsonb))) or r.code in(select jsonb_array_elements_text(coalesce(a->'role_codes','[]'::jsonb))) or ud.division_id::text in(select jsonb_array_elements_text(coalesce(a->'division_ids','[]'::jsonb)))))
    );

  select count(distinct u.id),
    count(distinct case when ps.id is not null or nt.id is not null then u.id end),
    count(distinct case when coalesce(nullif(btrim(u.email),''),'')<>'' then u.id end),
    count(distinct case when coalesce(nullif(btrim(u.phone),''),'')<>'' then u.id end)
  into e,ew,ee,em
  from public.external_portal_users u
  left join public.push_subscriptions ps on ps.external_portal_user_id=u.id
  left join public.native_push_tokens nt on nt.external_portal_user_id=u.id and nt.enabled
  where u.status='active' and not coalesce(u.is_locked,false)
    and (m in('everyone','all_portals') or (m='portal_types' and u.user_type in(select jsonb_array_elements_text(coalesce(a->'portal_types','[]'::jsonb)))) or (m in('portal_users','smart') and u.id::text in(select jsonb_array_elements_text(coalesce(a->'external_user_ids','[]'::jsonb)))));

  select count(distinct u.id),
    count(distinct case when ps.id is not null or nt.id is not null then u.id end),
    count(distinct case when coalesce(nullif(btrim(u.email),''),'')<>'' then u.id end),
    count(distinct case when coalesce(nullif(btrim(u.phone),''),'')<>'' then u.id end)
  into t,tw,te,tm
  from public.transport_portal_users u
  left join public.push_subscriptions ps on ps.transport_portal_user_id=u.id
  left join public.native_push_tokens nt on nt.transport_portal_user_id=u.id and nt.enabled
  where u.status='active' and not coalesce(u.is_locked,false)
    and (m in('everyone','all_portals') or (m='portal_types' and 'transport' in(select jsonb_array_elements_text(coalesce(a->'portal_types','[]'::jsonb)))) or (m in('portal_users','smart') and u.id::text in(select jsonb_array_elements_text(coalesce(a->'transport_user_ids','[]'::jsonb)))));

  select count(distinct lower(btrim(value))) into de from jsonb_array_elements_text(coalesce(a->'direct_emails','[]'::jsonb)) where value ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';
  select count(distinct regexp_replace(value,'[^0-9]','','g')) into dm from jsonb_array_elements_text(coalesce(a->'direct_mobiles','[]'::jsonb)) where length(regexp_replace(value,'[^0-9]','','g')) between 10 and 15;

  return jsonb_build_object(
    'staff',s,'external_portals',e,'transport_portals',t,'total',s+e+t,
    'push_reachable',sw+ew+tw,'email_reachable',se+ee+te+de,'whatsapp_reachable',sm+em+tm+dm,
    'direct_emails',de,'direct_mobiles',dm
  );
end; $$;

create or replace function public.notification_multichannel_recipients(
  p_notification_id uuid,
  p_channel text
)
returns table(identity_kind text,identity_id uuid,destination text,display_name text)
language sql
stable
security definer
set search_path=public
as $$
  select distinct on (lower(destination)) identity_kind,identity_id,destination,display_name
  from (
  with event_data as (
    select ne.id,coalesce((ne.context->>'campaign_id')::uuid,null) campaign_id
    from public.notification_events ne where ne.id=p_notification_id
  ), campaign_data as (
    select nc.respect_preferences,nc.audience from public.notification_campaigns nc
    join event_data e on e.campaign_id=nc.id
  )
  select 'staff' as identity_kind,u.id as identity_id,
    case when p_channel='email' then lower(btrim(u.email)) else regexp_replace(coalesce(u.phone,''),'[^0-9]','','g') end as destination,
    coalesce(nullif(btrim(u.display_name),''),u.email,u.phone) as display_name
  from public.notification_recipients nr
  join public.app_users u on u.id=nr.app_user_id
  left join public.notification_preferences np on np.app_user_id=u.id
  where nr.notification_id=p_notification_id and u.deleted_at is null and u.status='active' and not coalesce(u.is_locked,false)
    and case when p_channel='email' then coalesce(nullif(btrim(u.email),''),'')<>'' and (not coalesce((select respect_preferences from campaign_data),true) or coalesce(np.email_enabled,false))
             when p_channel='whatsapp' then coalesce(nullif(btrim(u.phone),''),'')<>'' and (not coalesce((select respect_preferences from campaign_data),true) or coalesce(np.whatsapp_enabled,false))
             else false end
  union all
  select 'external_portal',u.id,
    case when p_channel='email' then lower(btrim(u.email)) else regexp_replace(coalesce(u.phone,''),'[^0-9]','','g') end,
    coalesce(nullif(btrim(u.display_name),''),u.email,u.phone)
  from public.portal_notification_recipients nr join public.external_portal_users u on u.id=nr.external_portal_user_id
  where nr.notification_id=p_notification_id and u.status='active' and not coalesce(u.is_locked,false)
    and case when p_channel='email' then coalesce(nullif(btrim(u.email),''),'')<>'' when p_channel='whatsapp' then coalesce(nullif(btrim(u.phone),''),'')<>'' else false end
  union all
  select 'transport_portal',u.id,
    case when p_channel='email' then lower(btrim(u.email)) else regexp_replace(coalesce(u.phone,''),'[^0-9]','','g') end,
    coalesce(nullif(btrim(u.display_name),''),u.email,u.phone)
  from public.portal_notification_recipients nr join public.transport_portal_users u on u.id=nr.transport_portal_user_id
  where nr.notification_id=p_notification_id and u.status='active' and not coalesce(u.is_locked,false)
    and case when p_channel='email' then coalesce(nullif(btrim(u.email),''),'')<>'' when p_channel='whatsapp' then coalesce(nullif(btrim(u.phone),''),'')<>'' else false end
  union all
  select 'direct',
    (substr(md5('email:'||lower(btrim(x.value))),1,8)||'-'||substr(md5('email:'||lower(btrim(x.value))),9,4)||'-'||substr(md5('email:'||lower(btrim(x.value))),13,4)||'-'||substr(md5('email:'||lower(btrim(x.value))),17,4)||'-'||substr(md5('email:'||lower(btrim(x.value))),21,12))::uuid,
    lower(btrim(x.value)),lower(btrim(x.value))
  from campaign_data c cross join lateral jsonb_array_elements_text(coalesce(c.audience->'direct_emails','[]'::jsonb)) x
  where p_channel='email' and x.value ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  union all
  select 'direct',
    (substr(md5('mobile:'||regexp_replace(x.value,'[^0-9]','','g')),1,8)||'-'||substr(md5('mobile:'||regexp_replace(x.value,'[^0-9]','','g')),9,4)||'-'||substr(md5('mobile:'||regexp_replace(x.value,'[^0-9]','','g')),13,4)||'-'||substr(md5('mobile:'||regexp_replace(x.value,'[^0-9]','','g')),17,4)||'-'||substr(md5('mobile:'||regexp_replace(x.value,'[^0-9]','','g')),21,12))::uuid,
    regexp_replace(x.value,'[^0-9]','','g'),regexp_replace(x.value,'[^0-9]','','g')
  from campaign_data c cross join lateral jsonb_array_elements_text(coalesce(c.audience->'direct_mobiles','[]'::jsonb)) x
  where p_channel='whatsapp' and length(regexp_replace(x.value,'[^0-9]','','g')) between 10 and 15
  ) resolved
  order by lower(destination),case identity_kind when 'staff' then 1 when 'external_portal' then 2 when 'transport_portal' then 3 else 4 end;
$$;

create or replace function public.claim_notification_channel_delivery(
  p_notification_id uuid,p_channel text,p_identity_kind text,p_identity_id uuid,p_destination text
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare delivery_id uuid; campaign uuid;
begin
  if p_channel not in ('email','whatsapp') then raise exception 'Unsupported channel'; end if;
  select nullif(ne.context->>'campaign_id','')::uuid into campaign from public.notification_events ne where ne.id=p_notification_id;
  insert into public.notification_channel_deliveries(campaign_id,notification_id,channel,identity_kind,identity_id,destination,status,attempt_count,first_attempt_at,last_attempt_at)
  values(campaign,p_notification_id,p_channel,p_identity_kind,p_identity_id,p_destination,'processing',1,now(),now())
  on conflict(notification_id,channel,identity_kind,identity_id) do update
    set status='processing',destination=excluded.destination,attempt_count=public.notification_channel_deliveries.attempt_count+1,last_attempt_at=now(),updated_at=now(),last_error=null
    where public.notification_channel_deliveries.status in ('pending','failed')
      and public.notification_channel_deliveries.attempt_count < 4
  returning id into delivery_id;
  return delivery_id;
end; $$;

create or replace function public.complete_notification_channel_delivery(
  p_delivery_id uuid,p_status text,p_provider_message_id text default null,p_provider_payload jsonb default '{}'::jsonb,p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if p_status not in ('sent','failed','skipped') then raise exception 'Invalid delivery status'; end if;
  update public.notification_channel_deliveries set status=p_status,provider_message_id=nullif(p_provider_message_id,''),provider_payload=coalesce(p_provider_payload,'{}'::jsonb),last_error=left(nullif(p_error,''),1000),delivered_at=case when p_status='sent' then now() else delivered_at end,updated_at=now() where id=p_delivery_id;
  return found;
end; $$;

create or replace function public.notification_studio_delivery_breakdown(p_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare result jsonb;
begin
  if not public.notification_studio_can_manage() then raise exception 'Notification Studio access denied'; end if;
  select jsonb_build_object(
    'summary',coalesce((select jsonb_agg(to_jsonb(s) order by s.channel,s.status) from (select channel,status,count(*) total from public.notification_channel_deliveries where campaign_id=p_campaign_id group by channel,status)s),'[]'::jsonb),
    'deliveries',coalesce((select jsonb_agg(to_jsonb(d) order by d.updated_at desc) from (select id,channel,identity_kind,destination,status,attempt_count,provider_message_id,last_error,delivered_at,updated_at from public.notification_channel_deliveries where campaign_id=p_campaign_id limit 500)d),'[]'::jsonb)
  ) into result;
  return result;
end; $$;

create or replace function public.list_notification_campaigns(p_status text default null,p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path=public as $$ declare result jsonb; begin
  if not public.notification_studio_can_manage() then raise exception 'Notification Studio access denied'; end if;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc),'[]'::jsonb) into result from(
    select c.*,
      coalesce((select count(*) from public.notification_recipients nr where nr.notification_id=c.notification_event_id and nr.is_read),0) staff_read_count,
      coalesce((select count(*) from public.portal_notification_recipients pr where pr.notification_id=c.notification_event_id and pr.is_read),0) portal_read_count,
      coalesce((select count(*) from public.push_deliveries pd where pd.notification_id=c.notification_event_id),0)+coalesce((select count(*) from public.native_push_deliveries nd where nd.notification_id=c.notification_event_id),0) push_delivered_count,
      coalesce((select count(*) from public.notification_channel_deliveries d where d.campaign_id=c.id and d.channel='email' and d.status='sent'),0) email_sent_count,
      coalesce((select count(*) from public.notification_channel_deliveries d where d.campaign_id=c.id and d.channel='email' and d.status='failed'),0) email_failed_count,
      coalesce((select count(*) from public.notification_channel_deliveries d where d.campaign_id=c.id and d.channel='whatsapp' and d.status='sent'),0) whatsapp_sent_count,
      coalesce((select count(*) from public.notification_channel_deliveries d where d.campaign_id=c.id and d.channel='whatsapp' and d.status='failed'),0) whatsapp_failed_count
    from public.notification_campaigns c where p_status is null or p_status='all' or c.status=p_status order by c.created_at desc limit greatest(1,least(coalesce(p_limit,100),250))
  )q; return result;
end; $$;

revoke all on function public.preview_notification_campaign_audience(text,jsonb,boolean) from public,anon;
revoke all on function public.notification_multichannel_recipients(uuid,text) from public,anon,authenticated;
revoke all on function public.claim_notification_channel_delivery(uuid,text,text,uuid,text) from public,anon,authenticated;
revoke all on function public.complete_notification_channel_delivery(uuid,text,text,jsonb,text) from public,anon,authenticated;
revoke all on function public.notification_studio_delivery_breakdown(uuid) from public,anon;
revoke all on function public.list_notification_campaigns(text,integer) from public,anon;

grant execute on function public.preview_notification_campaign_audience(text,jsonb,boolean) to authenticated;
grant execute on function public.notification_studio_delivery_breakdown(uuid) to authenticated;
grant execute on function public.list_notification_campaigns(text,integer) to authenticated;
grant execute on function public.notification_multichannel_recipients(uuid,text) to service_role;
grant execute on function public.claim_notification_channel_delivery(uuid,text,text,uuid,text) to service_role;
grant execute on function public.complete_notification_channel_delivery(uuid,text,text,jsonb,text) to service_role;
