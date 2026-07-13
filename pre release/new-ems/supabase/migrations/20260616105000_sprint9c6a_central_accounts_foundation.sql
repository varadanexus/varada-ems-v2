-- Sprint 9C.6A: Central Accounts foundation build
-- Scope limited to Central Accounts foundation only.
-- No Transportation runtime integration or rerouting in this migration.

create extension if not exists pgcrypto;

create or replace function public.can_view_central_accounts()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_any_role_codes(array[
    'super_admin',
    'admin',
    'accounts_manager',
    'accounts_executive',
    'auditor',
    'ca',
    'cfo',
    'ceo'
  ]);
$$;

create or replace function public.can_manage_central_accounts()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_any_role_codes(array[
    'super_admin',
    'admin',
    'accounts_manager',
    'cfo'
  ]);
$$;

create or replace function public.can_close_central_accounts_periods()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_any_role_codes(array[
    'super_admin',
    'admin',
    'accounts_manager',
    'cfo'
  ]);
$$;

create or replace function public.can_emergency_post_central_accounts()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_any_role_codes(array[
    'super_admin',
    'admin',
    'cfo'
  ]);
$$;

grant execute on function public.can_view_central_accounts() to authenticated;
grant execute on function public.can_manage_central_accounts() to authenticated;
grant execute on function public.can_close_central_accounts_periods() to authenticated;
grant execute on function public.can_emergency_post_central_accounts() to authenticated;

insert into public.roles (code, name)
select 'accounts_manager', 'Accounts Manager'
where not exists (select 1 from public.roles where code = 'accounts_manager');

insert into public.roles (code, name)
select 'accounts_executive', 'Accounts Executive'
where not exists (select 1 from public.roles where code = 'accounts_executive');

insert into public.roles (code, name)
select 'auditor', 'Auditor'
where not exists (select 1 from public.roles where code = 'auditor');

insert into public.roles (code, name)
select 'cfo', 'CFO'
where not exists (select 1 from public.roles where code = 'cfo');

insert into public.roles (code, name)
select 'ceo', 'CEO'
where not exists (select 1 from public.roles where code = 'ceo');

with seed_permissions(module_code, action_code, label) as (
  values
    ('central-accounts-dashboard', 'view', 'Central Accounts Dashboard View'),
    ('central-accounts-coa', 'view', 'Central Accounts COA View'),
    ('central-accounts-coa', 'edit', 'Central Accounts COA Edit'),
    ('central-accounts-financial-documents', 'view', 'Central Accounts Financial Documents View'),
    ('central-accounts-financial-documents', 'create', 'Central Accounts Financial Documents Create'),
    ('central-accounts-financial-documents', 'approve', 'Central Accounts Financial Documents Approve'),
    ('central-accounts-posting-queue', 'view', 'Central Accounts Posting Queue View'),
    ('central-accounts-posting-queue', 'post', 'Central Accounts Posting Queue Post'),
    ('central-accounts-posting-queue', 'reverse', 'Central Accounts Posting Queue Reverse'),
    ('central-accounts-journals', 'view', 'Central Accounts Journals View'),
    ('central-accounts-journals', 'reverse', 'Central Accounts Journals Reverse'),
    ('central-accounts-receivables', 'view', 'Central Accounts Receivables View'),
    ('central-accounts-receivables', 'edit', 'Central Accounts Receivables Edit'),
    ('central-accounts-payables', 'view', 'Central Accounts Payables View'),
    ('central-accounts-payables', 'edit', 'Central Accounts Payables Edit'),
    ('central-accounts-treasury', 'view', 'Central Accounts Treasury View'),
    ('central-accounts-treasury', 'edit', 'Central Accounts Treasury Edit'),
    ('central-accounts-treasury', 'reconcile', 'Central Accounts Treasury Reconcile'),
    ('central-accounts-periods', 'view', 'Central Accounts Periods View'),
    ('central-accounts-periods', 'close', 'Central Accounts Periods Close'),
    ('central-accounts-periods', 'reopen', 'Central Accounts Periods Reopen'),
    ('central-accounts-audit', 'view', 'Central Accounts Audit View'),
    ('central-accounts-audit', 'export', 'Central Accounts Audit Export')
)
insert into public.permissions (module_code, action_code, label, is_active)
select sp.module_code, sp.action_code, sp.label, true
from seed_permissions sp
where not exists (
  select 1 from public.permissions p
  where p.module_code = sp.module_code and p.action_code = sp.action_code
);

with seed_role_permissions(role_code, module_code, action_code) as (
  values
    ('super_admin', 'central-accounts-dashboard', 'view'),
    ('super_admin', 'central-accounts-coa', 'view'),
    ('super_admin', 'central-accounts-coa', 'edit'),
    ('super_admin', 'central-accounts-financial-documents', 'view'),
    ('super_admin', 'central-accounts-financial-documents', 'create'),
    ('super_admin', 'central-accounts-financial-documents', 'approve'),
    ('super_admin', 'central-accounts-posting-queue', 'view'),
    ('super_admin', 'central-accounts-posting-queue', 'post'),
    ('super_admin', 'central-accounts-posting-queue', 'reverse'),
    ('super_admin', 'central-accounts-journals', 'view'),
    ('super_admin', 'central-accounts-journals', 'reverse'),
    ('super_admin', 'central-accounts-receivables', 'view'),
    ('super_admin', 'central-accounts-receivables', 'edit'),
    ('super_admin', 'central-accounts-payables', 'view'),
    ('super_admin', 'central-accounts-payables', 'edit'),
    ('super_admin', 'central-accounts-treasury', 'view'),
    ('super_admin', 'central-accounts-treasury', 'edit'),
    ('super_admin', 'central-accounts-treasury', 'reconcile'),
    ('super_admin', 'central-accounts-periods', 'view'),
    ('super_admin', 'central-accounts-periods', 'close'),
    ('super_admin', 'central-accounts-periods', 'reopen'),
    ('super_admin', 'central-accounts-audit', 'view'),
    ('super_admin', 'central-accounts-audit', 'export'),

    ('admin', 'central-accounts-dashboard', 'view'),
    ('admin', 'central-accounts-coa', 'view'),
    ('admin', 'central-accounts-coa', 'edit'),
    ('admin', 'central-accounts-financial-documents', 'view'),
    ('admin', 'central-accounts-financial-documents', 'create'),
    ('admin', 'central-accounts-financial-documents', 'approve'),
    ('admin', 'central-accounts-posting-queue', 'view'),
    ('admin', 'central-accounts-posting-queue', 'post'),
    ('admin', 'central-accounts-posting-queue', 'reverse'),
    ('admin', 'central-accounts-journals', 'view'),
    ('admin', 'central-accounts-journals', 'reverse'),
    ('admin', 'central-accounts-receivables', 'view'),
    ('admin', 'central-accounts-receivables', 'edit'),
    ('admin', 'central-accounts-payables', 'view'),
    ('admin', 'central-accounts-payables', 'edit'),
    ('admin', 'central-accounts-treasury', 'view'),
    ('admin', 'central-accounts-treasury', 'edit'),
    ('admin', 'central-accounts-treasury', 'reconcile'),
    ('admin', 'central-accounts-periods', 'view'),
    ('admin', 'central-accounts-periods', 'close'),
    ('admin', 'central-accounts-periods', 'reopen'),
    ('admin', 'central-accounts-audit', 'view'),
    ('admin', 'central-accounts-audit', 'export'),

    ('accounts_manager', 'central-accounts-dashboard', 'view'),
    ('accounts_manager', 'central-accounts-coa', 'view'),
    ('accounts_manager', 'central-accounts-coa', 'edit'),
    ('accounts_manager', 'central-accounts-financial-documents', 'view'),
    ('accounts_manager', 'central-accounts-financial-documents', 'create'),
    ('accounts_manager', 'central-accounts-financial-documents', 'approve'),
    ('accounts_manager', 'central-accounts-posting-queue', 'view'),
    ('accounts_manager', 'central-accounts-posting-queue', 'post'),
    ('accounts_manager', 'central-accounts-posting-queue', 'reverse'),
    ('accounts_manager', 'central-accounts-journals', 'view'),
    ('accounts_manager', 'central-accounts-journals', 'reverse'),
    ('accounts_manager', 'central-accounts-receivables', 'view'),
    ('accounts_manager', 'central-accounts-receivables', 'edit'),
    ('accounts_manager', 'central-accounts-payables', 'view'),
    ('accounts_manager', 'central-accounts-payables', 'edit'),
    ('accounts_manager', 'central-accounts-treasury', 'view'),
    ('accounts_manager', 'central-accounts-treasury', 'edit'),
    ('accounts_manager', 'central-accounts-treasury', 'reconcile'),
    ('accounts_manager', 'central-accounts-periods', 'view'),
    ('accounts_manager', 'central-accounts-periods', 'close'),
    ('accounts_manager', 'central-accounts-audit', 'view'),

    ('accounts_executive', 'central-accounts-dashboard', 'view'),
    ('accounts_executive', 'central-accounts-financial-documents', 'view'),
    ('accounts_executive', 'central-accounts-financial-documents', 'create'),
    ('accounts_executive', 'central-accounts-posting-queue', 'view'),
    ('accounts_executive', 'central-accounts-journals', 'view'),
    ('accounts_executive', 'central-accounts-receivables', 'view'),
    ('accounts_executive', 'central-accounts-receivables', 'edit'),
    ('accounts_executive', 'central-accounts-payables', 'view'),
    ('accounts_executive', 'central-accounts-payables', 'edit'),
    ('accounts_executive', 'central-accounts-treasury', 'view'),

    ('auditor', 'central-accounts-dashboard', 'view'),
    ('auditor', 'central-accounts-journals', 'view'),
    ('auditor', 'central-accounts-periods', 'view'),
    ('auditor', 'central-accounts-audit', 'view'),
    ('auditor', 'central-accounts-audit', 'export'),

    ('ca', 'central-accounts-dashboard', 'view'),
    ('ca', 'central-accounts-coa', 'view'),
    ('ca', 'central-accounts-financial-documents', 'view'),
    ('ca', 'central-accounts-financial-documents', 'approve'),
    ('ca', 'central-accounts-posting-queue', 'view'),
    ('ca', 'central-accounts-journals', 'view'),
    ('ca', 'central-accounts-receivables', 'view'),
    ('ca', 'central-accounts-payables', 'view'),
    ('ca', 'central-accounts-treasury', 'view'),
    ('ca', 'central-accounts-periods', 'view'),
    ('ca', 'central-accounts-audit', 'view'),
    ('ca', 'central-accounts-audit', 'export'),

    ('cfo', 'central-accounts-dashboard', 'view'),
    ('cfo', 'central-accounts-coa', 'view'),
    ('cfo', 'central-accounts-coa', 'edit'),
    ('cfo', 'central-accounts-financial-documents', 'view'),
    ('cfo', 'central-accounts-financial-documents', 'create'),
    ('cfo', 'central-accounts-financial-documents', 'approve'),
    ('cfo', 'central-accounts-posting-queue', 'view'),
    ('cfo', 'central-accounts-posting-queue', 'post'),
    ('cfo', 'central-accounts-posting-queue', 'reverse'),
    ('cfo', 'central-accounts-journals', 'view'),
    ('cfo', 'central-accounts-journals', 'reverse'),
    ('cfo', 'central-accounts-receivables', 'view'),
    ('cfo', 'central-accounts-payables', 'view'),
    ('cfo', 'central-accounts-treasury', 'view'),
    ('cfo', 'central-accounts-treasury', 'reconcile'),
    ('cfo', 'central-accounts-periods', 'view'),
    ('cfo', 'central-accounts-periods', 'close'),
    ('cfo', 'central-accounts-periods', 'reopen'),
    ('cfo', 'central-accounts-audit', 'view'),
    ('cfo', 'central-accounts-audit', 'export'),

    ('ceo', 'central-accounts-dashboard', 'view'),
    ('ceo', 'central-accounts-journals', 'view'),
    ('ceo', 'central-accounts-receivables', 'view'),
    ('ceo', 'central-accounts-payables', 'view'),
    ('ceo', 'central-accounts-treasury', 'view'),
    ('ceo', 'central-accounts-audit', 'view')
)
insert into public.role_permissions (role_id, permission_id, allow)
select r.id, p.id, true
from seed_role_permissions srp
join public.roles r on r.code = srp.role_code
join public.permissions p on p.module_code = srp.module_code and p.action_code = srp.action_code
where not exists (
  select 1 from public.role_permissions rp
  where rp.role_id = r.id and rp.permission_id = p.id
);

create table if not exists public.coa_accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  account_class text not null,
  account_group text,
  parent_account_id uuid references public.coa_accounts(id) on delete restrict,
  hierarchy_level integer not null default 1,
  is_posting_allowed boolean not null default false,
  is_control_account boolean not null default false,
  is_active boolean not null default true,
  effective_from date,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (hierarchy_level > 0)
);

create table if not exists public.fiscal_years (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  start_date date not null,
  end_date date not null,
  status text not null default 'draft',
  is_year_end_locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  reopened_at timestamptz,
  check (status in ('draft', 'open', 'closed', 'archived')),
  check (end_date >= start_date)
);

create table if not exists public.accounting_periods (
  id uuid primary key default gen_random_uuid(),
  fiscal_year_id uuid not null references public.fiscal_years(id) on delete restrict,
  period_code text not null,
  period_name text not null,
  period_index integer not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  reopened_at timestamptz,
  unique (fiscal_year_id, period_code),
  check (status in ('open', 'soft_locked', 'closed', 'reopened', 'year_end_locked')),
  check (period_index > 0),
  check (end_date >= start_date)
);

create table if not exists public.reporting_dimensions (
  id uuid primary key default gen_random_uuid(),
  dimension_type text not null,
  code text not null,
  name text not null,
  parent_dimension_id uuid references public.reporting_dimensions(id) on delete restrict,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dimension_type, code),
  check (dimension_type in ('division', 'counterparty', 'project', 'profit_center'))
);

create table if not exists public.cash_accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  ledger_account_id uuid not null references public.coa_accounts(id) on delete restrict,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  bank_name text not null,
  account_title text not null,
  masked_account_number text,
  ifsc_code text,
  ledger_account_id uuid not null references public.coa_accounts(id) on delete restrict,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.central_accounts_posting_number_sequences (
  posting_month text primary key,
  last_number integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (posting_month ~ '^[0-9]{6}$'),
  check (last_number >= 0)
);

create table if not exists public.financial_documents (
  id uuid primary key default gen_random_uuid(),
  document_family text not null,
  source_module text not null,
  source_document_id uuid,
  source_document_no text,
  division_id uuid references public.divisions(id) on delete restrict,
  counterparty_dimension_id uuid references public.reporting_dimensions(id) on delete restrict,
  project_dimension_id uuid references public.reporting_dimensions(id) on delete restrict,
  profit_center_dimension_id uuid references public.reporting_dimensions(id) on delete restrict,
  status text not null default 'draft',
  document_date date not null,
  effective_date date,
  gross_amount numeric(14,2) not null default 0,
  taxable_amount numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  net_amount numeric(14,2) not null default 0,
  finance_approved_by uuid references public.app_users(id) on delete restrict,
  finance_approved_at timestamptz,
  posted_by uuid references public.app_users(id) on delete restrict,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (status in ('draft', 'submitted', 'approved', 'ready_for_posting', 'posted', 'cancelled', 'reversed'))
);

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  journal_no text not null unique,
  posting_sequence text not null unique,
  accounting_period_id uuid not null references public.accounting_periods(id) on delete restrict,
  fiscal_year_id uuid not null references public.fiscal_years(id) on delete restrict,
  financial_document_id uuid references public.financial_documents(id) on delete restrict,
  entry_date date not null,
  source_module text not null,
  source_document_id uuid,
  source_document_family text not null,
  division_id uuid references public.divisions(id) on delete restrict,
  status text not null default 'draft',
  reversal_of_journal_id uuid references public.journal_entries(id) on delete restrict,
  reversal_reason text,
  created_by uuid references public.app_users(id) on delete restrict,
  posted_by uuid references public.app_users(id) on delete restrict,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('draft', 'posted', 'reversed')),
  check (posting_sequence ~ '^POST-[0-9]{6}-[0-9]{6}$')
);

create table if not exists public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references public.journal_entries(id) on delete restrict,
  line_no integer not null,
  ledger_account_id uuid not null references public.coa_accounts(id) on delete restrict,
  division_id uuid references public.divisions(id) on delete restrict,
  counterparty_dimension_id uuid references public.reporting_dimensions(id) on delete restrict,
  project_dimension_id uuid references public.reporting_dimensions(id) on delete restrict,
  profit_center_dimension_id uuid references public.reporting_dimensions(id) on delete restrict,
  debit_amount numeric(14,2) not null default 0,
  credit_amount numeric(14,2) not null default 0,
  line_memo text,
  created_at timestamptz not null default now(),
  unique (journal_entry_id, line_no),
  check (line_no > 0),
  check (debit_amount >= 0),
  check (credit_amount >= 0),
  check ((debit_amount = 0 and credit_amount > 0) or (credit_amount = 0 and debit_amount > 0))
);

create table if not exists public.document_postings (
  id uuid primary key default gen_random_uuid(),
  financial_document_id uuid not null references public.financial_documents(id) on delete restrict,
  posting_sequence text not null unique,
  posting_status text not null default 'queued',
  accounting_period_id uuid references public.accounting_periods(id) on delete restrict,
  journal_entry_id uuid references public.journal_entries(id) on delete restrict,
  reversal_journal_entry_id uuid references public.journal_entries(id) on delete restrict,
  posted_by uuid references public.app_users(id) on delete restrict,
  posted_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  reversal_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (posting_status in ('queued', 'validation_pending', 'ready_to_post', 'processing', 'posted', 'failed', 'reversal_pending', 'reversed')),
  check (posting_sequence ~ '^POST-[0-9]{6}-[0-9]{6}$')
);

create table if not exists public.posting_queue (
  id uuid primary key default gen_random_uuid(),
  financial_document_id uuid not null references public.financial_documents(id) on delete restrict,
  queue_status text not null default 'queued',
  queue_attempt integer not null default 0,
  requested_by uuid references public.app_users(id) on delete restrict,
  processed_by uuid references public.app_users(id) on delete restrict,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz,
  check (queue_status in ('queued', 'validation_pending', 'ready_to_post', 'processing', 'posted', 'failed', 'reversal_pending', 'reversed')),
  check (queue_attempt >= 0)
);

create table if not exists public.receivable_open_items (
  id uuid primary key default gen_random_uuid(),
  financial_document_id uuid not null unique references public.financial_documents(id) on delete restrict,
  division_id uuid references public.divisions(id) on delete restrict,
  counterparty_dimension_id uuid references public.reporting_dimensions(id) on delete restrict,
  due_date date,
  original_amount numeric(14,2) not null default 0,
  open_amount numeric(14,2) not null default 0,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('open', 'partially_settled', 'settled', 'reversed', 'written_off')),
  check (original_amount >= 0),
  check (open_amount >= 0)
);

create table if not exists public.receivable_allocations (
  id uuid primary key default gen_random_uuid(),
  receivable_item_id uuid not null references public.receivable_open_items(id) on delete restrict,
  applied_document_id uuid references public.financial_documents(id) on delete restrict,
  allocation_date date not null,
  amount numeric(14,2) not null default 0,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (amount >= 0),
  check (status in ('draft', 'submitted', 'approved', 'posted', 'reversed'))
);

create table if not exists public.payable_open_items (
  id uuid primary key default gen_random_uuid(),
  financial_document_id uuid not null unique references public.financial_documents(id) on delete restrict,
  division_id uuid references public.divisions(id) on delete restrict,
  counterparty_dimension_id uuid references public.reporting_dimensions(id) on delete restrict,
  due_date date,
  original_amount numeric(14,2) not null default 0,
  open_amount numeric(14,2) not null default 0,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('open', 'partially_settled', 'settled', 'reversed')),
  check (original_amount >= 0),
  check (open_amount >= 0)
);

create table if not exists public.payable_allocations (
  id uuid primary key default gen_random_uuid(),
  payable_item_id uuid not null references public.payable_open_items(id) on delete restrict,
  applied_document_id uuid references public.financial_documents(id) on delete restrict,
  allocation_date date not null,
  amount numeric(14,2) not null default 0,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (amount >= 0),
  check (status in ('draft', 'submitted', 'approved', 'posted', 'reversed'))
);

create table if not exists public.central_accounts_audit_events (
  id bigint generated always as identity primary key,
  event_type text not null,
  entity_type text not null,
  entity_id text,
  financial_document_id uuid references public.financial_documents(id) on delete restrict,
  journal_entry_id uuid references public.journal_entries(id) on delete restrict,
  posting_queue_id uuid references public.posting_queue(id) on delete restrict,
  accounting_period_id uuid references public.accounting_periods(id) on delete restrict,
  actor_app_user_id uuid references public.app_users(id) on delete restrict,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_coa_accounts_parent on public.coa_accounts(parent_account_id);
create index if not exists idx_fiscal_years_status on public.fiscal_years(status);
create index if not exists idx_accounting_periods_fy_status on public.accounting_periods(fiscal_year_id, status, start_date);
create index if not exists idx_reporting_dimensions_type_code on public.reporting_dimensions(dimension_type, code);
create index if not exists idx_cash_accounts_active on public.cash_accounts(is_active) where deleted_at is null;
create index if not exists idx_bank_accounts_active on public.bank_accounts(is_active) where deleted_at is null;
create index if not exists idx_financial_documents_family_status_date on public.financial_documents(document_family, status, document_date desc);
create index if not exists idx_financial_documents_source on public.financial_documents(source_module, source_document_id);
create index if not exists idx_financial_documents_division on public.financial_documents(division_id, status, document_date desc);
create index if not exists idx_journal_entries_period_date on public.journal_entries(accounting_period_id, entry_date desc);
create index if not exists idx_journal_entries_source on public.journal_entries(source_module, source_document_id, source_document_family);
create index if not exists idx_journal_lines_account on public.journal_lines(ledger_account_id);
create index if not exists idx_journal_lines_division on public.journal_lines(division_id);
create index if not exists idx_document_postings_document_status on public.document_postings(financial_document_id, posting_status, created_at desc);
create index if not exists idx_posting_queue_status_created on public.posting_queue(queue_status, created_at);
create index if not exists idx_receivable_open_items_counterparty_status_due on public.receivable_open_items(counterparty_dimension_id, status, due_date);
create index if not exists idx_payable_open_items_counterparty_status_due on public.payable_open_items(counterparty_dimension_id, status, due_date);
create index if not exists idx_ca_audit_events_created_at on public.central_accounts_audit_events(created_at desc);
create index if not exists idx_ca_audit_events_entity on public.central_accounts_audit_events(entity_type, entity_id);

create or replace function public.generate_central_accounts_posting_sequence(p_posting_date date)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month text;
  v_next integer;
begin
  if p_posting_date is null then
    raise exception 'posting_date is required';
  end if;

  v_month := to_char(p_posting_date, 'YYYYMM');

  insert into public.central_accounts_posting_number_sequences (posting_month, last_number)
  values (v_month, 1)
  on conflict (posting_month)
  do update set last_number = public.central_accounts_posting_number_sequences.last_number + 1,
                updated_at = now()
  returning last_number into v_next;

  return 'POST-' || v_month || '-' || lpad(v_next::text, 6, '0');
end;
$$;

grant execute on function public.generate_central_accounts_posting_sequence(date) to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'coa_accounts',
    'fiscal_years',
    'accounting_periods',
    'reporting_dimensions',
    'cash_accounts',
    'bank_accounts',
    'central_accounts_posting_number_sequences',
    'financial_documents',
    'journal_entries',
    'journal_lines',
    'document_postings',
    'posting_queue',
    'receivable_open_items',
    'receivable_allocations',
    'payable_open_items',
    'payable_allocations'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select_hardened', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.can_view_central_accounts())',
      t || '_select_hardened', t
    );
    execute format('drop policy if exists %I on public.%I', t || '_write_hardened', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.can_manage_central_accounts()) with check (public.can_manage_central_accounts())',
      t || '_write_hardened', t
    );
  end loop;
end $$;

alter table public.central_accounts_audit_events enable row level security;

drop policy if exists central_accounts_audit_events_select_hardened on public.central_accounts_audit_events;
create policy central_accounts_audit_events_select_hardened
on public.central_accounts_audit_events
for select to authenticated
using (
  public.has_any_role_codes(array['super_admin', 'admin', 'accounts_manager', 'auditor', 'ca', 'cfo', 'ceo'])
);

drop policy if exists central_accounts_audit_events_insert_hardened on public.central_accounts_audit_events;
create policy central_accounts_audit_events_insert_hardened
on public.central_accounts_audit_events
for insert to authenticated
with check (
  public.can_manage_central_accounts()
  or public.can_emergency_post_central_accounts()
);

drop policy if exists central_accounts_audit_events_write_hardened on public.central_accounts_audit_events;
create policy central_accounts_audit_events_write_hardened
on public.central_accounts_audit_events
for update to authenticated
using (public.can_manage_central_accounts())
with check (public.can_manage_central_accounts());

with seed_dimension_types(dimension_type, code, name) as (
  values
    ('division', 'TRANSPORT', 'Transportation'),
    ('project', 'UNASSIGNED', 'Unassigned Project'),
    ('profit_center', 'TRANSPORT_CORE', 'Transportation Core'),
    ('counterparty', 'UNASSIGNED', 'Unassigned Counterparty')
)
insert into public.reporting_dimensions (dimension_type, code, name, is_active)
select s.dimension_type, s.code, s.name, true
from seed_dimension_types s
where not exists (
  select 1
  from public.reporting_dimensions rd
  where rd.dimension_type = s.dimension_type and rd.code = s.code
);