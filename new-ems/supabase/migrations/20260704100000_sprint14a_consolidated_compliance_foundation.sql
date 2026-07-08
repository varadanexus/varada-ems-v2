-- Sprint 14A: consolidated books, GST compliance, and annual audit foundation.

insert into public.permissions (module_code, action_code, label, is_active)
select module_code, action_code, 'Central Accounts — ' || title || ' (' || action_code || ')', true
from (values
  ('central-accounts-consolidated', 'Consolidated Books'),
  ('central-accounts-gst-compliance', 'GST Compliance'),
  ('central-accounts-annual-tax', 'Annual Tax & Audit')
) m(module_code, title)
cross join (values ('view'), ('create'), ('edit'), ('approve'), ('export')) a(action_code)
on conflict (module_code, action_code)
do update set label = excluded.label, is_active = true;

create table if not exists public.gst_return_periods (
  id uuid primary key default gen_random_uuid(),
  gst_registration_id uuid not null references public.company_gst_registrations(id) on delete restrict,
  financial_year text not null,
  period_code text not null,
  period_start date not null,
  period_end date not null,
  filing_frequency text not null,
  gstr1_status text not null default 'not_started',
  gstr3b_status text not null default 'not_started',
  books_locked boolean not null default false,
  reviewed_by uuid references public.app_users(id) on delete set null,
  reviewed_at timestamptz,
  filed_by uuid references public.app_users(id) on delete set null,
  filed_at timestamptz,
  arn text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (gst_registration_id, period_code),
  check (period_end >= period_start),
  check (filing_frequency in ('monthly', 'qrmp', 'quarterly', 'annual_only')),
  check (gstr1_status in ('not_started','prepared','reviewed','filed','revised')),
  check (gstr3b_status in ('not_started','prepared','reviewed','filed','revised'))
);

create table if not exists public.gst_document_classifications (
  id uuid primary key default gen_random_uuid(),
  financial_document_id uuid not null unique references public.financial_documents(id) on delete cascade,
  gst_registration_id uuid references public.company_gst_registrations(id) on delete restrict,
  return_period_id uuid references public.gst_return_periods(id) on delete set null,
  register_type text not null default 'unclassified',
  supply_type text,
  counterparty_gstin text,
  place_of_supply_state_code text,
  hsn_sac text,
  taxable_value numeric(14,2) not null default 0,
  cgst_amount numeric(14,2) not null default 0,
  sgst_amount numeric(14,2) not null default 0,
  igst_amount numeric(14,2) not null default 0,
  cess_amount numeric(14,2) not null default 0,
  reverse_charge boolean not null default false,
  itc_eligibility text not null default 'not_applicable',
  reconciliation_status text not null default 'pending',
  exception_reason text,
  reviewed_by uuid references public.app_users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (register_type in ('unclassified','outward','inward','credit_note','debit_note','payment','receipt')),
  check (supply_type is null or supply_type in ('b2b','b2c_large','b2c_small','export','sez','deemed_export','nil_exempt','non_gst','rcm')),
  check (itc_eligibility in ('not_applicable','eligible','ineligible','blocked','provisional','reversed')),
  check (reconciliation_status in ('pending','matched','mismatch','missing_in_books','missing_in_2b','excluded','reviewed'))
);

create table if not exists public.gst_2b_import_batches (
  id uuid primary key default gen_random_uuid(),
  gst_registration_id uuid not null references public.company_gst_registrations(id) on delete restrict,
  return_period_id uuid references public.gst_return_periods(id) on delete set null,
  source_file_name text not null,
  imported_by uuid references public.app_users(id) on delete set null,
  imported_at timestamptz not null default now(),
  row_count integer not null default 0,
  matched_count integer not null default 0,
  mismatch_count integer not null default 0,
  status text not null default 'imported',
  notes text,
  check (status in ('imported','processing','reconciled','failed'))
);

create table if not exists public.gst_2b_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.gst_2b_import_batches(id) on delete cascade,
  supplier_gstin text,
  supplier_name text,
  invoice_no text not null,
  invoice_date date,
  taxable_value numeric(14,2) not null default 0,
  cgst_amount numeric(14,2) not null default 0,
  sgst_amount numeric(14,2) not null default 0,
  igst_amount numeric(14,2) not null default 0,
  cess_amount numeric(14,2) not null default 0,
  itc_available boolean,
  matched_classification_id uuid references public.gst_document_classifications(id) on delete set null,
  match_status text not null default 'unmatched',
  mismatch_reason text,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (match_status in ('unmatched','matched','mismatch','ignored'))
);

create table if not exists public.statutory_filing_records (
  id uuid primary key default gen_random_uuid(),
  filing_type text not null,
  financial_year text not null,
  period_code text,
  gst_registration_id uuid references public.company_gst_registrations(id) on delete restrict,
  status text not null default 'not_started',
  due_date date,
  prepared_by uuid references public.app_users(id) on delete set null,
  prepared_at timestamptz,
  reviewed_by uuid references public.app_users(id) on delete set null,
  reviewed_at timestamptz,
  filed_by uuid references public.app_users(id) on delete set null,
  filed_at timestamptz,
  acknowledgement_no text,
  evidence_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (filing_type in ('GSTR1','GSTR3B','GSTR9','GSTR9C','ITR','TAX_AUDIT_3CD','TDS_24Q','TDS_26Q','TDS_27Q','ADVANCE_TAX','OTHER')),
  check (status in ('not_started','in_progress','prepared','reviewed','filed','accepted','revised','cancelled'))
);

create table if not exists public.annual_tax_workpapers (
  id uuid primary key default gen_random_uuid(),
  financial_year text not null,
  section_code text not null,
  title text not null,
  amount numeric(14,2),
  status text not null default 'open',
  owner_id uuid references public.app_users(id) on delete set null,
  reviewer_id uuid references public.app_users(id) on delete set null,
  reviewed_at timestamptz,
  evidence_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (financial_year, section_code),
  check (status in ('open','in_progress','ready_for_review','reviewed','final','not_applicable'))
);

-- Every Central Accounts financial document gets a compliance work item.
insert into public.gst_document_classifications (
  financial_document_id, register_type, taxable_value, cgst_amount, sgst_amount,
  igst_amount, cess_amount, reconciliation_status, exception_reason
)
select fd.id,
       case
         when fd.document_family in ('GST_INVOICE','CLIENT_BILL','INTERIOR_BILL') then 'outward'
         when fd.document_family in ('TRANSPORTER_STATEMENT','VENDOR_BILL','PURCHASE_BILL') then 'inward'
         when fd.document_family = 'CREDIT_NOTE' then 'credit_note'
         when fd.document_family in ('CLIENT_RECEIPT') then 'receipt'
         when fd.document_family in ('TRANSPORTER_PAYMENT','VENDOR_PAYMENT') then 'payment'
         else 'unclassified'
       end,
       coalesce(fd.taxable_amount, 0), 0, 0, 0, 0,
       'pending',
       case when coalesce(fd.tax_amount, 0) <> 0 then 'GST breakup requires classification' else null end
from public.financial_documents fd
where fd.deleted_at is null
on conflict (financial_document_id) do nothing;

create or replace function public.trg_seed_gst_document_classification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.gst_document_classifications (
    financial_document_id, register_type, taxable_value, reconciliation_status, exception_reason
  ) values (
    new.id,
    case
      when new.document_family in ('GST_INVOICE','CLIENT_BILL','INTERIOR_BILL') then 'outward'
      when new.document_family in ('TRANSPORTER_STATEMENT','VENDOR_BILL','PURCHASE_BILL') then 'inward'
      when new.document_family = 'CREDIT_NOTE' then 'credit_note'
      when new.document_family = 'CLIENT_RECEIPT' then 'receipt'
      when new.document_family in ('TRANSPORTER_PAYMENT','VENDOR_PAYMENT') then 'payment'
      else 'unclassified'
    end,
    coalesce(new.taxable_amount, 0),
    'pending',
    case when coalesce(new.tax_amount, 0) <> 0 then 'GST breakup requires classification' else null end
  )
  on conflict (financial_document_id) do update
  set taxable_value = excluded.taxable_value,
      updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_seed_gst_document_classification on public.financial_documents;
create trigger trg_seed_gst_document_classification
after insert or update of taxable_amount, tax_amount, document_family
on public.financial_documents
for each row execute function public.trg_seed_gst_document_classification();

alter table public.gst_return_periods enable row level security;
alter table public.gst_document_classifications enable row level security;
alter table public.gst_2b_import_batches enable row level security;
alter table public.gst_2b_items enable row level security;
alter table public.statutory_filing_records enable row level security;
alter table public.annual_tax_workpapers enable row level security;

grant select, insert, update on public.gst_return_periods, public.gst_document_classifications,
  public.gst_2b_import_batches, public.gst_2b_items, public.statutory_filing_records,
  public.annual_tax_workpapers to authenticated;
revoke all on public.gst_return_periods, public.gst_document_classifications,
  public.gst_2b_import_batches, public.gst_2b_items, public.statutory_filing_records,
  public.annual_tax_workpapers from anon;

do $$
declare
  t text;
  module_code text;
begin
  foreach t in array array['gst_return_periods','gst_document_classifications','gst_2b_import_batches','gst_2b_items'] loop
    module_code := 'central-accounts-gst-compliance';
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_super_admin() or public.has_role_code(''admin'') or public.has_permission(%L,''view''))', t || '_select', t, module_code);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_super_admin() or public.has_role_code(''admin'') or public.has_permission(%L,''edit'')) with check (public.is_super_admin() or public.has_role_code(''admin'') or public.has_permission(%L,''edit''))', t || '_write', t, module_code, module_code);
  end loop;

  foreach t in array array['statutory_filing_records','annual_tax_workpapers'] loop
    module_code := 'central-accounts-annual-tax';
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_super_admin() or public.has_role_code(''admin'') or public.has_permission(%L,''view''))', t || '_select', t, module_code);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_super_admin() or public.has_role_code(''admin'') or public.has_permission(%L,''edit'')) with check (public.is_super_admin() or public.has_role_code(''admin'') or public.has_permission(%L,''edit''))', t || '_write', t, module_code, module_code);
  end loop;
end;
$$;

create index if not exists idx_gst_classification_period on public.gst_document_classifications(return_period_id, register_type, reconciliation_status);
create index if not exists idx_gst_2b_match on public.gst_2b_items(batch_id, match_status);
create index if not exists idx_statutory_filing_year on public.statutory_filing_records(financial_year, filing_type, status);
