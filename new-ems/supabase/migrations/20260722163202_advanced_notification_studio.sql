-- Advanced custom notification campaigns for staff and every portal identity.

create extension if not exists pg_net;

create table if not exists public.notification_campaigns (
  id uuid primary key default gen_random_uuid(),
  campaign_name text not null,
  title text not null,
  message text not null,
  category text not null default 'general',
  severity text not null default 'info',
  action_label text,
  action_url text,
  audience_mode text not null default 'everyone',
  audience jsonb not null default '{}'::jsonb,
  channel_plan jsonb not null default '{"in_app":true,"push":true}'::jsonb,
  respect_preferences boolean not null default true,
  status text not null default 'draft',
  scheduled_for timestamptz,
  timezone text not null default 'Asia/Kolkata',
  notification_event_id uuid references public.notification_events(id) on delete set null,
  staff_recipient_count integer not null default 0,
  portal_recipient_count integer not null default 0,
  failure_message text,
  created_by uuid not null references public.app_users(id) on delete restrict default public.current_app_user_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint notification_campaign_status_chk check (status in ('draft','scheduled','processing','sent','cancelled','failed')),
  constraint notification_campaign_severity_chk check (severity in ('info','success','warning','error')),
  constraint notification_campaign_audience_chk check (audience_mode in ('everyone','all_staff','staff_roles','staff_divisions','staff_users','all_portals','portal_types','portal_users','smart')),
  constraint notification_campaign_content_chk check (char_length(btrim(title)) between 2 and 120 and char_length(btrim(message)) between 2 and 2000)
);

create table if not exists public.notification_campaign_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  title text not null,
  message text not null,
  category text not null default 'general',
  severity text not null default 'info',
  action_label text,
  action_url text,
  default_audience_mode text not null default 'everyone',
  default_channel_plan jsonb not null default '{"in_app":true,"push":true}'::jsonb,
  is_active boolean not null default true,
  created_by uuid not null references public.app_users(id) on delete restrict default public.current_app_user_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(name),
  constraint notification_template_severity_chk check (severity in ('info','success','warning','error'))
);

create index if not exists idx_notification_campaigns_status_schedule on public.notification_campaigns(status, scheduled_for) where status='scheduled';
create index if not exists idx_notification_campaigns_created on public.notification_campaigns(created_at desc);
alter table public.notification_campaigns enable row level security;
alter table public.notification_campaign_templates enable row level security;
revoke all on public.notification_campaigns from anon, authenticated;
revoke all on public.notification_campaign_templates from anon, authenticated;

create or replace function public.notification_studio_can_manage()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id
    where ur.user_id=public.current_app_user_id()
      and r.code in ('chairman_managing_director','super_admin','admin','coo')
  );
$$;

create or replace function public.notification_studio_directory()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
  if not public.notification_studio_can_manage() then raise exception 'Notification Studio access denied'; end if;
  select jsonb_build_object(
    'staff',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name',coalesce(nullif(u.display_name,''),u.email),'email',u.email) order by coalesce(nullif(u.display_name,''),u.email)) from public.app_users u where u.deleted_at is null and u.status='active' and not coalesce(u.is_locked,false)),'[]'::jsonb),
    'external_portals',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name',coalesce(nullif(u.display_name,''),u.email,u.phone),'email',u.email,'type',u.user_type) order by coalesce(nullif(u.display_name,''),u.email,u.phone)) from public.external_portal_users u where u.status='active' and not coalesce(u.is_locked,false)),'[]'::jsonb),
    'transport_portals',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name',coalesce(nullif(u.display_name,''),u.email,u.phone),'email',u.email,'type','transport') order by coalesce(nullif(u.display_name,''),u.email,u.phone)) from public.transport_portal_users u where u.status='active' and not coalesce(u.is_locked,false)),'[]'::jsonb),
    'roles',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'code',r.code,'name',r.name) order by r.name) from public.roles r where coalesce(r.is_active,true)),'[]'::jsonb),
    'divisions',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'code',d.code,'name',d.name) order by d.name) from public.divisions d where coalesce(d.is_active,true)),'[]'::jsonb),
    'portal_types',coalesce((select jsonb_agg(x.t order by x.t) from (select distinct user_type t from public.external_portal_users where user_type is not null union select 'transport')x),'[]'::jsonb)
  ) into result;
  return result;
end; $$;

create or replace function public.preview_notification_campaign_audience(p_audience_mode text,p_audience jsonb default '{}'::jsonb,p_respect_preferences boolean default true)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare m text:=lower(coalesce(nullif(btrim(p_audience_mode),''),'everyone')); a jsonb:=coalesce(p_audience,'{}'::jsonb); s integer; e integer; t integer; sw integer; ew integer; tw integer;
begin
  if not public.notification_studio_can_manage() then raise exception 'Notification Studio access denied'; end if;
  if m not in ('everyone','all_staff','staff_roles','staff_divisions','staff_users','all_portals','portal_types','portal_users','smart') then raise exception 'Invalid audience mode'; end if;
  select count(distinct u.id),count(distinct case when ps.id is not null or nt.id is not null then u.id end) into s,sw
  from public.app_users u left join public.user_roles ur on ur.user_id=u.id left join public.roles r on r.id=ur.role_id left join public.user_divisions ud on ud.user_id=u.id
  left join public.notification_preferences np on np.app_user_id=u.id left join public.push_subscriptions ps on ps.app_user_id=u.id left join public.native_push_tokens nt on nt.app_user_id=u.id and nt.enabled
  where u.deleted_at is null and u.status='active' and not coalesce(u.is_locked,false) and (not p_respect_preferences or coalesce(np.in_app_enabled,true)) and (
    m in ('everyone','all_staff') or (m='staff_users' and u.id::text in(select jsonb_array_elements_text(coalesce(a->'staff_user_ids','[]'::jsonb))))
    or (m='staff_roles' and r.code in(select jsonb_array_elements_text(coalesce(a->'role_codes','[]'::jsonb))))
    or (m='staff_divisions' and ud.division_id::text in(select jsonb_array_elements_text(coalesce(a->'division_ids','[]'::jsonb))))
    or (m='smart' and (u.id::text in(select jsonb_array_elements_text(coalesce(a->'staff_user_ids','[]'::jsonb))) or r.code in(select jsonb_array_elements_text(coalesce(a->'role_codes','[]'::jsonb))) or ud.division_id::text in(select jsonb_array_elements_text(coalesce(a->'division_ids','[]'::jsonb)))))
  );
  select count(distinct u.id),count(distinct case when ps.id is not null or nt.id is not null then u.id end) into e,ew from public.external_portal_users u
  left join public.push_subscriptions ps on ps.external_portal_user_id=u.id left join public.native_push_tokens nt on nt.external_portal_user_id=u.id and nt.enabled
  where u.status='active' and not coalesce(u.is_locked,false) and (m in('everyone','all_portals') or (m='portal_types' and u.user_type in(select jsonb_array_elements_text(coalesce(a->'portal_types','[]'::jsonb)))) or (m in('portal_users','smart') and u.id::text in(select jsonb_array_elements_text(coalesce(a->'external_user_ids','[]'::jsonb)))));
  select count(distinct u.id),count(distinct case when ps.id is not null or nt.id is not null then u.id end) into t,tw from public.transport_portal_users u
  left join public.push_subscriptions ps on ps.transport_portal_user_id=u.id left join public.native_push_tokens nt on nt.transport_portal_user_id=u.id and nt.enabled
  where u.status='active' and not coalesce(u.is_locked,false) and (m in('everyone','all_portals') or (m='portal_types' and 'transport' in(select jsonb_array_elements_text(coalesce(a->'portal_types','[]'::jsonb)))) or (m in('portal_users','smart') and u.id::text in(select jsonb_array_elements_text(coalesce(a->'transport_user_ids','[]'::jsonb)))));
  return jsonb_build_object('staff',s,'external_portals',e,'transport_portals',t,'total',s+e+t,'push_reachable',sw+ew+tw);
end; $$;

create or replace function public.save_notification_campaign(p_payload jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare a uuid:=public.current_app_user_id(); cid uuid; st text:=lower(coalesce(nullif(p_payload->>'status',''),'draft')); schedule_at timestamptz;
begin
  if not public.notification_studio_can_manage() then raise exception 'Notification Studio access denied'; end if;
  if st not in('draft','scheduled') then raise exception 'Campaign can only be saved as draft or scheduled'; end if;
  schedule_at:=nullif(p_payload->>'scheduled_for','')::timestamptz;
  if st='scheduled' and (schedule_at is null or schedule_at<=now()) then raise exception 'Scheduled time must be in the future'; end if;
  cid:=nullif(p_payload->>'id','')::uuid;
  if cid is null then
    insert into public.notification_campaigns(campaign_name,title,message,category,severity,action_label,action_url,audience_mode,audience,channel_plan,respect_preferences,status,scheduled_for,timezone,created_by)
    values(btrim(coalesce(nullif(p_payload->>'campaign_name',''),p_payload->>'title')),btrim(p_payload->>'title'),btrim(p_payload->>'message'),coalesce(nullif(p_payload->>'category',''),'general'),coalesce(nullif(p_payload->>'severity',''),'info'),nullif(btrim(coalesce(p_payload->>'action_label','')),''),nullif(btrim(coalesce(p_payload->>'action_url','')),''),coalesce(nullif(p_payload->>'audience_mode',''),'everyone'),coalesce(p_payload->'audience','{}'::jsonb),coalesce(p_payload->'channel_plan','{"in_app":true,"push":true}'::jsonb),case when p_payload ? 'respect_preferences' then (p_payload->>'respect_preferences')::boolean else true end,st,schedule_at,coalesce(nullif(p_payload->>'timezone',''),'Asia/Kolkata'),a) returning id into cid;
  else
    update public.notification_campaigns set campaign_name=btrim(coalesce(nullif(p_payload->>'campaign_name',''),p_payload->>'title')),title=btrim(p_payload->>'title'),message=btrim(p_payload->>'message'),category=coalesce(nullif(p_payload->>'category',''),'general'),severity=coalesce(nullif(p_payload->>'severity',''),'info'),action_label=nullif(btrim(coalesce(p_payload->>'action_label','')),''),action_url=nullif(btrim(coalesce(p_payload->>'action_url','')),''),audience_mode=coalesce(nullif(p_payload->>'audience_mode',''),'everyone'),audience=coalesce(p_payload->'audience','{}'::jsonb),channel_plan=coalesce(p_payload->'channel_plan','{"in_app":true,"push":true}'::jsonb),respect_preferences=case when p_payload ? 'respect_preferences' then (p_payload->>'respect_preferences')::boolean else true end,status=st,scheduled_for=schedule_at,timezone=coalesce(nullif(p_payload->>'timezone',''),'Asia/Kolkata'),updated_at=now()
    where id=cid and created_by=a and status in('draft','scheduled');
    if not found then raise exception 'Campaign is no longer editable'; end if;
  end if;
  insert into public.audit_logs(event_type,module_code,entity_type,entity_id,action,details,created_at) values('notification_campaign_saved','notification-studio','notification_campaign',cid::text,st,jsonb_build_object('status',st,'scheduled_for',schedule_at),now());
  return cid;
end; $$;

create or replace function public.execute_notification_campaign_internal(p_campaign_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare c public.notification_campaigns; eid uuid; sc integer:=0; pc integer:=0; tc integer:=0;
begin
  select * into c from public.notification_campaigns where id=p_campaign_id for update;
  if c.id is null then raise exception 'Campaign not found'; end if;
  if c.status not in('draft','scheduled','processing') then return c.notification_event_id; end if;
  update public.notification_campaigns set status='processing',updated_at=now(),failure_message=null where id=c.id;
  insert into public.notification_events(module_code,event_code,category,title,message,severity,action_label,action_url,entity_type,entity_id,audience_mode,audience,channel_plan,context,created_by)
  values('notification-studio','custom_campaign',c.category,c.title,c.message,c.severity,c.action_label,c.action_url,'notification_campaign',c.id::text,c.audience_mode,c.audience,c.channel_plan,jsonb_build_object('campaign_id',c.id,'campaign_name',c.campaign_name),c.created_by) returning id into eid;
  with candidates as(
    select distinct u.id from public.app_users u left join public.user_roles ur on ur.user_id=u.id left join public.roles r on r.id=ur.role_id left join public.user_divisions ud on ud.user_id=u.id left join public.notification_preferences np on np.app_user_id=u.id
    where u.deleted_at is null and u.status='active' and not coalesce(u.is_locked,false) and (not c.respect_preferences or coalesce(np.in_app_enabled,true)) and (
      c.audience_mode in('everyone','all_staff') or (c.audience_mode='staff_users' and u.id::text in(select jsonb_array_elements_text(coalesce(c.audience->'staff_user_ids','[]'::jsonb)))) or (c.audience_mode='staff_roles' and r.code in(select jsonb_array_elements_text(coalesce(c.audience->'role_codes','[]'::jsonb)))) or (c.audience_mode='staff_divisions' and ud.division_id::text in(select jsonb_array_elements_text(coalesce(c.audience->'division_ids','[]'::jsonb)))) or (c.audience_mode='smart' and (u.id::text in(select jsonb_array_elements_text(coalesce(c.audience->'staff_user_ids','[]'::jsonb))) or r.code in(select jsonb_array_elements_text(coalesce(c.audience->'role_codes','[]'::jsonb))) or ud.division_id::text in(select jsonb_array_elements_text(coalesce(c.audience->'division_ids','[]'::jsonb)))))
    )) insert into public.notification_recipients(notification_id,app_user_id) select eid,id from candidates on conflict do nothing;
  get diagnostics sc=row_count;
  insert into public.portal_notification_recipients(notification_id,external_portal_user_id)
    select eid,u.id from public.external_portal_users u where u.status='active' and not coalesce(u.is_locked,false) and (c.audience_mode in('everyone','all_portals') or (c.audience_mode='portal_types' and u.user_type in(select jsonb_array_elements_text(coalesce(c.audience->'portal_types','[]'::jsonb)))) or (c.audience_mode in('portal_users','smart') and u.id::text in(select jsonb_array_elements_text(coalesce(c.audience->'external_user_ids','[]'::jsonb))))) on conflict do nothing;
  get diagnostics pc=row_count;
  insert into public.portal_notification_recipients(notification_id,transport_portal_user_id)
    select eid,u.id from public.transport_portal_users u where u.status='active' and not coalesce(u.is_locked,false) and (c.audience_mode in('everyone','all_portals') or (c.audience_mode='portal_types' and 'transport' in(select jsonb_array_elements_text(coalesce(c.audience->'portal_types','[]'::jsonb)))) or (c.audience_mode in('portal_users','smart') and u.id::text in(select jsonb_array_elements_text(coalesce(c.audience->'transport_user_ids','[]'::jsonb))))) on conflict do nothing;
  get diagnostics tc=row_count;
  pc:=pc+tc;
  update public.notification_campaigns set status='sent',notification_event_id=eid,staff_recipient_count=sc,portal_recipient_count=pc,sent_at=now(),updated_at=now() where id=c.id;
  insert into public.audit_logs(event_type,module_code,entity_type,entity_id,action,details,created_at) values('notification_campaign_sent','notification-studio','notification_campaign',c.id::text,'send',jsonb_build_object('event_id',eid,'staff_recipients',sc,'portal_recipients',pc),now());
  return eid;
exception when others then
  update public.notification_campaigns set status='failed',failure_message=left(sqlerrm,500),updated_at=now() where id=p_campaign_id;
  raise;
end; $$;

create or replace function public.publish_notification_campaign(p_campaign_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$ begin
  if not public.notification_studio_can_manage() then raise exception 'Notification Studio access denied'; end if;
  return public.execute_notification_campaign_internal(p_campaign_id);
end; $$;

create or replace function public.process_due_notification_campaigns(p_limit integer default 20)
returns uuid[] language plpgsql security definer set search_path=public as $$
declare x record; ids uuid[]:='{}'::uuid[]; eid uuid;
begin
  for x in select id from public.notification_campaigns where status='scheduled' and scheduled_for<=now() order by scheduled_for for update skip locked limit greatest(1,least(coalesce(p_limit,20),100)) loop
    begin eid:=public.execute_notification_campaign_internal(x.id); ids:=array_append(ids,eid); exception when others then null; end;
  end loop;
  return ids;
end; $$;

create or replace function public.list_notification_campaigns(p_status text default null,p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path=public as $$ declare result jsonb; begin
  if not public.notification_studio_can_manage() then raise exception 'Notification Studio access denied'; end if;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc),'[]'::jsonb) into result from(
    select c.*,coalesce((select count(*) from public.notification_recipients nr where nr.notification_id=c.notification_event_id and nr.is_read),0) staff_read_count,
      coalesce((select count(*) from public.portal_notification_recipients pr where pr.notification_id=c.notification_event_id and pr.is_read),0) portal_read_count,
      coalesce((select count(*) from public.push_deliveries pd where pd.notification_id=c.notification_event_id),0)+coalesce((select count(*) from public.native_push_deliveries nd where nd.notification_id=c.notification_event_id),0) push_delivered_count
    from public.notification_campaigns c where p_status is null or p_status='all' or c.status=p_status order by c.created_at desc limit greatest(1,least(coalesce(p_limit,100),250))
  )q; return result;
end; $$;

create or replace function public.get_notification_campaign(p_campaign_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$ declare result jsonb; begin
  if not public.notification_studio_can_manage() then raise exception 'Notification Studio access denied'; end if;
  select to_jsonb(c) into result from public.notification_campaigns c where c.id=p_campaign_id; return result;
end; $$;

create or replace function public.cancel_notification_campaign(p_campaign_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$ begin
  if not public.notification_studio_can_manage() then raise exception 'Notification Studio access denied'; end if;
  update public.notification_campaigns set status='cancelled',updated_at=now() where id=p_campaign_id and status in('draft','scheduled'); return found;
end; $$;

create or replace function public.list_notification_campaign_templates()
returns jsonb language plpgsql stable security definer set search_path=public as $$ declare result jsonb; begin
  if not public.notification_studio_can_manage() then raise exception 'Notification Studio access denied'; end if;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.name),'[]'::jsonb) into result from public.notification_campaign_templates t where t.is_active; return result;
end; $$;

create or replace function public.save_notification_campaign_template(p_payload jsonb)
returns uuid language plpgsql security definer set search_path=public as $$ declare tid uuid:=nullif(p_payload->>'id','')::uuid; begin
  if not public.notification_studio_can_manage() then raise exception 'Notification Studio access denied'; end if;
  if tid is null then insert into public.notification_campaign_templates(name,description,title,message,category,severity,action_label,action_url,default_audience_mode,default_channel_plan) values(btrim(p_payload->>'name'),nullif(btrim(coalesce(p_payload->>'description','')),''),btrim(p_payload->>'title'),btrim(p_payload->>'message'),coalesce(nullif(p_payload->>'category',''),'general'),coalesce(nullif(p_payload->>'severity',''),'info'),nullif(btrim(coalesce(p_payload->>'action_label','')),''),nullif(btrim(coalesce(p_payload->>'action_url','')),''),coalesce(nullif(p_payload->>'default_audience_mode',''),'everyone'),coalesce(p_payload->'default_channel_plan','{"in_app":true,"push":true}'::jsonb)) returning id into tid;
  else update public.notification_campaign_templates set name=btrim(p_payload->>'name'),description=nullif(btrim(coalesce(p_payload->>'description','')),''),title=btrim(p_payload->>'title'),message=btrim(p_payload->>'message'),category=coalesce(nullif(p_payload->>'category',''),'general'),severity=coalesce(nullif(p_payload->>'severity',''),'info'),action_label=nullif(btrim(coalesce(p_payload->>'action_label','')),''),action_url=nullif(btrim(coalesce(p_payload->>'action_url','')),''),default_audience_mode=coalesce(nullif(p_payload->>'default_audience_mode',''),'everyone'),default_channel_plan=coalesce(p_payload->'default_channel_plan','{"in_app":true,"push":true}'::jsonb),updated_at=now() where id=tid; end if;
  return tid;
end; $$;

revoke all on function public.notification_studio_can_manage() from public;
revoke all on function public.notification_studio_directory() from public;
revoke all on function public.preview_notification_campaign_audience(text,jsonb,boolean) from public;
revoke all on function public.save_notification_campaign(jsonb) from public;
revoke all on function public.execute_notification_campaign_internal(uuid) from public;
revoke all on function public.publish_notification_campaign(uuid) from public;
revoke all on function public.process_due_notification_campaigns(integer) from public;
revoke all on function public.list_notification_campaigns(text,integer) from public;
revoke all on function public.get_notification_campaign(uuid) from public;
revoke all on function public.cancel_notification_campaign(uuid) from public;
revoke all on function public.list_notification_campaign_templates() from public;
revoke all on function public.save_notification_campaign_template(jsonb) from public;
grant execute on function public.notification_studio_can_manage() to authenticated;
grant execute on function public.notification_studio_directory() to authenticated;
grant execute on function public.preview_notification_campaign_audience(text,jsonb,boolean) to authenticated;
grant execute on function public.save_notification_campaign(jsonb) to authenticated;
grant execute on function public.publish_notification_campaign(uuid) to authenticated;
grant execute on function public.list_notification_campaigns(text,integer) to authenticated;
grant execute on function public.get_notification_campaign(uuid) to authenticated;
grant execute on function public.cancel_notification_campaign(uuid) to authenticated;
grant execute on function public.list_notification_campaign_templates() to authenticated;
grant execute on function public.save_notification_campaign_template(jsonb) to authenticated;
grant execute on function public.process_due_notification_campaigns(integer) to service_role;

select cron.schedule('notification-studio-dispatcher','* * * * *',$job$
  select net.http_post(
    url:='https://ftejxcycoiagbslnzaab.supabase.co/functions/v1/notification-campaigns',
    headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='notification_cron_secret' limit 1)),
    body:='{"action":"process_due"}'::jsonb,
    timeout_milliseconds:=15000
  );
$job$);
