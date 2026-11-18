-- Employee ID verification profiles. The anonymous lookup returns only the
-- fields approved for public verification: employee ID, name, title,
-- department and active status.
create table if not exists public.employee_verification_profiles (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  employee_code text not null unique,
  job_title text not null,
  department text,
  employment_status text not null default 'active' check (employment_status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.employee_verification_profiles enable row level security;
create unique index if not exists employee_verification_code_normalized_uidx
  on public.employee_verification_profiles (upper(trim(employee_code)));
revoke all on public.employee_verification_profiles from anon;
grant select, insert, update, delete on public.employee_verification_profiles to authenticated;

drop policy if exists employee_verification_admin_all on public.employee_verification_profiles;
create policy employee_verification_admin_all on public.employee_verification_profiles
for all to authenticated
using (public.is_super_admin() or public.has_permission('users','edit'))
with check (public.is_super_admin() or public.has_permission('users','edit'));

create or replace function public.get_employee_verification(p_employee_code text)
returns table (
  employee_code text,
  display_name text,
  job_title text,
  department text,
  employment_status text
)
language sql
security definer
set search_path = public
as $$
  select p.employee_code, coalesce(u.display_name, 'Team Member'), p.job_title,
         p.department, p.employment_status
  from public.employee_verification_profiles p
  join public.app_users u on u.id = p.user_id
  where upper(trim(p.employee_code)) = upper(trim(p_employee_code))
    and u.deleted_at is null
  limit 1;
$$;

revoke all on function public.get_employee_verification(text) from public;
grant execute on function public.get_employee_verification(text) to anon, authenticated;
