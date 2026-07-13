create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  module_code text not null,
  event_code text not null default 'general',
  category text not null default 'general',
  title text not null,
  message text not null,
  severity text not null default 'info',
  action_label text,
  action_url text,
  entity_type text,
  entity_id text,
  audience_mode text not null default 'current_user',
  audience jsonb not null default '{}'::jsonb,
  channel_plan jsonb not null default '{"in_app": true}'::jsonb,
  context jsonb not null default '{}'::jsonb,
  created_by uuid references public.app_users(id) on delete set null default public.current_app_user_id(),
  created_at timestamptz not null default now(),
  constraint notification_events_severity_chk check (severity in ('info', 'success', 'warning', 'error'))
);

create table if not exists public.notification_recipients (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notification_events(id) on delete cascade,
  app_user_id uuid not null references public.app_users(id) on delete cascade,
  is_read boolean not null default false,
  read_at timestamptz,
  is_dismissed boolean not null default false,
  dismissed_at timestamptz,
  is_archived boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique(notification_id, app_user_id)
);

create table if not exists public.notification_preferences (
  app_user_id uuid primary key references public.app_users(id) on delete cascade,
  in_app_enabled boolean not null default true,
  email_enabled boolean not null default false,
  whatsapp_enabled boolean not null default false,
  digest_enabled boolean not null default false,
  muted_modules text[] not null default '{}'::text[],
  muted_categories text[] not null default '{}'::text[],
  quiet_hours_start time,
  quiet_hours_end time,
  updated_at timestamptz not null default now()
);

create index if not exists idx_notification_events_module_created on public.notification_events(module_code, created_at desc);
create index if not exists idx_notification_events_category_created on public.notification_events(category, created_at desc);
create index if not exists idx_notification_recipients_user_created on public.notification_recipients(app_user_id, created_at desc);
create index if not exists idx_notification_recipients_user_unread on public.notification_recipients(app_user_id, is_read, is_dismissed, is_archived);

create or replace function public.current_user_has_any_role(p_role_codes text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = public.current_app_user_id()
      and r.code = any(coalesce(p_role_codes, '{}'::text[]))
  );
$$;

grant execute on function public.current_user_has_any_role(text[]) to authenticated;

create or replace function public.dispatch_ems_notification(
  p_module_code text,
  p_event_code text default 'general',
  p_category text default 'general',
  p_title text default '',
  p_message text default '',
  p_severity text default 'info',
  p_action_label text default null,
  p_action_url text default null,
  p_entity_type text default null,
  p_entity_id text default null,
  p_context jsonb default '{}'::jsonb,
  p_target_mode text default 'current_user',
  p_target_user_ids uuid[] default null,
  p_target_role_codes text[] default null,
  p_target_division_ids uuid[] default null,
  p_channel_plan jsonb default '{"in_app": true}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_actor uuid := public.current_app_user_id();
  v_target_mode text := lower(coalesce(nullif(btrim(p_target_mode), ''), 'current_user'));
begin
  if coalesce(nullif(btrim(p_module_code), ''), '') = '' then
    raise exception 'module_code is required';
  end if;
  if coalesce(nullif(btrim(p_title), ''), '') = '' then
    raise exception 'title is required';
  end if;
  if coalesce(nullif(btrim(p_message), ''), '') = '' then
    raise exception 'message is required';
  end if;

  insert into public.notification_events (
    module_code,
    event_code,
    category,
    title,
    message,
    severity,
    action_label,
    action_url,
    entity_type,
    entity_id,
    audience_mode,
    audience,
    channel_plan,
    context,
    created_by
  ) values (
    p_module_code,
    coalesce(nullif(btrim(p_event_code), ''), 'general'),
    coalesce(nullif(btrim(p_category), ''), 'general'),
    btrim(p_title),
    btrim(p_message),
    case when p_severity in ('info', 'success', 'warning', 'error') then p_severity else 'info' end,
    nullif(btrim(coalesce(p_action_label, '')), ''),
    nullif(btrim(coalesce(p_action_url, '')), ''),
    nullif(btrim(coalesce(p_entity_type, '')), ''),
    nullif(btrim(coalesce(p_entity_id, '')), ''),
    v_target_mode,
    jsonb_build_object(
      'user_ids', coalesce(to_jsonb(p_target_user_ids), '[]'::jsonb),
      'role_codes', coalesce(to_jsonb(p_target_role_codes), '[]'::jsonb),
      'division_ids', coalesce(to_jsonb(p_target_division_ids), '[]'::jsonb)
    ),
    coalesce(p_channel_plan, '{"in_app": true}'::jsonb),
    coalesce(p_context, '{}'::jsonb),
    v_actor
  )
  returning id into v_event_id;

  with candidate_users as (
    select distinct au.id
    from public.app_users au
    left join public.user_roles ur on ur.user_id = au.id
    left join public.roles r on r.id = ur.role_id
    left join public.user_divisions ud on ud.user_id = au.id
    left join public.notification_preferences np on np.app_user_id = au.id
    where coalesce(au.status, 'inactive') = 'active'
      and coalesce(au.is_locked, false) = false
      and (
        v_target_mode = 'all_active'
        or (v_target_mode = 'all_admins' and r.code in ('super_admin', 'admin'))
        or (v_target_mode = 'current_user' and au.id = v_actor)
        or (v_target_mode = 'user_ids' and au.id = any(coalesce(p_target_user_ids, '{}'::uuid[])))
        or (v_target_mode = 'role_codes' and r.code = any(coalesce(p_target_role_codes, '{}'::text[])))
        or (v_target_mode = 'division_members' and ud.division_id = any(coalesce(p_target_division_ids, '{}'::uuid[])))
        or (
          v_target_mode = 'smart'
          and (
            au.id = any(coalesce(p_target_user_ids, '{}'::uuid[]))
            or r.code = any(coalesce(p_target_role_codes, '{}'::text[]))
            or ud.division_id = any(coalesce(p_target_division_ids, '{}'::uuid[]))
          )
        )
      )
      and coalesce(np.in_app_enabled, true) = true
      and not (p_module_code = any(coalesce(np.muted_modules, '{}'::text[])))
      and not (coalesce(nullif(btrim(p_category), ''), 'general') = any(coalesce(np.muted_categories, '{}'::text[])))
  )
  insert into public.notification_recipients (notification_id, app_user_id)
  select v_event_id, cu.id
  from candidate_users cu
  on conflict (notification_id, app_user_id) do nothing;

  if not exists (select 1 from public.notification_recipients nr where nr.notification_id = v_event_id) and v_actor is not null then
    insert into public.notification_recipients (notification_id, app_user_id)
    values (v_event_id, v_actor)
    on conflict (notification_id, app_user_id) do nothing;
  end if;

  insert into public.audit_logs (
    event_type,
    module_code,
    entity_type,
    entity_id,
    action,
    details,
    created_at
  ) values (
    'notification_dispatched',
    p_module_code,
    'notification_events',
    v_event_id::text,
    'create',
    jsonb_build_object(
      'title', p_title,
      'target_mode', v_target_mode,
      'severity', p_severity,
      'actor', v_actor
    ),
    now()
  );

  return v_event_id;
end;
$$;

grant execute on function public.dispatch_ems_notification(text, text, text, text, text, text, text, text, text, text, jsonb, text, uuid[], text[], uuid[], jsonb) to authenticated;

create or replace function public.list_my_notifications(
  p_status text default 'active',
  p_search text default null,
  p_limit integer default 30,
  p_offset integer default 0
)
returns table(
  recipient_id uuid,
  notification_id uuid,
  title text,
  message text,
  severity text,
  module_code text,
  event_code text,
  category text,
  action_label text,
  action_url text,
  entity_type text,
  entity_id text,
  channel_plan jsonb,
  context jsonb,
  created_at timestamptz,
  is_read boolean,
  is_dismissed boolean,
  is_archived boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    nr.id as recipient_id,
    ne.id as notification_id,
    ne.title,
    ne.message,
    ne.severity,
    ne.module_code,
    ne.event_code,
    ne.category,
    ne.action_label,
    ne.action_url,
    ne.entity_type,
    ne.entity_id,
    ne.channel_plan,
    ne.context,
    ne.created_at,
    nr.is_read,
    nr.is_dismissed,
    nr.is_archived
  from public.notification_recipients nr
  join public.notification_events ne on ne.id = nr.notification_id
  where nr.app_user_id = public.current_app_user_id()
    and (
      p_status = 'all'
      or (p_status = 'active' and nr.is_dismissed = false and nr.is_archived = false)
      or (p_status = 'unread' and nr.is_read = false and nr.is_dismissed = false and nr.is_archived = false)
      or (p_status = 'read' and nr.is_read = true and nr.is_dismissed = false and nr.is_archived = false)
      or (p_status = 'dismissed' and nr.is_dismissed = true)
      or (p_status = 'archived' and nr.is_archived = true)
    )
    and (
      p_search is null
      or btrim(p_search) = ''
      or ne.title ilike '%' || btrim(p_search) || '%'
      or ne.message ilike '%' || btrim(p_search) || '%'
      or ne.module_code ilike '%' || btrim(p_search) || '%'
      or ne.category ilike '%' || btrim(p_search) || '%'
    )
  order by ne.created_at desc
  limit greatest(coalesce(p_limit, 30), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

grant execute on function public.list_my_notifications(text, text, integer, integer) to authenticated;

create or replace function public.get_my_notification_unread_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.notification_recipients nr
  where nr.app_user_id = public.current_app_user_id()
    and nr.is_read = false
    and nr.is_dismissed = false
    and nr.is_archived = false;
$$;

grant execute on function public.get_my_notification_unread_count() to authenticated;

create or replace function public.mark_notification_read(p_recipient_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notification_recipients
  set is_read = true,
      read_at = coalesce(read_at, now())
  where id = p_recipient_id
    and app_user_id = public.current_app_user_id();
  return found;
end;
$$;

grant execute on function public.mark_notification_read(uuid) to authenticated;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  update public.notification_recipients
  set is_read = true,
      read_at = coalesce(read_at, now())
  where app_user_id = public.current_app_user_id()
    and is_read = false
    and is_dismissed = false
    and is_archived = false;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.mark_all_notifications_read() to authenticated;

create or replace function public.dismiss_notification(p_recipient_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notification_recipients
  set is_dismissed = true,
      dismissed_at = coalesce(dismissed_at, now())
  where id = p_recipient_id
    and app_user_id = public.current_app_user_id();
  return found;
end;
$$;

grant execute on function public.dismiss_notification(uuid) to authenticated;

create or replace function public.get_my_notification_preferences()
returns table(
  app_user_id uuid,
  in_app_enabled boolean,
  email_enabled boolean,
  whatsapp_enabled boolean,
  digest_enabled boolean,
  muted_modules text[],
  muted_categories text[],
  quiet_hours_start time,
  quiet_hours_end time,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(np.app_user_id, public.current_app_user_id()) as app_user_id,
    coalesce(np.in_app_enabled, true) as in_app_enabled,
    coalesce(np.email_enabled, false) as email_enabled,
    coalesce(np.whatsapp_enabled, false) as whatsapp_enabled,
    coalesce(np.digest_enabled, false) as digest_enabled,
    coalesce(np.muted_modules, '{}'::text[]) as muted_modules,
    coalesce(np.muted_categories, '{}'::text[]) as muted_categories,
    np.quiet_hours_start,
    np.quiet_hours_end,
    np.updated_at
  from (select public.current_app_user_id() as app_user_id) me
  left join public.notification_preferences np on np.app_user_id = me.app_user_id;
$$;

grant execute on function public.get_my_notification_preferences() to authenticated;

create or replace function public.upsert_my_notification_preferences(
  p_in_app_enabled boolean default true,
  p_email_enabled boolean default false,
  p_whatsapp_enabled boolean default false,
  p_digest_enabled boolean default false,
  p_muted_modules text[] default null,
  p_muted_categories text[] default null,
  p_quiet_hours_start time default null,
  p_quiet_hours_end time default null
)
returns public.notification_preferences
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.notification_preferences;
begin
  insert into public.notification_preferences (
    app_user_id,
    in_app_enabled,
    email_enabled,
    whatsapp_enabled,
    digest_enabled,
    muted_modules,
    muted_categories,
    quiet_hours_start,
    quiet_hours_end,
    updated_at
  ) values (
    public.current_app_user_id(),
    coalesce(p_in_app_enabled, true),
    coalesce(p_email_enabled, false),
    coalesce(p_whatsapp_enabled, false),
    coalesce(p_digest_enabled, false),
    coalesce(p_muted_modules, '{}'::text[]),
    coalesce(p_muted_categories, '{}'::text[]),
    p_quiet_hours_start,
    p_quiet_hours_end,
    now()
  )
  on conflict (app_user_id) do update
  set in_app_enabled = excluded.in_app_enabled,
      email_enabled = excluded.email_enabled,
      whatsapp_enabled = excluded.whatsapp_enabled,
      digest_enabled = excluded.digest_enabled,
      muted_modules = excluded.muted_modules,
      muted_categories = excluded.muted_categories,
      quiet_hours_start = excluded.quiet_hours_start,
      quiet_hours_end = excluded.quiet_hours_end,
      updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.upsert_my_notification_preferences(boolean, boolean, boolean, boolean, text[], text[], time, time) to authenticated;

create or replace function public.list_notification_admin_feed(
  p_module_code text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table(
  notification_id uuid,
  module_code text,
  event_code text,
  category text,
  title text,
  message text,
  severity text,
  action_label text,
  action_url text,
  entity_type text,
  entity_id text,
  audience_mode text,
  channel_plan jsonb,
  created_at timestamptz,
  created_by uuid,
  recipient_count integer,
  unread_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ne.id as notification_id,
    ne.module_code,
    ne.event_code,
    ne.category,
    ne.title,
    ne.message,
    ne.severity,
    ne.action_label,
    ne.action_url,
    ne.entity_type,
    ne.entity_id,
    ne.audience_mode,
    ne.channel_plan,
    ne.created_at,
    ne.created_by,
    count(nr.id)::integer as recipient_count,
    count(*) filter (where nr.is_read = false and nr.is_dismissed = false and nr.is_archived = false)::integer as unread_count
  from public.notification_events ne
  left join public.notification_recipients nr on nr.notification_id = ne.id
  where public.current_user_has_any_role(array['super_admin', 'admin'])
    and (p_module_code is null or btrim(p_module_code) = '' or ne.module_code = p_module_code)
  group by ne.id
  order by ne.created_at desc
  limit greatest(coalesce(p_limit, 100), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

grant execute on function public.list_notification_admin_feed(text, integer, integer) to authenticated;

alter table public.notification_events enable row level security;
alter table public.notification_recipients enable row level security;
alter table public.notification_preferences enable row level security;

drop policy if exists notification_events_select on public.notification_events;
create policy notification_events_select
on public.notification_events
for select
to authenticated
using (
  public.current_user_has_any_role(array['super_admin', 'admin'])
  or exists (
    select 1
    from public.notification_recipients nr
    where nr.notification_id = notification_events.id
      and nr.app_user_id = public.current_app_user_id()
  )
);

drop policy if exists notification_recipients_select on public.notification_recipients;
create policy notification_recipients_select
on public.notification_recipients
for select
to authenticated
using (
  app_user_id = public.current_app_user_id()
  or public.current_user_has_any_role(array['super_admin', 'admin'])
);

drop policy if exists notification_recipients_update on public.notification_recipients;
create policy notification_recipients_update
on public.notification_recipients
for update
to authenticated
using (
  app_user_id = public.current_app_user_id()
  or public.current_user_has_any_role(array['super_admin', 'admin'])
)
with check (
  app_user_id = public.current_app_user_id()
  or public.current_user_has_any_role(array['super_admin', 'admin'])
);

drop policy if exists notification_preferences_select on public.notification_preferences;
create policy notification_preferences_select
on public.notification_preferences
for select
to authenticated
using (app_user_id = public.current_app_user_id());

drop policy if exists notification_preferences_insert on public.notification_preferences;
create policy notification_preferences_insert
on public.notification_preferences
for insert
to authenticated
with check (app_user_id = public.current_app_user_id());

drop policy if exists notification_preferences_update on public.notification_preferences;
create policy notification_preferences_update
on public.notification_preferences
for update
to authenticated
using (app_user_id = public.current_app_user_id())
with check (app_user_id = public.current_app_user_id());

insert into public.permissions(module_code, action_code, label, is_active)
values
  ('notifications-center', 'view', 'Notifications - View Center', true),
  ('notifications-center', 'create', 'Notifications - Dispatch', true),
  ('notifications-center', 'edit', 'Notifications - Manage Preferences', true),
  ('notifications-center', 'export', 'Notifications - Export Feed', true),
  ('notifications-center', 'view_audit', 'Notifications - View Audit Feed', true)
on conflict (module_code, action_code) do update
set label = excluded.label,
    is_active = true;

with seed_role_permissions(role_code, module_code, action_code) as (
  values
    ('super_admin', 'notifications-center', 'view'),
    ('super_admin', 'notifications-center', 'create'),
    ('super_admin', 'notifications-center', 'edit'),
    ('super_admin', 'notifications-center', 'export'),
    ('super_admin', 'notifications-center', 'view_audit'),
    ('admin', 'notifications-center', 'view'),
    ('admin', 'notifications-center', 'create'),
    ('admin', 'notifications-center', 'edit'),
    ('admin', 'notifications-center', 'export'),
    ('admin', 'notifications-center', 'view_audit'),
    ('manager', 'notifications-center', 'view'),
    ('manager', 'notifications-center', 'edit'),
    ('operator', 'notifications-center', 'view'),
    ('operator', 'notifications-center', 'edit'),
    ('accounts', 'notifications-center', 'view'),
    ('accounts', 'notifications-center', 'edit'),
    ('accounts_manager', 'notifications-center', 'view'),
    ('accounts_manager', 'notifications-center', 'edit'),
    ('accounts_executive', 'notifications-center', 'view'),
    ('accounts_executive', 'notifications-center', 'edit'),
    ('ca', 'notifications-center', 'view'),
    ('ca', 'notifications-center', 'edit'),
    ('cfo', 'notifications-center', 'view'),
    ('cfo', 'notifications-center', 'edit'),
    ('coo', 'notifications-center', 'view'),
    ('coo', 'notifications-center', 'edit'),
    ('auditor', 'notifications-center', 'view'),
    ('auditor', 'notifications-center', 'edit'),
    ('advocate', 'notifications-center', 'view'),
    ('advocate', 'notifications-center', 'edit')
)
insert into public.role_permissions(role_id, permission_id, allow)
select r.id, p.id, true
from seed_role_permissions s
join public.roles r on r.code = s.role_code
join public.permissions p on p.module_code = s.module_code and p.action_code = s.action_code
where not exists (
  select 1
  from public.role_permissions rp
  where rp.role_id = r.id
    and rp.permission_id = p.id
);
