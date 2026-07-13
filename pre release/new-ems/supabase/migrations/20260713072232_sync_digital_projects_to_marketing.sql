-- Keep the unified Digital Services project master available to the white-label
-- Marketing delivery workspace. Digital Services remains the source of truth.

alter table public.marketing_clients
  add column if not exists ds_client_id uuid unique
  references public.ds_clients(id) on delete cascade;

alter table public.marketing_projects
  add column if not exists ds_project_id uuid unique
  references public.ds_projects(id) on delete cascade;

create or replace function public.marketing_sync_ds_client()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.marketing_clients (
    client_code, ds_client_id, company_name, contact_name, email, phone,
    status, requirements, created_by, created_at, updated_at
  ) values (
    'DSC-' || upper(left(replace(new.id::text, '-', ''), 12)),
    new.id,
    coalesce(nullif(btrim(new.company_name), ''), new.name),
    new.name,
    new.email,
    new.phone,
    case new.status when 'prospect' then 'lead' when 'inactive' then 'closed' else 'active' end,
    new.notes,
    new.created_by,
    new.created_at,
    new.updated_at
  )
  on conflict (ds_client_id) do update set
    company_name = excluded.company_name,
    contact_name = excluded.contact_name,
    email = excluded.email,
    phone = excluded.phone,
    status = excluded.status,
    requirements = excluded.requirements,
    updated_at = excluded.updated_at;
  return new;
end;
$$;

revoke all on function public.marketing_sync_ds_client() from public, anon, authenticated;

create or replace function public.marketing_sync_ds_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_marketing_client_id uuid;
  v_marketing_project_id uuid;
begin
  select id into v_marketing_client_id
  from public.marketing_clients
  where ds_client_id = new.client_id;

  if v_marketing_client_id is null then
    raise exception 'Digital Services client % has not been synchronized', new.client_id;
  end if;

  insert into public.marketing_projects (
    project_code, ds_project_id, client_id, title, service_type, brief,
    status, start_date, target_date, created_by, created_at, updated_at
  ) values (
    'DS-' || coalesce(nullif(btrim(new.code), ''), upper(left(replace(new.id::text, '-', ''), 12))),
    new.id,
    v_marketing_client_id,
    new.title,
    coalesce(nullif(btrim(new.service_type), ''), 'general'),
    new.description,
    case new.status when 'planning' then 'planned' when 'active' then 'in_progress' else new.status end,
    new.start_date,
    new.end_date,
    new.created_by,
    new.created_at,
    new.updated_at
  )
  on conflict (ds_project_id) do update set
    client_id = excluded.client_id,
    title = excluded.title,
    service_type = excluded.service_type,
    brief = excluded.brief,
    status = excluded.status,
    start_date = excluded.start_date,
    target_date = excluded.target_date,
    updated_at = excluded.updated_at
  returning id into v_marketing_project_id;

  insert into public.marketing_project_finance (project_id, client_value, vendor_cost, updated_at)
  values (v_marketing_project_id, new.budget_amount, 0, new.updated_at)
  on conflict (project_id) do update set
    client_value = excluded.client_value,
    updated_at = excluded.updated_at;

  return new;
end;
$$;

revoke all on function public.marketing_sync_ds_project() from public, anon, authenticated;

drop trigger if exists marketing_sync_ds_client_row on public.ds_clients;
create trigger marketing_sync_ds_client_row
after insert or update of name, company_name, email, phone, status, notes
on public.ds_clients
for each row execute function public.marketing_sync_ds_client();

drop trigger if exists marketing_sync_ds_project_row on public.ds_projects;
create trigger marketing_sync_ds_project_row
after insert or update of client_id, code, title, service_type, status, start_date,
  end_date, budget_amount, description
on public.ds_projects
for each row execute function public.marketing_sync_ds_project();

-- Backfill the current Digital Services master data after the bridge is ready.
insert into public.marketing_clients (
  client_code, ds_client_id, company_name, contact_name, email, phone,
  status, requirements, created_by, created_at, updated_at
)
select
  'DSC-' || upper(left(replace(c.id::text, '-', ''), 12)),
  c.id,
  coalesce(nullif(btrim(c.company_name), ''), c.name),
  c.name,
  c.email,
  c.phone,
  case c.status when 'prospect' then 'lead' when 'inactive' then 'closed' else 'active' end,
  c.notes,
  c.created_by,
  c.created_at,
  c.updated_at
from public.ds_clients c
on conflict (ds_client_id) do update set
  company_name = excluded.company_name,
  contact_name = excluded.contact_name,
  email = excluded.email,
  phone = excluded.phone,
  status = excluded.status,
  requirements = excluded.requirements,
  updated_at = excluded.updated_at;

insert into public.marketing_projects (
  project_code, ds_project_id, client_id, title, service_type, brief,
  status, start_date, target_date, created_by, created_at, updated_at
)
select
  'DS-' || coalesce(nullif(btrim(p.code), ''), upper(left(replace(p.id::text, '-', ''), 12))),
  p.id,
  mc.id,
  p.title,
  coalesce(nullif(btrim(p.service_type), ''), 'general'),
  p.description,
  case p.status when 'planning' then 'planned' when 'active' then 'in_progress' else p.status end,
  p.start_date,
  p.end_date,
  p.created_by,
  p.created_at,
  p.updated_at
from public.ds_projects p
join public.marketing_clients mc on mc.ds_client_id = p.client_id
on conflict (ds_project_id) do update set
  client_id = excluded.client_id,
  title = excluded.title,
  service_type = excluded.service_type,
  brief = excluded.brief,
  status = excluded.status,
  start_date = excluded.start_date,
  target_date = excluded.target_date,
  updated_at = excluded.updated_at;

insert into public.marketing_project_finance (project_id, client_value, vendor_cost, updated_at)
select mp.id, p.budget_amount, 0, p.updated_at
from public.marketing_projects mp
join public.ds_projects p on p.id = mp.ds_project_id
on conflict (project_id) do update set
  client_value = excluded.client_value,
  updated_at = excluded.updated_at;
