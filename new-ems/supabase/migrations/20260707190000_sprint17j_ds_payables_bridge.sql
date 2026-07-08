-- Sprint 17j: Digital Services vendor cost -> Central Accounts Payables bridge
-- Turns a DS vendor cost into a purchase bill (status 'submitted') using
-- configurable default accounts, so ITC flows into GST returns once you post it
-- from the Payables screen. Auto-creates the accounting vendor. Never posts to
-- the ledger directly (kept under Payables control).

alter table public.ds_project_costs add column if not exists payable_bill_id uuid;
alter table public.ds_project_costs add column if not exists posted_to_payables boolean not null default false;

create table if not exists public.ds_payables_defaults (
  id integer primary key default 1,
  expense_account_id uuid references public.coa_accounts(id),
  input_tax_account_id uuid references public.coa_accounts(id),
  payable_account_id uuid references public.coa_accounts(id),
  updated_at timestamptz not null default now(),
  constraint ds_payables_defaults_singleton check (id = 1)
);
insert into public.ds_payables_defaults (id) values (1) on conflict (id) do nothing;

alter table public.ds_payables_defaults enable row level security;
drop policy if exists ds_payables_defaults_all on public.ds_payables_defaults;
create policy ds_payables_defaults_all on public.ds_payables_defaults
  for all to authenticated
  using (public.current_user_has_any_role(array['super_admin','admin','accounts','accounts_manager','cfo','coo']))
  with check (public.current_user_has_any_role(array['super_admin','admin','accounts','accounts_manager','cfo','coo']));

create or replace function public.ds_post_cost_to_payables(p_cost_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cost record;
  v_def record;
  v_vendor_id uuid;
  v_division_id uuid;
  v_bill_id uuid;
  v_actor uuid := public.current_app_user_id();
  v_vstate text;
  v_inter boolean;
  v_taxable numeric(14,2);
  v_cgst numeric(14,2) := 0;
  v_sgst numeric(14,2) := 0;
  v_igst numeric(14,2) := 0;
  v_input_acct uuid;
  v_bill_no text;
begin
  if p_cost_id is null then raise exception 'cost id is required'; end if;
  select * into v_cost from public.ds_project_costs where id = p_cost_id;
  if not found then raise exception 'Vendor cost not found'; end if;
  if v_cost.posted_to_payables and v_cost.payable_bill_id is not null then return v_cost.payable_bill_id; end if;

  select * into v_def from public.ds_payables_defaults where id = 1;
  if v_def.expense_account_id is null or v_def.payable_account_id is null then
    raise exception 'Configure Digital Services payables default accounts (Expense + Payable) in Settings first';
  end if;

  select id into v_division_id from public.divisions where code = 'DIGITAL_SERVICES' limit 1;

  -- Ensure an accounting vendor (match by GSTIN, else legal name).
  if coalesce(nullif(btrim(v_cost.vendor_gstin), ''), '') <> '' then
    select id into v_vendor_id from public.accounting_vendors where deleted_at is null and upper(gstin) = upper(v_cost.vendor_gstin) limit 1;
  end if;
  if v_vendor_id is null then
    select id into v_vendor_id from public.accounting_vendors where deleted_at is null and lower(legal_name) = lower(v_cost.vendor_name) limit 1;
  end if;
  if v_vendor_id is null then
    v_vstate := nullif(left(coalesce(v_cost.vendor_gstin, ''), 2), '');
    insert into public.accounting_vendors (vendor_code, legal_name, gstin, state_code, payment_terms_days, is_active, payable_account_id)
    values ('DSV-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6)), v_cost.vendor_name,
            nullif(btrim(v_cost.vendor_gstin), ''), v_vstate, 30, true, v_def.payable_account_id)
    returning id into v_vendor_id;
  end if;

  -- Tax split. ITC-eligible: input GST credited to the input-tax account; otherwise loaded to expense.
  v_vstate := nullif(left(coalesce(v_cost.vendor_gstin, ''), 2), '');
  v_inter := v_vstate is not null and v_vstate <> '37';
  if v_cost.itc_eligible and coalesce(v_cost.gst_amount, 0) > 0 then
    v_taxable := coalesce(v_cost.amount, 0);
    if v_inter then v_igst := coalesce(v_cost.gst_amount, 0);
    else v_cgst := round(coalesce(v_cost.gst_amount, 0) / 2, 2); v_sgst := coalesce(v_cost.gst_amount, 0) - v_cgst; end if;
    v_input_acct := v_def.input_tax_account_id;
  else
    v_taxable := coalesce(v_cost.total_amount, 0);
    v_input_acct := null;
  end if;

  v_bill_no := coalesce(nullif(btrim(v_cost.vendor_ref), ''), 'DSV/' || to_char(now(), 'YYMMDD') || '/' || substr(md5(v_cost.id::text), 1, 4));

  insert into public.purchase_bills (
    vendor_id, division_id, bill_no, bill_date, expense_account_id, input_tax_account_id, payable_account_id,
    taxable_amount, cgst_amount, sgst_amount, igst_amount, cess_amount, tds_amount, total_amount, open_amount,
    status, created_by, remarks
  ) values (
    v_vendor_id, v_division_id, v_bill_no, v_cost.bill_date, v_def.expense_account_id, v_input_acct, v_def.payable_account_id,
    v_taxable, v_cgst, v_sgst, v_igst, 0, 0, coalesce(v_cost.total_amount, 0), coalesce(v_cost.total_amount, 0),
    'submitted', v_actor, 'Digital Services vendor cost'
  ) returning id into v_bill_id;

  update public.ds_project_costs set payable_bill_id = v_bill_id, posted_to_payables = true, updated_at = now() where id = p_cost_id;
  return v_bill_id;
end;
$$;
grant execute on function public.ds_post_cost_to_payables(uuid) to authenticated;
