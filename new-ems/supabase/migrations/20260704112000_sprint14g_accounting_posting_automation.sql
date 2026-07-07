-- Sprint 14G: posting automation for AP, TDS and fixed-asset depreciation.
-- These functions keep the manual voucher/journal engine as the common posting
-- surface while adding source-module workflows for accountants.

insert into public.permissions(module_code,action_code,label,is_active) values
('central-accounts-payables','post','Central Accounts Payables Post',true),
('central-accounts-tds','post','TDS Post Accounting Voucher',true),
('central-accounts-fixed-assets','post','Fixed Assets Post Depreciation',true)
on conflict(module_code,action_code) do update set label=excluded.label,is_active=true;

alter table public.purchase_bills add column if not exists financial_document_id uuid references public.financial_documents(id) on delete restrict;
alter table public.purchase_bills add column if not exists posted_by uuid references public.app_users(id) on delete restrict;
alter table public.purchase_bills add column if not exists posted_at timestamptz;

alter table public.tds_deductions add column if not exists debit_account_id uuid references public.coa_accounts(id) on delete restrict;
alter table public.tds_deductions add column if not exists credit_account_id uuid references public.coa_accounts(id) on delete restrict;
alter table public.tds_deductions add column if not exists voucher_id uuid references public.accounting_vouchers(id) on delete restrict;
alter table public.tds_deductions add column if not exists journal_entry_id uuid references public.journal_entries(id) on delete restrict;
alter table public.tds_deductions add column if not exists posted_by uuid references public.app_users(id) on delete restrict;
alter table public.tds_deductions add column if not exists posted_at timestamptz;

alter table public.fixed_asset_depreciation_runs add column if not exists expense_account_id uuid references public.coa_accounts(id) on delete restrict;
alter table public.fixed_asset_depreciation_runs add column if not exists accumulated_depreciation_account_id uuid references public.coa_accounts(id) on delete restrict;
alter table public.fixed_asset_depreciation_runs add column if not exists voucher_id uuid references public.accounting_vouchers(id) on delete restrict;

create or replace function public.next_accounting_voucher_no(p_prefix text, p_voucher_date date)
returns text
language plpgsql
security definer
set search_path=public
as $$
declare
  v_month text := to_char(p_voucher_date,'YYYYMM');
  v_number integer;
begin
  insert into public.accounting_voucher_sequences(voucher_month,last_number) values(p_prefix || '-' || v_month,1)
  on conflict(voucher_month) do update set last_number=accounting_voucher_sequences.last_number+1,updated_at=now()
  returning last_number into v_number;
  return p_prefix || '-' || v_month || '-' || lpad(v_number::text,5,'0');
end;
$$;

create or replace function public.ensure_purchase_bill_financial_document(p_bill_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  b public.purchase_bills%rowtype;
  v_doc_id uuid;
  v_tax numeric;
begin
  select * into b from public.purchase_bills where id=p_bill_id and deleted_at is null for update;
  if b.id is null then raise exception 'Purchase bill not found'; end if;
  if b.status not in ('approved','posted','partially_paid','paid') then raise exception 'Purchase bill must be approved before creating accounting document'; end if;
  v_tax := coalesce(b.cgst_amount,0)+coalesce(b.sgst_amount,0)+coalesce(b.igst_amount,0)+coalesce(b.cess_amount,0);

  insert into public.financial_documents(document_family,source_module,source_table,source_document_id,source_document_no,division_id,status,document_date,effective_date,gross_amount,taxable_amount,tax_amount,net_amount,finance_approved_by,finance_approved_at)
  values('PURCHASE_BILL','central_accounts','purchase_bills',b.id,b.bill_no,b.division_id,'approved',b.bill_date,b.bill_date,b.total_amount,b.taxable_amount,v_tax,b.total_amount,b.approved_by,b.approved_at)
  on conflict(source_module,source_table,source_document_id,document_family) do update
  set source_document_no=excluded.source_document_no,
      division_id=excluded.division_id,
      status=case when public.financial_documents.status='posted' then public.financial_documents.status else excluded.status end,
      document_date=excluded.document_date,
      effective_date=excluded.effective_date,
      gross_amount=excluded.gross_amount,
      taxable_amount=excluded.taxable_amount,
      tax_amount=excluded.tax_amount,
      net_amount=excluded.net_amount,
      finance_approved_by=excluded.finance_approved_by,
      finance_approved_at=excluded.finance_approved_at,
      updated_at=now()
  returning id into v_doc_id;

  update public.purchase_bills set financial_document_id=v_doc_id,updated_at=now() where id=b.id;
  return v_doc_id;
end;
$$;

create or replace function public.approve_purchase_bill(p_bill_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  b public.purchase_bills%rowtype;
  u uuid := public.current_app_user_id();
begin
  if not (public.is_super_admin() or public.has_role_code('admin') or public.has_permission('central-accounts-payables','approve')) then raise exception 'Not authorized to approve purchase bills'; end if;
  if u is null then raise exception 'Current application user not found'; end if;
  select * into b from public.purchase_bills where id=p_bill_id and deleted_at is null for update;
  if b.id is null then raise exception 'Purchase bill not found'; end if;
  if b.status not in ('submitted','draft') then raise exception 'Only draft/submitted purchase bills can be approved'; end if;
  if b.created_by=u and not public.is_super_admin() then raise exception 'Maker cannot approve the same purchase bill'; end if;
  update public.purchase_bills set status='approved',approved_by=u,approved_at=now(),updated_at=now() where id=b.id;
  perform public.ensure_purchase_bill_financial_document(b.id);
  insert into public.accounting_control_evidence(control_code,control_area,entity_table,entity_id,maker_app_user_id,checker_app_user_id,maker_action,checker_action,evidence_payload,evidence_status)
  values('CA-AP-BILL-APPROVAL','Accounts Payable','purchase_bills',b.id,b.created_by,u,'submitted','approved',jsonb_build_object('bill_no',b.bill_no,'total_amount',b.total_amount),'reviewed');
end;
$$;

create or replace function public.post_purchase_bill(p_bill_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  b public.purchase_bills%rowtype;
  u uuid := public.current_app_user_id();
  v_doc_id uuid;
  v_period_id uuid;
  v_fy_id uuid;
  v_voucher_id uuid := gen_random_uuid();
  v_journal_id uuid := gen_random_uuid();
  v_voucher_no text;
  v_posting_no text;
  v_tax numeric;
  v_line integer := 1;
begin
  if not (public.is_super_admin() or public.has_role_code('admin') or public.has_permission('central-accounts-payables','post')) then raise exception 'Not authorized to post purchase bills'; end if;
  if u is null then raise exception 'Current application user not found'; end if;
  select * into b from public.purchase_bills where id=p_bill_id and deleted_at is null for update;
  if b.id is null then raise exception 'Purchase bill not found'; end if;
  if b.status <> 'approved' then raise exception 'Only approved purchase bills can be posted'; end if;
  if b.approved_by is null then raise exception 'Purchase bill must be checker-approved before posting'; end if;
  if b.created_by=b.approved_by and not public.is_super_admin() then raise exception 'Maker/checker evidence is invalid for this purchase bill'; end if;
  v_period_id := public.get_central_accounts_period_id(b.bill_date);
  if v_period_id is null then raise exception 'No open accounting period for purchase bill date'; end if;
  select fiscal_year_id into v_fy_id from public.accounting_periods where id=v_period_id;
  v_doc_id := public.ensure_purchase_bill_financial_document(b.id);
  v_tax := coalesce(b.cgst_amount,0)+coalesce(b.sgst_amount,0)+coalesce(b.igst_amount,0)+coalesce(b.cess_amount,0);
  v_voucher_no := public.next_accounting_voucher_no('AP',b.bill_date);
  v_posting_no := public.generate_central_accounts_posting_sequence(b.bill_date);

  insert into public.accounting_vouchers(id,voucher_no,voucher_type,voucher_date,division_id,narration,reference_no,status,total_debit,total_credit,created_by,approved_by,approved_at,posted_by,posted_at,journal_entry_id)
  values(v_voucher_id,v_voucher_no,'journal',b.bill_date,b.division_id,'Purchase bill posting: '||b.bill_no,b.bill_no,'posted',b.total_amount,b.total_amount,b.created_by,b.approved_by,b.approved_at,u,now(),v_journal_id);

  insert into public.accounting_voucher_lines(voucher_id,line_no,ledger_account_id,division_id,debit_amount,credit_amount,line_memo)
  values(v_voucher_id,v_line,b.expense_account_id,b.division_id,greatest(coalesce(b.total_amount,0)-v_tax,0),0,'Expense / purchase value');
  v_line := v_line + 1;
  if v_tax > 0 and b.input_tax_account_id is not null then
    insert into public.accounting_voucher_lines(voucher_id,line_no,ledger_account_id,division_id,debit_amount,credit_amount,line_memo)
    values(v_voucher_id,v_line,b.input_tax_account_id,b.division_id,v_tax,0,'Input GST');
    v_line := v_line + 1;
  end if;
  insert into public.accounting_voucher_lines(voucher_id,line_no,ledger_account_id,division_id,debit_amount,credit_amount,line_memo)
  values(v_voucher_id,v_line,b.payable_account_id,b.division_id,0,b.total_amount,'Vendor payable');

  insert into public.journal_entries(id,journal_no,posting_sequence,accounting_period_id,fiscal_year_id,financial_document_id,entry_date,source_module,source_document_id,source_document_family,division_id,status,created_by,posted_by,posted_at)
  values(v_journal_id,v_voucher_no,v_posting_no,v_period_id,v_fy_id,v_doc_id,b.bill_date,'central_accounts',b.id,'PURCHASE_BILL',b.division_id,'posted',b.created_by,u,now());
  insert into public.journal_lines(journal_entry_id,line_no,ledger_account_id,division_id,debit_amount,credit_amount,line_memo)
  select v_journal_id,line_no,ledger_account_id,division_id,debit_amount,credit_amount,line_memo from public.accounting_voucher_lines where voucher_id=v_voucher_id order by line_no;

  insert into public.payable_open_items(financial_document_id,division_id,due_date,original_amount,open_amount,status)
  values(v_doc_id,b.division_id,b.due_date,b.total_amount,b.open_amount,'open')
  on conflict(financial_document_id) do update set due_date=excluded.due_date,original_amount=excluded.original_amount,open_amount=excluded.open_amount,updated_at=now();
  insert into public.document_postings(financial_document_id,posting_sequence,posting_status,accounting_period_id,journal_entry_id,posted_by,posted_at)
  values(v_doc_id,v_posting_no,'posted',v_period_id,v_journal_id,u,now())
  on conflict(posting_sequence) do nothing;

  update public.financial_documents set status='posted',posted_by=u,posted_at=now(),updated_at=now() where id=v_doc_id;
  update public.purchase_bills set status='posted',voucher_id=v_voucher_id,posted_by=u,posted_at=now(),updated_at=now() where id=b.id;
  insert into public.accounting_control_evidence(control_code,control_area,entity_table,entity_id,maker_app_user_id,checker_app_user_id,maker_action,checker_action,evidence_payload,evidence_status)
  values('CA-AP-BILL-POSTING','Accounts Payable','purchase_bills',b.id,b.created_by,u,'approved','posted',jsonb_build_object('bill_no',b.bill_no,'voucher_id',v_voucher_id,'journal_entry_id',v_journal_id,'posting_sequence',v_posting_no),'reviewed');
  return v_journal_id;
end;
$$;

create or replace function public.post_tds_deduction(p_deduction_id uuid,p_debit_account_id uuid,p_credit_account_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  d public.tds_deductions%rowtype;
  u uuid := public.current_app_user_id();
  v_period_id uuid;
  v_fy_id uuid;
  v_voucher_id uuid := gen_random_uuid();
  v_journal_id uuid := gen_random_uuid();
  v_voucher_no text;
  v_posting_no text;
begin
  if not (public.is_super_admin() or public.has_role_code('admin') or public.has_permission('central-accounts-tds','post')) then raise exception 'Not authorized to post TDS'; end if;
  select * into d from public.tds_deductions where id=p_deduction_id for update;
  if d.id is null then raise exception 'TDS deduction not found'; end if;
  if d.journal_entry_id is not null then raise exception 'TDS deduction is already posted'; end if;
  if d.approved_by is null and not public.is_super_admin() then raise exception 'TDS deduction must be approved/prepared before posting'; end if;
  v_period_id := public.get_central_accounts_period_id(d.deduction_date);
  if v_period_id is null then raise exception 'No open accounting period for TDS date'; end if;
  select fiscal_year_id into v_fy_id from public.accounting_periods where id=v_period_id;
  v_voucher_no := public.next_accounting_voucher_no('TDS',d.deduction_date);
  v_posting_no := public.generate_central_accounts_posting_sequence(d.deduction_date);
  insert into public.accounting_vouchers(id,voucher_no,voucher_type,voucher_date,narration,reference_no,status,total_debit,total_credit,created_by,approved_by,approved_at,posted_by,posted_at,journal_entry_id)
  values(v_voucher_id,v_voucher_no,'journal',d.deduction_date,'TDS accounting: '||coalesce(d.return_period,''),d.challan_no,'posted',d.tds_amount,d.tds_amount,coalesce(d.created_by,u),coalesce(d.approved_by,u),coalesce(d.approved_at,now()),u,now(),v_journal_id);
  insert into public.accounting_voucher_lines(voucher_id,line_no,ledger_account_id,debit_amount,credit_amount,line_memo)
  values(v_voucher_id,1,p_debit_account_id,d.tds_amount,0,'TDS debit'),(v_voucher_id,2,p_credit_account_id,0,d.tds_amount,'TDS payable / payment credit');
  insert into public.journal_entries(id,journal_no,posting_sequence,accounting_period_id,fiscal_year_id,entry_date,source_module,source_document_id,source_document_family,status,created_by,posted_by,posted_at)
  values(v_journal_id,v_voucher_no,v_posting_no,v_period_id,v_fy_id,d.deduction_date,'central_accounts',d.id,'TDS_DEDUCTION','posted',coalesce(d.created_by,u),u,now());
  insert into public.journal_lines(journal_entry_id,line_no,ledger_account_id,debit_amount,credit_amount,line_memo)
  values(v_journal_id,1,p_debit_account_id,d.tds_amount,0,'TDS debit'),(v_journal_id,2,p_credit_account_id,0,d.tds_amount,'TDS payable / payment credit');
  update public.tds_deductions set debit_account_id=p_debit_account_id,credit_account_id=p_credit_account_id,voucher_id=v_voucher_id,journal_entry_id=v_journal_id,posted_by=u,posted_at=now(),filing_status=case when filing_status='pending' then 'challan_paid' else filing_status end,updated_at=now() where id=d.id;
  insert into public.accounting_control_evidence(control_code,control_area,entity_table,entity_id,maker_app_user_id,checker_app_user_id,maker_action,checker_action,evidence_payload,evidence_status)
  values('CA-TDS-POSTING','TDS','tds_deductions',d.id,d.created_by,u,'prepared','posted',jsonb_build_object('voucher_id',v_voucher_id,'journal_entry_id',v_journal_id,'posting_sequence',v_posting_no,'tds_amount',d.tds_amount),'reviewed');
  return v_journal_id;
end;
$$;

create or replace function public.post_fixed_asset_depreciation_run(p_run_id uuid,p_expense_account_id uuid,p_accumulated_depreciation_account_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.fixed_asset_depreciation_runs%rowtype;
  u uuid := public.current_app_user_id();
  v_date date;
  v_period_id uuid;
  v_fy_id uuid;
  v_voucher_id uuid := gen_random_uuid();
  v_journal_id uuid := gen_random_uuid();
  v_voucher_no text;
  v_posting_no text;
  v_asset_cost numeric;
begin
  if not (public.is_super_admin() or public.has_role_code('admin') or public.has_permission('central-accounts-fixed-assets','post')) then raise exception 'Not authorized to post depreciation'; end if;
  select * into r from public.fixed_asset_depreciation_runs where id=p_run_id for update;
  if r.id is null then raise exception 'Depreciation run not found'; end if;
  if r.status <> 'approved' then raise exception 'Only approved depreciation runs can be posted'; end if;
  if r.journal_entry_id is not null then raise exception 'Depreciation run already posted'; end if;
  v_date := coalesce(r.run_date,(r.run_month||'-01')::date);
  v_period_id := public.get_central_accounts_period_id(v_date);
  if v_period_id is null then raise exception 'No open accounting period for depreciation run'; end if;
  select fiscal_year_id into v_fy_id from public.accounting_periods where id=v_period_id;
  select coalesce(sum(cost_amount),0) into v_asset_cost from public.fixed_assets where status='active' and cost_amount > 0;
  if v_asset_cost <= 0 then raise exception 'No active fixed assets available for depreciation allocation'; end if;
  v_voucher_no := public.next_accounting_voucher_no('DEP',v_date);
  v_posting_no := public.generate_central_accounts_posting_sequence(v_date);
  insert into public.accounting_vouchers(id,voucher_no,voucher_type,voucher_date,narration,reference_no,status,total_debit,total_credit,created_by,approved_by,approved_at,posted_by,posted_at,journal_entry_id)
  values(v_voucher_id,v_voucher_no,'journal',v_date,'Fixed asset depreciation: '||r.run_month,r.run_month,'posted',r.total_depreciation,r.total_depreciation,coalesce(r.prepared_by,u),coalesce(r.approved_by,u),coalesce(r.approved_at,now()),u,now(),v_journal_id);
  insert into public.accounting_voucher_lines(voucher_id,line_no,ledger_account_id,debit_amount,credit_amount,line_memo)
  values(v_voucher_id,1,p_expense_account_id,r.total_depreciation,0,'Depreciation expense'),(v_voucher_id,2,p_accumulated_depreciation_account_id,0,r.total_depreciation,'Accumulated depreciation');
  insert into public.journal_entries(id,journal_no,posting_sequence,accounting_period_id,fiscal_year_id,entry_date,source_module,source_document_id,source_document_family,status,created_by,posted_by,posted_at)
  values(v_journal_id,v_voucher_no,v_posting_no,v_period_id,v_fy_id,v_date,'central_accounts',r.id,'FIXED_ASSET_DEPRECIATION','posted',coalesce(r.prepared_by,u),u,now());
  insert into public.journal_lines(journal_entry_id,line_no,ledger_account_id,debit_amount,credit_amount,line_memo)
  values(v_journal_id,1,p_expense_account_id,r.total_depreciation,0,'Depreciation expense'),(v_journal_id,2,p_accumulated_depreciation_account_id,0,r.total_depreciation,'Accumulated depreciation');
  update public.fixed_assets
  set accumulated_depreciation = accumulated_depreciation + round((cost_amount / v_asset_cost) * r.total_depreciation,2),
      updated_at=now()
  where status='active' and cost_amount > 0;
  update public.fixed_asset_depreciation_runs set status='posted',expense_account_id=p_expense_account_id,accumulated_depreciation_account_id=p_accumulated_depreciation_account_id,voucher_id=v_voucher_id,journal_entry_id=v_journal_id,updated_at=now() where id=r.id;
  insert into public.accounting_control_evidence(control_code,control_area,entity_table,entity_id,maker_app_user_id,checker_app_user_id,maker_action,checker_action,evidence_payload,evidence_status)
  values('CA-FA-DEPRECIATION-POSTING','Fixed Assets','fixed_asset_depreciation_runs',r.id,r.prepared_by,u,'approved','posted',jsonb_build_object('voucher_id',v_voucher_id,'journal_entry_id',v_journal_id,'posting_sequence',v_posting_no,'total_depreciation',r.total_depreciation),'reviewed');
  return v_journal_id;
end;
$$;

grant execute on function public.next_accounting_voucher_no(text,date) to authenticated;
grant execute on function public.ensure_purchase_bill_financial_document(uuid) to authenticated;
grant execute on function public.approve_purchase_bill(uuid) to authenticated;
grant execute on function public.post_purchase_bill(uuid) to authenticated;
grant execute on function public.post_tds_deduction(uuid,uuid,uuid) to authenticated;
grant execute on function public.post_fixed_asset_depreciation_run(uuid,uuid,uuid) to authenticated;
