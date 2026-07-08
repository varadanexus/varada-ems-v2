-- Sprint 17h: Digital Services vendor costs (subcontractors) + ITC + margin
-- Records freelancer/agency bills against a project with input GST (your Input
-- Tax Credit). Margin = client invoices - vendor costs; net GST = output GST -
-- input GST (ITC).

create table if not exists public.ds_project_costs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.ds_projects(id) on delete cascade,
  vendor_name text not null,
  vendor_gstin text,
  description text,
  vendor_ref text,
  bill_date date not null default current_date,
  amount numeric(14,2) not null default 0,
  gst_rate numeric(6,2) not null default 18,
  gst_amount numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null default 0,
  itc_eligible boolean not null default true,
  status text not null default 'unpaid' check (status in ('unpaid','paid')),
  paid_at timestamptz,
  notes text,
  created_by uuid references public.app_users(id) on delete set null default public.current_app_user_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ds_project_costs_project on public.ds_project_costs(project_id);
create index if not exists idx_ds_project_costs_status on public.ds_project_costs(status);

alter table public.ds_project_costs enable row level security;
drop policy if exists ds_project_costs_all on public.ds_project_costs;
create policy ds_project_costs_all on public.ds_project_costs
  for all to authenticated
  using (public.current_user_has_any_role(array['super_admin','admin','manager','operator','coo','cfo','accounts','accounts_manager','accounts_executive']))
  with check (public.current_user_has_any_role(array['super_admin','admin','manager','operator','coo','cfo','accounts','accounts_manager','accounts_executive']));
