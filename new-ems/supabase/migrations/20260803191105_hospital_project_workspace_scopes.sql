-- Hospital Projects contextual workspace foundation.
-- Stores multiple service scopes per project and Drive folder provisioning state.

alter table public.hospital_projects
  add column if not exists drive_folder_id text,
  add column if not exists drive_folder_path text,
  add column if not exists drive_folder_status text not null default 'pending'
    check (drive_folder_status in ('pending','ready','failed')),
  add column if not exists drive_folder_error text;

create table if not exists public.hospital_project_service_scopes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.hospital_projects(id) on delete cascade,
  scope_code text not null check (scope_code in (
    'hospital_construction',
    'hospital_consultancy',
    'licensing_regulatory',
    'medical_equipment_procurement',
    'interior_design',
    'hospital_renovation',
    'medical_gas_pipeline',
    'modular_ot',
    'cssd',
    'icu_setup',
    'laboratory_setup',
    'radiology_setup',
    'nabh_accreditation',
    'pmc',
    'turnkey_project'
  )),
  created_by uuid references public.app_users(id) on delete set null default public.current_app_user_id(),
  created_at timestamptz not null default now(),
  unique (project_id, scope_code)
);

create index if not exists idx_hospital_project_service_scopes_project
  on public.hospital_project_service_scopes(project_id);

-- Preserve the intent of projects created before multi-scope selection existed.
insert into public.hospital_project_service_scopes(project_id, scope_code)
select p.id,
  case p.project_type
    when 'medical_equipment' then 'medical_equipment_procurement'
    when 'consultancy' then 'hospital_consultancy'
    when 'renovation' then 'hospital_renovation'
    when 'mep' then 'hospital_construction'
    when 'turnkey' then 'turnkey_project'
    else 'hospital_construction'
  end
from public.hospital_projects p
on conflict (project_id, scope_code) do nothing;

alter table public.hospital_project_service_scopes enable row level security;

drop policy if exists hospital_project_scopes_staff_all on public.hospital_project_service_scopes;
create policy hospital_project_scopes_staff_all
on public.hospital_project_service_scopes
for all to authenticated
using (public.has_permission('hospital-projects','view'))
with check (
  public.has_permission('hospital-projects','create')
  or public.has_permission('hospital-projects','edit')
);

drop policy if exists hospital_project_scopes_participant_select on public.hospital_project_service_scopes;
create policy hospital_project_scopes_participant_select
on public.hospital_project_service_scopes
for select to authenticated
using (public.hospital_can_access_project(project_id));

grant select, insert, update, delete
  on public.hospital_project_service_scopes
  to authenticated;

create or replace function public.hospital_set_project_scopes(
  p_project_id uuid,
  p_scope_codes text[]
)
returns setof public.hospital_project_service_scopes
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if not public.has_permission('hospital-projects','edit') then
    raise exception 'Hospital project edit permission required';
  end if;
  if coalesce(cardinality(p_scope_codes), 0) = 0 then
    raise exception 'At least one service scope is required';
  end if;

  delete from public.hospital_project_service_scopes s
  where s.project_id = p_project_id
    and not (s.scope_code = any(p_scope_codes));

  insert into public.hospital_project_service_scopes(project_id, scope_code)
  select p_project_id, scope_code
  from unnest(p_scope_codes) scope_code
  on conflict (project_id, scope_code) do nothing;

  return query
  select s.*
  from public.hospital_project_service_scopes s
  where s.project_id = p_project_id
  order by s.scope_code;
end;
$$;

revoke all on function public.hospital_set_project_scopes(uuid, text[]) from public, anon;
grant execute on function public.hospital_set_project_scopes(uuid, text[]) to authenticated, service_role;

-- Hospital invoices and credit notes consume the EMS-wide fiscal-year sequences.
-- Project and query references remain module-specific operational identifiers.
create or replace function public.hospital_next_document_number(
  p_document_type text,
  p_date date default current_date
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text := upper(trim(coalesce(p_document_type, '')));
  v_fy text;
  v_no bigint;
  v_prefix text;
begin
  if public.hospital_actor_kind() <> 'staff' then
    raise exception 'Hospital staff access required';
  end if;

  if v_type = 'INVOICE' then
    return public.next_central_document_number('invoice', coalesce(p_date, current_date));
  elsif v_type = 'CREDIT_NOTE' then
    return public.next_central_document_number('credit_note', coalesce(p_date, current_date));
  elsif v_type not in ('PROJECT', 'QUERY') then
    raise exception 'Unsupported document type';
  end if;

  v_fy := public.hospital_fiscal_year(coalesce(p_date, current_date));
  insert into public.hospital_document_sequences(scope_code, document_type, fiscal_year, last_number)
  values ('HOSPITAL_PROJECTS', v_type, v_fy, 1)
  on conflict (scope_code, document_type, fiscal_year)
  do update set
    last_number = public.hospital_document_sequences.last_number + 1,
    updated_at = now()
  returning last_number into v_no;

  v_prefix := case v_type
    when 'PROJECT' then 'HSP/PRJ/'
    else 'HSP/QRY/'
  end;
  return v_prefix || v_fy || '/' || lpad(v_no::text, 5, '0');
end;
$$;

revoke all on function public.hospital_next_document_number(text, date) from public, anon;
grant execute on function public.hospital_next_document_number(text, date) to authenticated, service_role;
