-- Careers publication foundation.
-- Public job content and internal recruiting data are deliberately separated so
-- an anonymous visitor can never retrieve referral links, client identities or
-- recruiter notes through the browser API.

create table if not exists public.career_jobs (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 2 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  category text,
  summary text not null check (char_length(trim(summary)) between 20 and 500),
  description text not null check (char_length(trim(description)) >= 50),
  responsibilities text[] not null default '{}',
  qualifications text[] not null default '{}',
  skills text[] not null default '{}',
  employment_type text not null default 'contract' check (employment_type in ('full_time','part_time','contract','temporary','internship','volunteer','other')),
  workplace_type text not null default 'remote' check (workplace_type in ('remote','hybrid','on_site')),
  location_label text not null default 'Remote — India',
  applicant_countries text[] not null default array['IN']::text[],
  experience_level text,
  commitment text,
  compensation_min numeric(14,2),
  compensation_max numeric(14,2),
  compensation_currency text not null default 'USD' check (compensation_currency ~ '^[A-Z]{3}$'),
  compensation_period text check (compensation_period is null or compensation_period in ('hour','day','week','month','year','project')),
  application_email text not null default 'hr@varadanexus.com',
  application_instructions text,
  status text not null default 'draft' check (status in ('draft','published','closed','archived')),
  featured boolean not null default false,
  date_posted date,
  valid_through timestamptz,
  published_at timestamptz,
  seo_title text,
  seo_description text,
  created_by uuid default public.current_app_user_id(),
  updated_by uuid default public.current_app_user_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint career_jobs_compensation_range check (
    compensation_min is null or compensation_max is null or compensation_max >= compensation_min
  ),
  constraint career_jobs_publication_fields check (
    status <> 'published' or (date_posted is not null and published_at is not null)
  )
);

create table if not exists public.career_job_private (
  job_id uuid primary key references public.career_jobs(id) on delete cascade,
  internal_job_id text,
  client_name text,
  source_url text,
  referral_url text,
  interview_url text,
  internal_notes text,
  created_by uuid default public.current_app_user_id(),
  updated_by uuid default public.current_app_user_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists career_jobs_public_listing_idx
  on public.career_jobs (featured desc, date_posted desc, created_at desc)
  where status = 'published' and deleted_at is null;
create index if not exists career_jobs_status_idx on public.career_jobs (status);

create or replace function public.set_career_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  new.updated_by = public.current_app_user_id();
  return new;
end;
$$;

drop trigger if exists career_jobs_set_updated_at on public.career_jobs;
create trigger career_jobs_set_updated_at
before update on public.career_jobs
for each row execute function public.set_career_updated_at();

drop trigger if exists career_job_private_set_updated_at on public.career_job_private;
create trigger career_job_private_set_updated_at
before update on public.career_job_private
for each row execute function public.set_career_updated_at();

alter table public.career_jobs enable row level security;
alter table public.career_job_private enable row level security;

revoke all on table public.career_jobs from anon, authenticated;
revoke all on table public.career_job_private from anon, authenticated;
grant select on table public.career_jobs to anon, authenticated;
grant insert, update, delete on table public.career_jobs to authenticated;
grant select, insert, update, delete on table public.career_job_private to authenticated;
grant all on table public.career_jobs to service_role;
grant all on table public.career_job_private to service_role;

drop policy if exists career_jobs_public_read on public.career_jobs;
create policy career_jobs_public_read on public.career_jobs
for select to anon, authenticated
using (
  status = 'published'
  and deleted_at is null
  and published_at <= now()
  and (valid_through is null or valid_through > now())
);

drop policy if exists career_jobs_staff_read on public.career_jobs;
create policy career_jobs_staff_read on public.career_jobs
for select to authenticated
using (public.is_super_admin() or public.has_permission('careers', 'view'));

drop policy if exists career_jobs_staff_insert on public.career_jobs;
create policy career_jobs_staff_insert on public.career_jobs
for insert to authenticated
with check (public.is_super_admin() or public.has_permission('careers', 'create'));

drop policy if exists career_jobs_staff_update on public.career_jobs;
create policy career_jobs_staff_update on public.career_jobs
for update to authenticated
using (public.is_super_admin() or public.has_permission('careers', 'edit'))
with check (public.is_super_admin() or public.has_permission('careers', 'edit'));

drop policy if exists career_jobs_staff_delete on public.career_jobs;
create policy career_jobs_staff_delete on public.career_jobs
for delete to authenticated
using (public.is_super_admin() or public.has_permission('careers', 'delete'));

drop policy if exists career_job_private_staff_read on public.career_job_private;
create policy career_job_private_staff_read on public.career_job_private
for select to authenticated
using (public.is_super_admin() or public.has_permission('careers', 'view'));

drop policy if exists career_job_private_staff_insert on public.career_job_private;
create policy career_job_private_staff_insert on public.career_job_private
for insert to authenticated
with check (public.is_super_admin() or public.has_permission('careers', 'create'));

drop policy if exists career_job_private_staff_update on public.career_job_private;
create policy career_job_private_staff_update on public.career_job_private
for update to authenticated
using (public.is_super_admin() or public.has_permission('careers', 'edit'))
with check (public.is_super_admin() or public.has_permission('careers', 'edit'));

drop policy if exists career_job_private_staff_delete on public.career_job_private;
create policy career_job_private_staff_delete on public.career_job_private
for delete to authenticated
using (public.is_super_admin() or public.has_permission('careers', 'delete'));

with seed_actions(action_code) as (
  values ('view'), ('create'), ('edit'), ('delete')
)
insert into public.permissions (module_code, action_code, label, is_active)
select 'careers', action_code, 'Careers ' || initcap(action_code), true
from seed_actions
where not exists (
  select 1 from public.permissions p
  where p.module_code = 'careers' and p.action_code = seed_actions.action_code
);

insert into public.role_permissions (role_id, permission_id, allow)
select r.id, p.id, true
from public.roles r
join public.permissions p on p.module_code = 'careers'
where r.code in ('super_admin', 'chairman_managing_director', 'admin', 'hr', 'hr_manager', 'recruiter')
and not exists (
  select 1 from public.role_permissions rp
  where rp.role_id = r.id and rp.permission_id = p.id
);

comment on table public.career_jobs is 'Public-safe careers content. Anonymous reads are restricted to active published jobs.';
comment on table public.career_job_private is 'Restricted recruiting metadata; never exposed to anonymous website visitors.';

create table if not exists public.career_applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.career_jobs(id) on delete restrict,
  full_name text not null check (char_length(trim(full_name)) between 2 and 160),
  email text not null check (position('@' in email) > 1),
  contact_number text not null check (char_length(trim(contact_number)) between 7 and 30),
  current_location text,
  country_code text,
  time_zone text,
  expected_pay_min numeric(14,2),
  expected_pay_max numeric(14,2),
  expected_pay_currency text not null default 'USD' check (expected_pay_currency ~ '^[A-Z]{3}$'),
  expected_pay_period text not null default 'hour' check (expected_pay_period in ('hour','day','week','month','year','project')),
  available_from date,
  available_hours_per_week numeric(6,2) check (available_hours_per_week is null or available_hours_per_week between 0 and 168),
  linkedin_url text,
  portfolio_url text,
  cover_note text,
  resume_file_name text not null,
  resume_mime_type text not null,
  resume_file_size bigint not null check (resume_file_size between 1 and 10485760),
  drive_file_id text not null,
  drive_folder_id text not null,
  drive_web_view_link text,
  status text not null default 'new' check (status in ('new','under_review','shortlisted','invited','rejected','withdrawn')),
  consent_at timestamptz not null,
  updated_by uuid default public.current_app_user_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists career_applications_job_email_unique
  on public.career_applications (job_id, lower(email))
  where status <> 'withdrawn';
create index if not exists career_applications_job_created_idx
  on public.career_applications (job_id, created_at desc);

drop trigger if exists career_applications_set_updated_at on public.career_applications;
create trigger career_applications_set_updated_at
before update on public.career_applications
for each row execute function public.set_career_updated_at();

alter table public.career_applications enable row level security;
revoke all on table public.career_applications from anon, authenticated;
grant select, update, delete on table public.career_applications to authenticated;
grant all on table public.career_applications to service_role;

drop policy if exists career_applications_staff_read on public.career_applications;
create policy career_applications_staff_read on public.career_applications
for select to authenticated
using (public.is_super_admin() or public.has_permission('careers', 'view'));

drop policy if exists career_applications_staff_update on public.career_applications;
create policy career_applications_staff_update on public.career_applications
for update to authenticated
using (public.is_super_admin() or public.has_permission('careers', 'edit'))
with check (public.is_super_admin() or public.has_permission('careers', 'edit'));

drop policy if exists career_applications_staff_delete on public.career_applications;
create policy career_applications_staff_delete on public.career_applications
for delete to authenticated
using (public.is_super_admin() or public.has_permission('careers', 'delete'));

comment on table public.career_applications is 'Private candidate applications created only by the server-side careers intake function.';
