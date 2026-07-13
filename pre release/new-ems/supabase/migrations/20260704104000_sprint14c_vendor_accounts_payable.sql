-- Sprint 14C: vendor master, purchase bills, advances and settlements.
create table if not exists public.accounting_vendors(
  id uuid primary key default gen_random_uuid(),vendor_code text not null unique,legal_name text not null,trade_name text,
  pan text,gstin text,state_code text,address text,email text,phone text,payment_terms_days integer not null default 30,
  payable_account_id uuid references public.coa_accounts(id) on delete restrict,is_active boolean not null default true,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),deleted_at timestamptz
);
create table if not exists public.purchase_bills(
  id uuid primary key default gen_random_uuid(),vendor_id uuid not null references public.accounting_vendors(id) on delete restrict,
  division_id uuid references public.divisions(id) on delete restrict,bill_no text not null,bill_date date not null,due_date date,
  expense_account_id uuid not null references public.coa_accounts(id) on delete restrict,input_tax_account_id uuid references public.coa_accounts(id) on delete restrict,
  payable_account_id uuid not null references public.coa_accounts(id) on delete restrict,taxable_amount numeric(14,2) not null default 0,
  cgst_amount numeric(14,2) not null default 0,sgst_amount numeric(14,2) not null default 0,igst_amount numeric(14,2) not null default 0,
  cess_amount numeric(14,2) not null default 0,tds_amount numeric(14,2) not null default 0,total_amount numeric(14,2) not null default 0,
  open_amount numeric(14,2) not null default 0,status text not null default 'draft',voucher_id uuid references public.accounting_vouchers(id) on delete restrict,
  reference_document_url text,remarks text,created_by uuid references public.app_users(id),approved_by uuid references public.app_users(id),
  approved_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),deleted_at timestamptz,
  unique(vendor_id,bill_no),check(status in('draft','submitted','approved','posted','partially_paid','paid','cancelled'))
);
create table if not exists public.vendor_advances(
  id uuid primary key default gen_random_uuid(),vendor_id uuid not null references public.accounting_vendors(id),division_id uuid references public.divisions(id),
  advance_date date not null,amount numeric(14,2) not null check(amount>0),unadjusted_amount numeric(14,2) not null,reference_no text,
  voucher_id uuid references public.accounting_vouchers(id),status text not null default 'open',created_at timestamptz not null default now(),
  check(status in('open','partially_adjusted','adjusted','cancelled'))
);
create table if not exists public.vendor_settlements(
  id uuid primary key default gen_random_uuid(),purchase_bill_id uuid not null references public.purchase_bills(id),vendor_advance_id uuid references public.vendor_advances(id),
  payment_voucher_id uuid references public.accounting_vouchers(id),settlement_date date not null,amount numeric(14,2) not null check(amount>0),
  status text not null default 'posted',created_by uuid references public.app_users(id),created_at timestamptz not null default now(),
  check(status in('draft','posted','reversed'))
);
alter table public.accounting_vendors enable row level security;alter table public.purchase_bills enable row level security;
alter table public.vendor_advances enable row level security;alter table public.vendor_settlements enable row level security;
grant select,insert,update on public.accounting_vendors,public.purchase_bills,public.vendor_advances,public.vendor_settlements to authenticated;
do $$ declare t text;begin foreach t in array array['accounting_vendors','purchase_bills','vendor_advances','vendor_settlements'] loop
execute format('create policy %I on public.%I for select to authenticated using(public.is_super_admin() or public.has_role_code(''admin'') or public.has_permission(''central-accounts-payables'',''view''))',t||'_select',t);
execute format('create policy %I on public.%I for all to authenticated using(public.is_super_admin() or public.has_role_code(''admin'') or public.has_permission(''central-accounts-payables'',''edit'')) with check(public.is_super_admin() or public.has_role_code(''admin'') or public.has_permission(''central-accounts-payables'',''edit''))',t||'_write',t);
end loop;end$$;
insert into public.permissions(module_code,action_code,label,is_active) values
('central-accounts-payables','create','Central Accounts Payables Create',true),('central-accounts-payables','edit','Central Accounts Payables Edit',true),('central-accounts-payables','approve','Central Accounts Payables Approve',true)
on conflict(module_code,action_code)do update set is_active=true;
