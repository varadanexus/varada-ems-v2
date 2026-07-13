-- Sprint 13F.19: configurable company and statutory tax identity.

insert into public.permissions (module_code, action_code, label, is_active)
values
  ('central-accounts-tax-settings', 'view', 'Central Accounts — Tax & Company Settings (view)', true),
  ('central-accounts-tax-settings', 'edit', 'Central Accounts — Tax & Company Settings (edit)', true)
on conflict (module_code, action_code)
do update set label = excluded.label, is_active = true;

create table if not exists public.company_tax_profiles (
  company_key text primary key default 'PRIMARY' check (company_key = 'PRIMARY'),
  legal_name text,
  trade_name text,
  entity_type text,
  pan text,
  tan text,
  cin text,
  registered_address text,
  city text,
  state_code text,
  pincode text,
  financial_year_start_month integer not null default 4 check (financial_year_start_month between 1 and 12),
  income_tax_filing_type text,
  auditor_name text,
  auditor_membership_no text,
  notes text,
  updated_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_gst_registrations (
  id uuid primary key default gen_random_uuid(),
  company_key text not null default 'PRIMARY' references public.company_tax_profiles(company_key) on delete cascade,
  gstin text not null unique,
  registration_name text not null,
  state_code text not null,
  state_name text not null,
  registration_type text not null default 'regular',
  filing_frequency text not null default 'monthly',
  effective_from date,
  effective_to date,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (registration_type in ('regular', 'composition', 'casual', 'sez', 'isd', 'other')),
  check (filing_frequency in ('monthly', 'qrmp', 'quarterly', 'annual_only')),
  check (gstin ~ '^[0-9]{2}[A-Z0-9]{13}$')
);

insert into public.company_tax_profiles (company_key)
values ('PRIMARY')
on conflict (company_key) do nothing;

alter table public.company_tax_profiles enable row level security;
alter table public.company_gst_registrations enable row level security;
revoke all on table public.company_tax_profiles, public.company_gst_registrations from anon;
grant select, insert, update on table public.company_tax_profiles, public.company_gst_registrations to authenticated;

drop policy if exists company_tax_profiles_select on public.company_tax_profiles;
create policy company_tax_profiles_select on public.company_tax_profiles
for select to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or public.has_permission('central-accounts-tax-settings', 'view')
);

drop policy if exists company_tax_profiles_write on public.company_tax_profiles;
create policy company_tax_profiles_write on public.company_tax_profiles
for all to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or public.has_permission('central-accounts-tax-settings', 'edit')
)
with check (
  public.is_super_admin()
  or public.has_role_code('admin')
  or public.has_permission('central-accounts-tax-settings', 'edit')
);

drop policy if exists company_gst_registrations_select on public.company_gst_registrations;
create policy company_gst_registrations_select on public.company_gst_registrations
for select to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or public.has_permission('central-accounts-tax-settings', 'view')
);

drop policy if exists company_gst_registrations_write on public.company_gst_registrations;
create policy company_gst_registrations_write on public.company_gst_registrations
for all to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or public.has_permission('central-accounts-tax-settings', 'edit')
)
with check (
  public.is_super_admin()
  or public.has_role_code('admin')
  or public.has_permission('central-accounts-tax-settings', 'edit')
);

create unique index if not exists uq_company_gst_primary_active
on public.company_gst_registrations(company_key)
where is_primary = true and is_active = true;
