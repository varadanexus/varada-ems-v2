-- Marketing delivery workspace: clients engage Varada Nexus while assigned vendors
-- operate as the Varada Nexus Delivery Team. Vendor identity and commercial cost
-- data are deliberately stored outside client-readable tables.

create extension if not exists pgcrypto;

create table public.marketing_clients (
  id uuid primary key default gen_random_uuid(),
  client_code text not null unique,
  company_name text not null,
  contact_name text not null,
  email text,
  phone text,
  auth_user_id uuid unique,
  status text not null default 'active' check (status in ('lead','active','paused','closed')),
  requirements text,
  created_by uuid references public.app_users(id) on delete set null default public.current_app_user_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.marketing_vendors (
  id uuid primary key default gen_random_uuid(),
  vendor_code text not null unique,
  legal_name text not null,
  internal_alias text not null default 'Varada Nexus Delivery Team',
  contact_name text not null,
  email text,
  phone text,
  auth_user_id uuid unique,
  specialties text[] not null default '{}',
  status text not null default 'active' check (status in ('active','paused','blocked')),
  created_by uuid references public.app_users(id) on delete set null default public.current_app_user_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.marketing_projects (
  id uuid primary key default gen_random_uuid(),
  project_code text not null unique,
  client_id uuid not null references public.marketing_clients(id) on delete restrict,
  title text not null,
  service_type text not null,
  brief text,
  status text not null default 'discovery' check (status in ('discovery','planned','in_progress','client_review','completed','on_hold','cancelled')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  start_date date,
  target_date date,
  created_by uuid references public.app_users(id) on delete set null default public.current_app_user_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Private assignment and margin data. Clients have no policy on this table.
create table public.marketing_project_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.marketing_projects(id) on delete cascade,
  vendor_id uuid not null references public.marketing_vendors(id) on delete restrict,
  assignment_status text not null default 'assigned' check (assignment_status in ('assigned','accepted','in_progress','completed','cancelled')),
  assigned_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (project_id, vendor_id)
);

-- Neither clients nor delivery partners receive access to commercial terms.
create table public.marketing_project_finance (
  project_id uuid primary key references public.marketing_projects(id) on delete cascade,
  client_value numeric(14,2) not null default 0 check (client_value >= 0),
  vendor_cost numeric(14,2) not null default 0 check (vendor_cost >= 0),
  updated_at timestamptz not null default now()
);

create table public.marketing_deliverables (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.marketing_projects(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'todo' check (status in ('todo','in_progress','vendor_review','client_review','revision','approved','done')),
  due_date date,
  client_visible boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.marketing_queries (
  id uuid primary key default gen_random_uuid(),
  query_number text not null unique,
  project_id uuid not null references public.marketing_projects(id) on delete cascade,
  subject text not null,
  category text not null default 'general' check (category in ('general','requirement','content','design','approval','timeline','billing','technical')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'open' check (status in ('open','awaiting_client','awaiting_delivery','resolved','closed')),
  raised_by_label text not null default 'Varada Nexus',
  last_message_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.marketing_query_messages (
  id uuid primary key default gen_random_uuid(),
  query_id uuid not null references public.marketing_queries(id) on delete cascade,
  sender_label text not null default 'Varada Nexus',
  body text not null check (length(btrim(body)) between 1 and 10000),
  attachment_url text,
  created_at timestamptz not null default now()
);

-- Actor IDs are kept in a private table so neither external party can discover
-- the other party's real account through the Data API.
create table public.marketing_message_authorship (
  message_id uuid primary key references public.marketing_query_messages(id) on delete cascade,
  auth_user_id uuid not null,
  actor_kind text not null check (actor_kind in ('staff','client','vendor')),
  created_at timestamptz not null default now()
);

create index idx_marketing_clients_auth on public.marketing_clients(auth_user_id);
create index idx_marketing_vendors_auth on public.marketing_vendors(auth_user_id);
create index idx_marketing_projects_client on public.marketing_projects(client_id, created_at desc);
create index idx_marketing_assignments_vendor on public.marketing_project_assignments(vendor_id, assignment_status);
create index idx_marketing_deliverables_project on public.marketing_deliverables(project_id, sort_order);
create index idx_marketing_queries_project on public.marketing_queries(project_id, last_message_at desc);
create index idx_marketing_messages_query on public.marketing_query_messages(query_id, created_at);

insert into public.divisions (code, name) values ('MARKETING', 'Marketing')
on conflict (code) do nothing;

insert into public.permissions (module_code, action_code, label)
select module_code, action_code, label
from (values
  ('marketing','view','View Marketing'),
  ('marketing','create','Create Marketing records'),
  ('marketing','edit','Edit Marketing records'),
  ('marketing','delete','Delete Marketing records'),
  ('marketing','approve','Approve Marketing work'),
  ('marketing','export','Export Marketing data'),
  ('marketing','view_audit','View Marketing audit'),
  ('marketing-command-center','view','View Marketing command center'),
  ('marketing-command-center','create','Create Marketing records'),
  ('marketing-command-center','edit','Edit Marketing records'),
  ('marketing-command-center','delete','Delete Marketing records'),
  ('marketing-command-center','approve','Approve Marketing work'),
  ('marketing-command-center','export','Export Marketing data'),
  ('marketing-command-center','view_audit','View Marketing audit')
) as seed(module_code, action_code, label)
on conflict (module_code, action_code) do nothing;

insert into public.role_permissions (role_id, permission_id, allow)
select r.id, p.id, true
from public.roles r
join public.permissions p on p.module_code in ('marketing','marketing-command-center')
where r.code in ('super_admin','admin')
on conflict (role_id, permission_id) do update set allow = excluded.allow;

insert into public.role_permissions (role_id, permission_id, allow)
select r.id, p.id, true
from public.roles r
join public.permissions p on p.module_code in ('marketing','marketing-command-center')
where r.code = 'manager' and p.action_code in ('view','create','edit','approve','export')
on conflict (role_id, permission_id) do update set allow = excluded.allow;

-- Centralized actor classification used by trigger-controlled public labels.
create function public.marketing_actor_kind()
returns text
language sql
stable
security invoker
set search_path = public
as $$
  select case
    when public.has_permission('marketing','view') then 'staff'
    when exists (select 1 from public.marketing_clients c where c.auth_user_id = (select auth.uid()) and c.status in ('lead','active','paused')) then 'client'
    when exists (select 1 from public.marketing_vendors v where v.auth_user_id = (select auth.uid()) and v.status = 'active') then 'vendor'
    else null
  end;
$$;

grant execute on function public.marketing_actor_kind() to authenticated;

create function public.marketing_can_access_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission('marketing','view')
    or exists (
      select 1 from public.marketing_projects p
      join public.marketing_clients c on c.id = p.client_id
      where p.id = p_project_id and c.auth_user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.marketing_project_assignments a
      join public.marketing_vendors v on v.id = a.vendor_id
      where a.project_id = p_project_id
        and v.auth_user_id = (select auth.uid())
        and a.assignment_status <> 'cancelled'
    );
$$;

revoke all on function public.marketing_can_access_project(uuid) from public, anon;
grant execute on function public.marketing_can_access_project(uuid) to authenticated;

create function public.marketing_next_code(p_prefix text, p_table text, p_column text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next bigint;
begin
  if not public.has_permission('marketing','create') then
    raise exception 'Not authorized to generate Marketing codes';
  end if;
  if (p_table, p_column) not in (('marketing_clients','client_code'), ('marketing_vendors','vendor_code'), ('marketing_projects','project_code')) then
    raise exception 'Unsupported Marketing code target';
  end if;
  execute format('select coalesce(max(nullif(regexp_replace(%I, ''\\D'', '''', ''g''), '''')::bigint), 0) + 1 from public.%I', p_column, p_table)
    into v_next;
  return p_prefix || '-' || lpad(v_next::text, 4, '0');
end;
$$;

revoke all on function public.marketing_next_code(text,text,text) from public, anon;
grant execute on function public.marketing_next_code(text,text,text) to authenticated;

create function public.marketing_prepare_query()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text := public.marketing_actor_kind();
  v_next bigint;
begin
  if v_kind is null or not public.marketing_can_access_project(new.project_id) then
    raise exception 'Not authorized for this Marketing project';
  end if;
  if new.query_number is null or btrim(new.query_number) = '' then
    perform pg_advisory_xact_lock(hashtext('marketing-query-number'));
    select coalesce(max(nullif(regexp_replace(query_number, '\\D', '', 'g'), '')::bigint), 0) + 1 into v_next from public.marketing_queries;
    new.query_number := 'MQ-' || lpad(v_next::text, 5, '0');
  end if;
  new.raised_by_label := case v_kind when 'client' then 'Client' when 'vendor' then 'Varada Nexus Delivery Team' else 'Varada Nexus' end;
  return new;
end;
$$;

revoke all on function public.marketing_prepare_query() from public, anon, authenticated;

create trigger marketing_queries_prepare
before insert on public.marketing_queries
for each row execute function public.marketing_prepare_query();

create function public.marketing_prepare_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text := public.marketing_actor_kind();
  v_project_id uuid;
begin
  select q.project_id into v_project_id from public.marketing_queries q where q.id = new.query_id;
  if v_kind is null or not public.marketing_can_access_project(v_project_id) then
    raise exception 'Not authorized for this Marketing query';
  end if;
  new.sender_label := case v_kind when 'client' then 'Client' when 'vendor' then 'Varada Nexus Delivery Team' else 'Varada Nexus' end;
  return new;
end;
$$;

revoke all on function public.marketing_prepare_message() from public, anon, authenticated;

create function public.marketing_record_message_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text := public.marketing_actor_kind();
begin
  insert into public.marketing_message_authorship(message_id, auth_user_id, actor_kind)
  values (new.id, (select auth.uid()), v_kind);
  update public.marketing_queries
  set last_message_at = new.created_at,
      status = case v_kind when 'client' then 'awaiting_delivery' when 'vendor' then 'awaiting_client' else status end,
      updated_at = now()
  where id = new.query_id;
  return new;
end;
$$;

revoke all on function public.marketing_record_message_actor() from public, anon, authenticated;

create trigger marketing_messages_prepare
before insert on public.marketing_query_messages
for each row execute function public.marketing_prepare_message();

create trigger marketing_messages_record_actor
after insert on public.marketing_query_messages
for each row execute function public.marketing_record_message_actor();

create function public.marketing_lock_assignment_update()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if public.marketing_actor_kind() = 'vendor' then
    if (to_jsonb(new) - 'assignment_status' - 'accepted_at') <> (to_jsonb(old) - 'assignment_status' - 'accepted_at') then
      raise exception 'Delivery users may only update assignment status';
    end if;
    if new.assignment_status not in ('accepted','in_progress','completed') then
      raise exception 'Invalid delivery assignment status';
    end if;
  end if;
  return new;
end;
$$;

create trigger marketing_assignments_lock_external
before update on public.marketing_project_assignments
for each row execute function public.marketing_lock_assignment_update();

create function public.marketing_lock_deliverable_update()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if public.marketing_actor_kind() = 'vendor' and
     (to_jsonb(new) - 'status' - 'updated_at') <> (to_jsonb(old) - 'status' - 'updated_at') then
    raise exception 'Delivery users may only update deliverable status';
  end if;
  return new;
end;
$$;

create trigger marketing_deliverables_lock_external
before update on public.marketing_deliverables
for each row execute function public.marketing_lock_deliverable_update();

create function public.marketing_lock_query_update()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if public.marketing_actor_kind() in ('client','vendor') and
     (to_jsonb(new) - 'status' - 'updated_at' - 'resolved_at' - 'last_message_at') <>
     (to_jsonb(old) - 'status' - 'updated_at' - 'resolved_at' - 'last_message_at') then
    raise exception 'Portal users may only update query status';
  end if;
  return new;
end;
$$;

create trigger marketing_queries_lock_external
before update on public.marketing_queries
for each row execute function public.marketing_lock_query_update();

revoke all on function public.marketing_lock_assignment_update() from public, anon, authenticated;
revoke all on function public.marketing_lock_deliverable_update() from public, anon, authenticated;
revoke all on function public.marketing_lock_query_update() from public, anon, authenticated;

alter table public.marketing_clients enable row level security;
alter table public.marketing_vendors enable row level security;
alter table public.marketing_projects enable row level security;
alter table public.marketing_project_assignments enable row level security;
alter table public.marketing_project_finance enable row level security;
alter table public.marketing_deliverables enable row level security;
alter table public.marketing_queries enable row level security;
alter table public.marketing_query_messages enable row level security;
alter table public.marketing_message_authorship enable row level security;

create policy marketing_clients_staff_select on public.marketing_clients for select to authenticated using (public.has_permission('marketing','view'));
create policy marketing_clients_staff_insert on public.marketing_clients for insert to authenticated with check (public.has_permission('marketing','create'));
create policy marketing_clients_staff_update on public.marketing_clients for update to authenticated using (public.has_permission('marketing','edit')) with check (public.has_permission('marketing','edit'));
create policy marketing_clients_staff_delete on public.marketing_clients for delete to authenticated using (public.has_permission('marketing','delete'));
create policy marketing_clients_self_select on public.marketing_clients for select to authenticated
using (auth_user_id = (select auth.uid()));
create policy marketing_clients_vendor_select on public.marketing_clients for select to authenticated
using (exists (
  select 1 from public.marketing_projects p
  join public.marketing_project_assignments a on a.project_id = p.id
  join public.marketing_vendors v on v.id = a.vendor_id
  where p.client_id = marketing_clients.id and v.auth_user_id = (select auth.uid()) and a.assignment_status <> 'cancelled'
));

create policy marketing_vendors_staff_select on public.marketing_vendors for select to authenticated using (public.has_permission('marketing','view'));
create policy marketing_vendors_staff_insert on public.marketing_vendors for insert to authenticated with check (public.has_permission('marketing','create'));
create policy marketing_vendors_staff_update on public.marketing_vendors for update to authenticated using (public.has_permission('marketing','edit')) with check (public.has_permission('marketing','edit'));
create policy marketing_vendors_staff_delete on public.marketing_vendors for delete to authenticated using (public.has_permission('marketing','delete'));
create policy marketing_vendors_self_select on public.marketing_vendors for select to authenticated
using (auth_user_id = (select auth.uid()));

create policy marketing_projects_staff_select on public.marketing_projects for select to authenticated using (public.has_permission('marketing','view'));
create policy marketing_projects_staff_insert on public.marketing_projects for insert to authenticated with check (public.has_permission('marketing','create'));
create policy marketing_projects_staff_update on public.marketing_projects for update to authenticated using (public.has_permission('marketing','edit')) with check (public.has_permission('marketing','edit'));
create policy marketing_projects_staff_delete on public.marketing_projects for delete to authenticated using (public.has_permission('marketing','delete'));
create policy marketing_projects_participant_select on public.marketing_projects for select to authenticated
using (public.marketing_can_access_project(id));

create policy marketing_assignments_staff_select on public.marketing_project_assignments for select to authenticated using (public.has_permission('marketing','view'));
create policy marketing_assignments_staff_insert on public.marketing_project_assignments for insert to authenticated with check (public.has_permission('marketing','create'));
create policy marketing_assignments_staff_update on public.marketing_project_assignments for update to authenticated using (public.has_permission('marketing','edit')) with check (public.has_permission('marketing','edit'));
create policy marketing_assignments_staff_delete on public.marketing_project_assignments for delete to authenticated using (public.has_permission('marketing','delete'));
create policy marketing_assignments_vendor_select on public.marketing_project_assignments for select to authenticated
using (exists (select 1 from public.marketing_vendors v where v.id = vendor_id and v.auth_user_id = (select auth.uid())));
create policy marketing_assignments_vendor_update on public.marketing_project_assignments for update to authenticated
using (exists (select 1 from public.marketing_vendors v where v.id = vendor_id and v.auth_user_id = (select auth.uid())))
with check (exists (select 1 from public.marketing_vendors v where v.id = vendor_id and v.auth_user_id = (select auth.uid())));

create policy marketing_finance_staff_select on public.marketing_project_finance for select to authenticated
using (public.has_permission('marketing','view'));
create policy marketing_finance_staff_insert on public.marketing_project_finance for insert to authenticated
with check (public.has_permission('marketing','create'));
create policy marketing_finance_staff_update on public.marketing_project_finance for update to authenticated
using (public.has_permission('marketing','edit')) with check (public.has_permission('marketing','edit'));
create policy marketing_finance_staff_delete on public.marketing_project_finance for delete to authenticated
using (public.has_permission('marketing','delete'));

create policy marketing_deliverables_staff_select on public.marketing_deliverables for select to authenticated using (public.has_permission('marketing','view'));
create policy marketing_deliverables_staff_insert on public.marketing_deliverables for insert to authenticated with check (public.has_permission('marketing','create'));
create policy marketing_deliverables_staff_update on public.marketing_deliverables for update to authenticated using (public.has_permission('marketing','edit')) with check (public.has_permission('marketing','edit'));
create policy marketing_deliverables_staff_delete on public.marketing_deliverables for delete to authenticated using (public.has_permission('marketing','delete'));
create policy marketing_deliverables_participant_select on public.marketing_deliverables for select to authenticated
using (public.marketing_can_access_project(project_id) and (client_visible or public.marketing_actor_kind() <> 'client'));
create policy marketing_deliverables_vendor_update on public.marketing_deliverables for update to authenticated
using (public.marketing_actor_kind() = 'vendor' and public.marketing_can_access_project(project_id))
with check (public.marketing_actor_kind() = 'vendor' and public.marketing_can_access_project(project_id));

create policy marketing_queries_staff_select on public.marketing_queries for select to authenticated using (public.has_permission('marketing','view'));
create policy marketing_queries_staff_insert on public.marketing_queries for insert to authenticated with check (public.has_permission('marketing','create'));
create policy marketing_queries_staff_update on public.marketing_queries for update to authenticated using (public.has_permission('marketing','edit')) with check (public.has_permission('marketing','edit'));
create policy marketing_queries_staff_delete on public.marketing_queries for delete to authenticated using (public.has_permission('marketing','delete'));
create policy marketing_queries_participant_select on public.marketing_queries for select to authenticated
using (public.marketing_can_access_project(project_id));
create policy marketing_queries_participant_insert on public.marketing_queries for insert to authenticated
with check (public.marketing_can_access_project(project_id));
create policy marketing_queries_participant_update on public.marketing_queries for update to authenticated
using (public.marketing_can_access_project(project_id))
with check (public.marketing_can_access_project(project_id));

create policy marketing_messages_staff_select on public.marketing_query_messages for select to authenticated using (public.has_permission('marketing','view'));
create policy marketing_messages_staff_insert on public.marketing_query_messages for insert to authenticated with check (public.has_permission('marketing','create'));
create policy marketing_messages_participant_select on public.marketing_query_messages for select to authenticated
using (exists (select 1 from public.marketing_queries q where q.id = query_id and public.marketing_can_access_project(q.project_id)));
create policy marketing_messages_participant_insert on public.marketing_query_messages for insert to authenticated
with check (exists (select 1 from public.marketing_queries q where q.id = query_id and public.marketing_can_access_project(q.project_id)));

-- Only Marketing administrators can inspect real message authorship.
create policy marketing_authorship_admin_select on public.marketing_message_authorship for select to authenticated
using (public.has_permission('marketing','view_audit'));

grant select, insert, update, delete on public.marketing_clients to authenticated;
grant select, insert, update, delete on public.marketing_vendors to authenticated;
grant select, insert, update, delete on public.marketing_projects to authenticated;
grant select, insert, update, delete on public.marketing_project_assignments to authenticated;
grant select, insert, update, delete on public.marketing_project_finance to authenticated;
grant select, insert, update, delete on public.marketing_deliverables to authenticated;
grant select, insert, update, delete on public.marketing_queries to authenticated;
grant select, insert on public.marketing_query_messages to authenticated;
grant select on public.marketing_message_authorship to authenticated;

-- Realtime updates power the seamless query thread without exposing authorship.
alter publication supabase_realtime add table public.marketing_queries;
alter publication supabase_realtime add table public.marketing_query_messages;
