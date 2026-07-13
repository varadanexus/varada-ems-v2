-- Sprint 14I: harden AP posting for maker identity and TDS split.

alter table public.purchase_bills
  alter column created_by set default public.current_app_user_id();

alter table public.purchase_bills
  add column if not exists tds_payable_account_id uuid references public.coa_accounts(id) on delete restrict;

create or replace function public.approve_purchase_bill(p_bill_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  b public.purchase_bills%rowtype;
  u uuid := public.current_app_user_id();
  v_maker uuid;
begin
  if not (public.is_super_admin() or public.has_role_code('admin') or public.has_permission('central-accounts-payables','approve')) then raise exception 'Not authorized to approve purchase bills'; end if;
  if u is null then raise exception 'Current application user not found'; end if;
  select * into b from public.purchase_bills where id=p_bill_id and deleted_at is null for update;
  if b.id is null then raise exception 'Purchase bill not found'; end if;
  if b.status not in ('submitted','draft') then raise exception 'Only draft/submitted purchase bills can be approved'; end if;
  v_maker := coalesce(b.created_by,u);
  if v_maker=u and not public.is_super_admin() then raise exception 'Maker cannot approve the same purchase bill'; end if;
  update public.purchase_bills set status='approved',created_by=v_maker,approved_by=u,approved_at=now(),updated_at=now() where id=b.id;
  perform public.ensure_purchase_bill_financial_document(b.id);
  insert into public.accounting_control_evidence(control_code,control_area,entity_table,entity_id,maker_app_user_id,checker_app_user_id,maker_action,checker_action,evidence_payload,evidence_status)
  values('CA-AP-BILL-APPROVAL','Accounts Payable','purchase_bills',b.id,v_maker,u,'submitted','approved',jsonb_build_object('bill_no',b.bill_no,'total_amount',b.total_amount),'reviewed');
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
  v_expense numeric;
  v_tds numeric;
  v_vendor_payable numeric;
  v_line integer := 1;
begin
  if not (public.is_super_admin() or public.has_role_code('admin') or public.has_permission('central-accounts-payables','post')) then raise exception 'Not authorized to post purchase bills'; end if;
  if u is null then raise exception 'Current application user not found'; end if;
  select * into b from public.purchase_bills where id=p_bill_id and deleted_at is null for update;
  if b.id is null then raise exception 'Purchase bill not found'; end if;
  if b.status <> 'approved' then raise exception 'Only approved purchase bills can be posted'; end if;
  if b.approved_by is null then raise exception 'Purchase bill must be checker-approved before posting'; end if;
  if coalesce(b.created_by,b.approved_by)=b.approved_by and not public.is_super_admin() then raise exception 'Maker/checker evidence is invalid for this purchase bill'; end if;

  v_tax := coalesce(b.cgst_amount,0)+coalesce(b.sgst_amount,0)+coalesce(b.igst_amount,0)+coalesce(b.cess_amount,0);
  v_tds := coalesce(b.tds_amount,0);
  v_expense := greatest(coalesce(b.total_amount,0)-v_tax,0);
  v_vendor_payable := coalesce(b.total_amount,0)-v_tds;
  if coalesce(b.total_amount,0) <= 0 then raise exception 'Purchase bill total must be positive'; end if;
  if v_expense <= 0 then raise exception 'Purchase bill expense value must be positive'; end if;
  if v_tax > 0 and b.input_tax_account_id is null then raise exception 'Input tax account is required when GST amount exists'; end if;
  if v_tds > 0 and b.tds_payable_account_id is null then raise exception 'TDS payable account is required when TDS amount exists'; end if;
  if v_vendor_payable <= 0 then raise exception 'Vendor payable must be positive after TDS deduction'; end if;

  v_period_id := public.get_central_accounts_period_id(b.bill_date);
  if v_period_id is null then raise exception 'No open accounting period for purchase bill date'; end if;
  select fiscal_year_id into v_fy_id from public.accounting_periods where id=v_period_id;
  v_doc_id := public.ensure_purchase_bill_financial_document(b.id);
  v_voucher_no := public.next_accounting_voucher_no('AP',b.bill_date);
  v_posting_no := public.generate_central_accounts_posting_sequence(b.bill_date);

  insert into public.accounting_vouchers(id,voucher_no,voucher_type,voucher_date,division_id,narration,reference_no,status,total_debit,total_credit,created_by,approved_by,approved_at,posted_by,posted_at,journal_entry_id)
  values(v_voucher_id,v_voucher_no,'journal',b.bill_date,b.division_id,'Purchase bill posting: '||b.bill_no,b.bill_no,'posted',b.total_amount,b.total_amount,b.created_by,b.approved_by,b.approved_at,u,now(),v_journal_id);

  insert into public.accounting_voucher_lines(voucher_id,line_no,ledger_account_id,division_id,debit_amount,credit_amount,line_memo)
  values(v_voucher_id,v_line,b.expense_account_id,b.division_id,v_expense,0,'Expense / purchase value');
  v_line := v_line + 1;
  if v_tax > 0 then
    insert into public.accounting_voucher_lines(voucher_id,line_no,ledger_account_id,division_id,debit_amount,credit_amount,line_memo)
    values(v_voucher_id,v_line,b.input_tax_account_id,b.division_id,v_tax,0,'Input GST');
    v_line := v_line + 1;
  end if;
  insert into public.accounting_voucher_lines(voucher_id,line_no,ledger_account_id,division_id,debit_amount,credit_amount,line_memo)
  values(v_voucher_id,v_line,b.payable_account_id,b.division_id,0,v_vendor_payable,'Vendor payable after TDS');
  v_line := v_line + 1;
  if v_tds > 0 then
    insert into public.accounting_voucher_lines(voucher_id,line_no,ledger_account_id,division_id,debit_amount,credit_amount,line_memo)
    values(v_voucher_id,v_line,b.tds_payable_account_id,b.division_id,0,v_tds,'TDS payable deducted from vendor bill');
  end if;

  insert into public.journal_entries(id,journal_no,posting_sequence,accounting_period_id,fiscal_year_id,financial_document_id,entry_date,source_module,source_document_id,source_document_family,division_id,status,created_by,posted_by,posted_at)
  values(v_journal_id,v_voucher_no,v_posting_no,v_period_id,v_fy_id,v_doc_id,b.bill_date,'central_accounts',b.id,'PURCHASE_BILL',b.division_id,'posted',b.created_by,u,now());
  insert into public.journal_lines(journal_entry_id,line_no,ledger_account_id,division_id,debit_amount,credit_amount,line_memo)
  select v_journal_id,line_no,ledger_account_id,division_id,debit_amount,credit_amount,line_memo from public.accounting_voucher_lines where voucher_id=v_voucher_id order by line_no;

  insert into public.payable_open_items(financial_document_id,division_id,due_date,original_amount,open_amount,status)
  values(v_doc_id,b.division_id,b.due_date,v_vendor_payable,least(coalesce(b.open_amount,v_vendor_payable),v_vendor_payable),'open')
  on conflict(financial_document_id) do update set due_date=excluded.due_date,original_amount=excluded.original_amount,open_amount=excluded.open_amount,updated_at=now();
  insert into public.document_postings(financial_document_id,posting_sequence,posting_status,accounting_period_id,journal_entry_id,posted_by,posted_at)
  values(v_doc_id,v_posting_no,'posted',v_period_id,v_journal_id,u,now())
  on conflict(posting_sequence) do nothing;

  update public.financial_documents set status='posted',posted_by=u,posted_at=now(),updated_at=now() where id=v_doc_id;
  update public.purchase_bills set status='posted',voucher_id=v_voucher_id,posted_by=u,posted_at=now(),open_amount=v_vendor_payable,updated_at=now() where id=b.id;
  insert into public.accounting_control_evidence(control_code,control_area,entity_table,entity_id,maker_app_user_id,checker_app_user_id,maker_action,checker_action,evidence_payload,evidence_status)
  values('CA-AP-BILL-POSTING','Accounts Payable','purchase_bills',b.id,b.created_by,u,'approved','posted',jsonb_build_object('bill_no',b.bill_no,'voucher_id',v_voucher_id,'journal_entry_id',v_journal_id,'posting_sequence',v_posting_no,'vendor_payable',v_vendor_payable,'tds_amount',v_tds),'reviewed');
  return v_journal_id;
end;
$$;

grant execute on function public.approve_purchase_bill(uuid) to authenticated;
grant execute on function public.post_purchase_bill(uuid) to authenticated;
