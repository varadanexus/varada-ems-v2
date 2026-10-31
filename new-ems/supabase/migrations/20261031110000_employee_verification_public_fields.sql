-- Extend the employee verification page with approved business contact and
-- validity details. Address is the office/work address, never a home address.
alter table public.employee_verification_profiles
  add column if not exists company_division text,
  add column if not exists work_address text,
  add column if not exists valid_until date,
  add column if not exists photo_url text;

drop function if exists public.get_employee_verification(text);
create function public.get_employee_verification(p_employee_code text)
returns table (
  employee_code text,
  display_name text,
  job_title text,
  department text,
  employment_status text,
  company_division text,
  work_address text,
  valid_until date,
  photo_url text,
  verified_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select p.employee_code, coalesce(u.display_name, 'Team Member'), p.job_title,
         p.department,
         case
           when p.employment_status <> 'active' then p.employment_status
           when p.valid_until is not null and p.valid_until < current_date then 'expired'
           else 'active'
         end,
         p.company_division, p.work_address, p.valid_until, p.photo_url, now()
  from public.employee_verification_profiles p
  join public.app_users u on u.id = p.user_id
  where upper(trim(p.employee_code)) = upper(trim(p_employee_code))
    and u.deleted_at is null
  limit 1;
$$;
revoke all on function public.get_employee_verification(text) from public;
grant execute on function public.get_employee_verification(text) to anon, authenticated;
