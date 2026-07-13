-- Sprint 14D: bank statement import and reconciliation.
create table if not exists public.bank_statement_imports(
  id uuid primary key default gen_random_uuid(),
  bank_account_id uuid not null references public.bank_accounts(id) on delete restrict,
  statement_from date,
  statement_to date,
  opening_balance numeric(14,2),
  closing_balance numeric(14,2),
  source_file_name text not null,
  status text not null default 'imported',
  imported_by uuid references public.app_users(id) on delete restrict default public.current_app_user_id(),
  imported_at timestamptz not null default now(),
  reconciled_by uuid references public.app_users(id) on delete restrict,
  reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(status in('imported','matching','review','reconciled','failed'))
);

create table if not exists public.bank_statement_lines(
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.bank_statement_imports(id) on delete cascade,
  transaction_date date not null,
  value_date date,
  description text,
  reference_no text,
  debit_amount numeric(14,2) not null default 0,
  credit_amount numeric(14,2) not null default 0,
  running_balance numeric(14,2),
  match_status text not null default 'unmatched',
  matched_journal_line_id uuid references public.journal_lines(id) on delete restrict,
  match_confidence numeric(5,2),
  review_note text,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(match_status in('unmatched','suggested','matched','excluded','difference'))
);

create table if not exists public.bank_reconciliation_certificates(
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null unique references public.bank_statement_imports(id) on delete cascade,
  statement_balance numeric(14,2) not null,
  book_balance numeric(14,2) not null,
  unpresented_payments numeric(14,2) not null default 0,
  deposits_in_transit numeric(14,2) not null default 0,
  other_differences numeric(14,2) not null default 0,
  reconciled_balance numeric(14,2) not null,
  prepared_by uuid references public.app_users(id) on delete restrict default public.current_app_user_id(),
  reviewed_by uuid references public.app_users(id) on delete restrict,
  prepared_at timestamptz,
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_bank_statement_imports_bank_status on public.bank_statement_imports(bank_account_id,status,statement_to desc);
create index if not exists idx_bank_statement_lines_import_status on public.bank_statement_lines(import_id,match_status,transaction_date);
create index if not exists idx_bank_statement_lines_reference on public.bank_statement_lines(reference_no);

alter table public.bank_statement_imports enable row level security;
alter table public.bank_statement_lines enable row level security;
alter table public.bank_reconciliation_certificates enable row level security;
grant select,insert,update on public.bank_statement_imports,public.bank_statement_lines,public.bank_reconciliation_certificates to authenticated;
insert into public.permissions(module_code,action_code,label,is_active) values
('central-accounts-treasury','create','Treasury Import Bank Statements',true),('central-accounts-treasury','edit','Treasury Reconciliation Edit',true),('central-accounts-treasury','approve','Treasury Reconciliation Approve',true)
on conflict(module_code,action_code)do update set is_active=true;
do $$declare t text;begin foreach t in array array['bank_statement_imports','bank_statement_lines','bank_reconciliation_certificates']loop
  execute format('drop policy if exists %I on public.%I',t||'_select',t);
  execute format('drop policy if exists %I on public.%I',t||'_write',t);
  execute format('create policy %I on public.%I for select to authenticated using(public.is_super_admin() or public.has_role_code(''admin'') or public.has_permission(''central-accounts-treasury'',''view''))',t||'_select',t);
  execute format('create policy %I on public.%I for all to authenticated using(public.is_super_admin() or public.has_role_code(''admin'') or public.has_permission(''central-accounts-treasury'',''edit'')) with check(public.is_super_admin() or public.has_role_code(''admin'') or public.has_permission(''central-accounts-treasury'',''edit''))',t||'_write',t);
end loop;end$$;
