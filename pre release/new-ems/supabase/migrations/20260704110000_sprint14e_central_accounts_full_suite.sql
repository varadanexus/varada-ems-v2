-- Sprint 14E: Central Accounts full-suite workspaces.
-- Adds TDS, fixed assets, close controls, budgets/profitability, audit workspace
-- and maker-checker evidence tables with page-scoped permissions.

create table if not exists public.tds_sections(
  id uuid primary key default gen_random_uuid(),
  section_code text not null unique,
  description text not null,
  default_rate numeric(8,4) not null default 0,
  threshold_amount numeric(14,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tds_deductees(
  id uuid primary key default gen_random_uuid(),
  deductee_code text not null unique,
  legal_name text not null,
  pan text,
  gstin text,
  deductee_type text not null default 'vendor',
  lower_deduction_certificate_no text,
  lower_deduction_rate numeric(8,4),
  certificate_valid_to date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tds_deductions(
  id uuid primary key default gen_random_uuid(),
  financial_document_id uuid references public.financial_documents(id) on delete restrict,
  purchase_bill_id uuid references public.purchase_bills(id) on delete restrict,
  deductee_id uuid not null references public.tds_deductees(id) on delete restrict,
  section_id uuid not null references public.tds_sections(id) on delete restrict,
  deduction_date date not null,
  taxable_amount numeric(14,2) not null default 0,
  tds_rate numeric(8,4) not null default 0,
  tds_amount numeric(14,2) not null default 0,
  challan_no text,
  challan_date date,
  return_form text not null default '26Q',
  return_period text,
  filing_status text not null default 'pending',
  certificate_no text,
  notes text,
  created_by uuid references public.app_users(id) on delete restrict default public.current_app_user_id(),
  approved_by uuid references public.app_users(id) on delete restrict,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(filing_status in('pending','challan_paid','return_prepared','filed','certificate_issued','cancelled'))
);

create table if not exists public.fixed_assets(
  id uuid primary key default gen_random_uuid(),
  asset_code text not null unique,
  asset_name text not null,
  asset_class text not null,
  division_id uuid references public.divisions(id) on delete restrict,
  acquisition_date date not null,
  put_to_use_date date,
  vendor_id uuid references public.accounting_vendors(id) on delete restrict,
  purchase_bill_id uuid references public.purchase_bills(id) on delete restrict,
  cost_amount numeric(14,2) not null default 0,
  salvage_value numeric(14,2) not null default 0,
  useful_life_months integer not null default 60,
  depreciation_method text not null default 'SLM',
  accumulated_depreciation numeric(14,2) not null default 0,
  carrying_amount numeric(14,2) generated always as (cost_amount - accumulated_depreciation) stored,
  status text not null default 'active',
  created_by uuid references public.app_users(id) on delete restrict default public.current_app_user_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(status in('draft','active','held_for_sale','disposed','scrapped'))
);

create table if not exists public.fixed_asset_movements(
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.fixed_assets(id) on delete cascade,
  movement_date date not null,
  movement_type text not null,
  from_division_id uuid references public.divisions(id) on delete restrict,
  to_division_id uuid references public.divisions(id) on delete restrict,
  amount numeric(14,2) not null default 0,
  reference_no text,
  notes text,
  created_by uuid references public.app_users(id) on delete restrict default public.current_app_user_id(),
  created_at timestamptz not null default now(),
  check(movement_type in('capitalized','transfer','impairment','revaluation','disposed','scrapped'))
);

create table if not exists public.fixed_asset_depreciation_runs(
  id uuid primary key default gen_random_uuid(),
  run_month text not null,
  run_date date not null default current_date,
  status text not null default 'draft',
  total_depreciation numeric(14,2) not null default 0,
  journal_entry_id uuid references public.journal_entries(id) on delete restrict,
  prepared_by uuid references public.app_users(id) on delete restrict default public.current_app_user_id(),
  approved_by uuid references public.app_users(id) on delete restrict,
  approved_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(run_month),
  check(status in('draft','prepared','approved','posted','cancelled'))
);

create table if not exists public.accounting_close_checklists(
  id uuid primary key default gen_random_uuid(),
  period_id uuid references public.accounting_periods(id) on delete restrict,
  close_month text not null,
  status text not null default 'open',
  prepared_by uuid references public.app_users(id) on delete restrict default public.current_app_user_id(),
  reviewed_by uuid references public.app_users(id) on delete restrict,
  locked_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(close_month),
  check(status in('open','in_progress','ready_for_review','closed','reopened'))
);

create table if not exists public.accounting_close_tasks(
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.accounting_close_checklists(id) on delete cascade,
  task_area text not null,
  task_name text not null,
  owner_app_user_id uuid references public.app_users(id) on delete restrict,
  due_date date,
  status text not null default 'pending',
  evidence_url text,
  notes text,
  completed_by uuid references public.app_users(id) on delete restrict,
  completed_at timestamptz,
  reviewed_by uuid references public.app_users(id) on delete restrict,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(status in('pending','in_progress','completed','reviewed','blocked','not_applicable'))
);

create table if not exists public.accounting_budgets(
  id uuid primary key default gen_random_uuid(),
  budget_code text not null unique,
  financial_year text not null,
  division_id uuid references public.divisions(id) on delete restrict,
  scenario text not null default 'base',
  status text not null default 'draft',
  prepared_by uuid references public.app_users(id) on delete restrict default public.current_app_user_id(),
  approved_by uuid references public.app_users(id) on delete restrict,
  approved_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(status in('draft','submitted','approved','locked','archived'))
);

create table if not exists public.accounting_budget_lines(
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.accounting_budgets(id) on delete cascade,
  ledger_account_id uuid not null references public.coa_accounts(id) on delete restrict,
  profit_center_dimension_id uuid references public.reporting_dimensions(id) on delete restrict,
  period_code text not null,
  budget_amount numeric(14,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profitability_snapshots(
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null default current_date,
  financial_year text,
  period_code text,
  division_id uuid references public.divisions(id) on delete restrict,
  revenue_amount numeric(14,2) not null default 0,
  direct_cost_amount numeric(14,2) not null default 0,
  indirect_cost_amount numeric(14,2) not null default 0,
  gross_margin_amount numeric(14,2) not null default 0,
  net_margin_amount numeric(14,2) not null default 0,
  source_summary jsonb not null default '{}'::jsonb,
  created_by uuid references public.app_users(id) on delete restrict default public.current_app_user_id(),
  created_at timestamptz not null default now()
);

create table if not exists public.audit_workspace_requests(
  id uuid primary key default gen_random_uuid(),
  request_no text not null unique,
  financial_year text,
  area text not null,
  title text not null,
  description text,
  requested_by uuid references public.app_users(id) on delete restrict default public.current_app_user_id(),
  assigned_to uuid references public.app_users(id) on delete restrict,
  due_date date,
  status text not null default 'open',
  response_notes text,
  evidence_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(status in('open','in_progress','answered','reviewed','closed','waived'))
);

create table if not exists public.accounting_control_evidence(
  id uuid primary key default gen_random_uuid(),
  control_code text not null,
  control_area text not null,
  period_code text,
  entity_table text,
  entity_id uuid,
  maker_app_user_id uuid references public.app_users(id) on delete restrict,
  checker_app_user_id uuid references public.app_users(id) on delete restrict,
  maker_action text,
  checker_action text,
  evidence_payload jsonb not null default '{}'::jsonb,
  evidence_status text not null default 'captured',
  captured_at timestamptz not null default now(),
  check(evidence_status in('captured','exception','reviewed','remediated'))
);

insert into public.permissions(module_code,action_code,label,is_active) values
('central-accounts-tds','view','TDS View',true),('central-accounts-tds','create','TDS Create',true),('central-accounts-tds','edit','TDS Edit',true),('central-accounts-tds','approve','TDS Approve',true),
('central-accounts-fixed-assets','view','Fixed Assets View',true),('central-accounts-fixed-assets','create','Fixed Assets Create',true),('central-accounts-fixed-assets','edit','Fixed Assets Edit',true),('central-accounts-fixed-assets','approve','Fixed Assets Approve',true),
('central-accounts-close-controls','view','Close Controls View',true),('central-accounts-close-controls','create','Close Controls Create',true),('central-accounts-close-controls','edit','Close Controls Edit',true),('central-accounts-close-controls','approve','Close Controls Approve',true),
('central-accounts-budgets','view','Budgets and Profitability View',true),('central-accounts-budgets','create','Budgets and Profitability Create',true),('central-accounts-budgets','edit','Budgets and Profitability Edit',true),('central-accounts-budgets','approve','Budgets and Profitability Approve',true),
('central-accounts-audit','create','Audit Workspace Create',true),('central-accounts-audit','edit','Audit Workspace Edit',true),('central-accounts-audit','approve','Audit Workspace Approve',true)
on conflict(module_code,action_code) do update set label=excluded.label,is_active=true;

insert into public.tds_sections(section_code,description,default_rate,threshold_amount) values
('194C','Payments to contractors',1.0000,30000),('194J','Professional or technical services',10.0000,30000),('194I','Rent',10.0000,240000),('194Q','Purchase of goods',0.1000,5000000)
on conflict(section_code) do nothing;

alter table public.tds_sections enable row level security;
alter table public.tds_deductees enable row level security;
alter table public.tds_deductions enable row level security;
alter table public.fixed_assets enable row level security;
alter table public.fixed_asset_movements enable row level security;
alter table public.fixed_asset_depreciation_runs enable row level security;
alter table public.accounting_close_checklists enable row level security;
alter table public.accounting_close_tasks enable row level security;
alter table public.accounting_budgets enable row level security;
alter table public.accounting_budget_lines enable row level security;
alter table public.profitability_snapshots enable row level security;
alter table public.audit_workspace_requests enable row level security;
alter table public.accounting_control_evidence enable row level security;

grant select,insert,update on public.tds_sections,public.tds_deductees,public.tds_deductions,public.fixed_assets,public.fixed_asset_movements,public.fixed_asset_depreciation_runs,public.accounting_close_checklists,public.accounting_close_tasks,public.accounting_budgets,public.accounting_budget_lines,public.profitability_snapshots,public.audit_workspace_requests,public.accounting_control_evidence to authenticated;

do $$declare r record;begin
  for r in select * from (values
    ('tds_sections','central-accounts-tds'),('tds_deductees','central-accounts-tds'),('tds_deductions','central-accounts-tds'),
    ('fixed_assets','central-accounts-fixed-assets'),('fixed_asset_movements','central-accounts-fixed-assets'),('fixed_asset_depreciation_runs','central-accounts-fixed-assets'),
    ('accounting_close_checklists','central-accounts-close-controls'),('accounting_close_tasks','central-accounts-close-controls'),
    ('accounting_budgets','central-accounts-budgets'),('accounting_budget_lines','central-accounts-budgets'),('profitability_snapshots','central-accounts-budgets'),
    ('audit_workspace_requests','central-accounts-audit'),('accounting_control_evidence','central-accounts-audit')
  ) as x(table_name,module_code) loop
    execute format('drop policy if exists %I on public.%I',r.table_name||'_select',r.table_name);
    execute format('drop policy if exists %I on public.%I',r.table_name||'_write',r.table_name);
    execute format('create policy %I on public.%I for select to authenticated using(public.is_super_admin() or public.has_role_code(''admin'') or public.has_permission(%L,''view''))',r.table_name||'_select',r.table_name,r.module_code);
    execute format('create policy %I on public.%I for all to authenticated using(public.is_super_admin() or public.has_role_code(''admin'') or public.has_permission(%L,''edit'') or public.has_permission(%L,''create'') or public.has_permission(%L,''approve'')) with check(public.is_super_admin() or public.has_role_code(''admin'') or public.has_permission(%L,''edit'') or public.has_permission(%L,''create'') or public.has_permission(%L,''approve''))',r.table_name||'_write',r.table_name,r.module_code,r.module_code,r.module_code,r.module_code,r.module_code,r.module_code);
  end loop;
end$$;
