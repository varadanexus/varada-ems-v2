-- Sprint 9C.6B Stabilization: Approval != Posting
-- Refactor Transportation -> Central Accounts integration into two stages.
-- Stage 1: Transportation bridge creates staging records only.
-- Stage 2: Central Accounts posting execution creates final accounting impact.

create or replace function public.bridge_transport_document_to_central_accounts(
  p_document_family text,
  p_source_table text,
  p_source_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_financial_document_id uuid;
  v_division_id uuid;
  v_document_date date;
  v_effective_date date;
  v_source_no text;
  v_status text;
  v_counterparty_id uuid;
  v_counterparty_name text;
  v_counterparty_dimension_id uuid;
  v_project_dimension_id uuid;
  v_profit_center_dimension_id uuid;
  v_gross numeric(14,2) := 0;
  v_taxable numeric(14,2) := 0;
  v_tax numeric(14,2) := 0;
  v_net numeric(14,2) := 0;
  v_actor_app_user_id uuid := public.current_app_user_id();
  v_queue_id uuid;
  v_should_stage boolean := false;
begin
  if p_document_family is null or p_source_table is null or p_source_id is null then
    raise exception 'document_family, source_table, and source_id are required';
  end if;

  if p_document_family = 'CLIENT_BILL' and p_source_table = 'transport_client_bills' then
    select b.division_id,
           b.bill_date,
           b.bill_date,
           b.bill_no,
           b.status,
           b.transport_client_id,
           coalesce(tc.company_name, tc.name),
           round(coalesce(b.gross_total, 0)::numeric, 2),
           round(coalesce(b.taxable_value, 0)::numeric, 2),
           round(coalesce(b.gst_amount, 0)::numeric, 2),
           round(coalesce(b.net_receivable, 0)::numeric, 2)
    into v_division_id, v_document_date, v_effective_date, v_source_no, v_status, v_counterparty_id,
         v_counterparty_name, v_gross, v_taxable, v_tax, v_net
    from public.transport_client_bills b
    join public.transport_clients tc on tc.id = b.transport_client_id
    where b.id = p_source_id and b.deleted_at is null;
    v_should_stage := (v_status = 'approved');
  elsif p_document_family = 'GST_INVOICE' and p_source_table = 'transport_gst_invoices' then
    select i.division_id,
           i.invoice_date,
           i.invoice_date,
           i.invoice_no,
           i.status,
           i.transport_client_id,
           coalesce(tc.company_name, tc.name),
           round(coalesce(i.invoice_total, 0)::numeric, 2),
           round(coalesce(i.taxable_value, 0)::numeric, 2),
           round(coalesce(i.gst_amount, 0)::numeric, 2),
           round(coalesce(i.gst_amount, 0)::numeric, 2)
    into v_division_id, v_document_date, v_effective_date, v_source_no, v_status, v_counterparty_id,
         v_counterparty_name, v_gross, v_taxable, v_tax, v_net
    from public.transport_gst_invoices i
    join public.transport_clients tc on tc.id = i.transport_client_id
    where i.id = p_source_id and i.deleted_at is null;
    v_should_stage := (v_status = 'approved');
  elsif p_document_family = 'CREDIT_NOTE' and p_source_table = 'transport_client_credit_notes' then
    select n.division_id,
           n.credit_note_date,
           n.credit_note_date,
           n.credit_note_no,
           n.status,
           n.transport_client_id,
           coalesce(tc.company_name, tc.name),
           round(coalesce(n.credit_note_amount, 0)::numeric, 2),
           0::numeric(14,2),
           0::numeric(14,2),
           round(coalesce(n.credit_note_amount, 0)::numeric, 2)
    into v_division_id, v_document_date, v_effective_date, v_source_no, v_status, v_counterparty_id,
         v_counterparty_name, v_gross, v_taxable, v_tax, v_net
    from public.transport_client_credit_notes n
    join public.transport_clients tc on tc.id = n.transport_client_id
    where n.id = p_source_id and n.deleted_at is null;
    v_should_stage := (v_status = 'approved');
  elsif p_document_family = 'CLIENT_RECEIPT' and p_source_table = 'transport_client_receipts' then
    select r.division_id,
           r.receipt_date,
           r.receipt_date,
           r.receipt_no,
           r.status,
           r.transport_client_id,
           coalesce(tc.company_name, tc.name),
           round(coalesce(r.amount_received, 0)::numeric, 2),
           0::numeric(14,2),
           0::numeric(14,2),
           round(coalesce(r.amount_received, 0)::numeric, 2)
    into v_division_id, v_document_date, v_effective_date, v_source_no, v_status, v_counterparty_id,
         v_counterparty_name, v_gross, v_taxable, v_tax, v_net
    from public.transport_client_receipts r
    join public.transport_clients tc on tc.id = r.transport_client_id
    where r.id = p_source_id and r.deleted_at is null;
    v_should_stage := (v_status = 'confirmed');
  elsif p_document_family = 'TRANSPORTER_STATEMENT' and p_source_table = 'transport_transporter_statements' then
    select s.division_id,
           s.statement_date,
           s.statement_date,
           s.statement_no,
           s.status,
           s.transport_transporter_id,
           tt.name,
           round(coalesce(s.gross_payable_total, 0)::numeric, 2),
           0::numeric(14,2),
           0::numeric(14,2),
           round(coalesce(s.net_payable_total, 0)::numeric, 2)
    into v_division_id, v_document_date, v_effective_date, v_source_no, v_status, v_counterparty_id,
         v_counterparty_name, v_gross, v_taxable, v_tax, v_net
    from public.transport_transporter_statements s
    join public.transport_transporters tt on tt.id = s.transport_transporter_id
    where s.id = p_source_id and s.deleted_at is null;
    v_should_stage := (v_status = 'approved');
  elsif p_document_family = 'TRANSPORTER_PAYMENT' and p_source_table = 'transport_transporter_payments' then
    select p.division_id,
           p.payment_date,
           p.payment_date,
           p.payment_no,
           p.status,
           p.transport_transporter_id,
           tt.name,
           round(coalesce(p.amount_paid, 0)::numeric, 2),
           0::numeric(14,2),
           0::numeric(14,2),
           round(coalesce(p.amount_paid, 0)::numeric, 2)
    into v_division_id, v_document_date, v_effective_date, v_source_no, v_status, v_counterparty_id,
         v_counterparty_name, v_gross, v_taxable, v_tax, v_net
    from public.transport_transporter_payments p
    join public.transport_transporters tt on tt.id = p.transport_transporter_id
    where p.id = p_source_id and p.deleted_at is null;
    v_should_stage := (v_status = 'confirmed');
  else
    raise exception 'Unsupported bridge mapping: % / %', p_document_family, p_source_table;
  end if;

  if v_division_id is null or not v_should_stage then
    return null;
  end if;

  v_counterparty_dimension_id := public.ensure_reporting_dimension(
    'counterparty',
    case when p_document_family in ('TRANSPORTER_STATEMENT', 'TRANSPORTER_PAYMENT') then 'TRANSPORTER:' || v_counterparty_id::text else 'CLIENT:' || v_counterparty_id::text end,
    coalesce(v_counterparty_name, 'Unknown Counterparty')
  );
  select id into v_project_dimension_id from public.reporting_dimensions where dimension_type = 'project' and code = 'UNASSIGNED' limit 1;
  select id into v_profit_center_dimension_id from public.reporting_dimensions where dimension_type = 'profit_center' and code = 'TRANSPORT_CORE' limit 1;

  insert into public.financial_documents (
    document_family,
    source_module,
    source_table,
    source_document_id,
    source_document_no,
    division_id,
    counterparty_dimension_id,
    project_dimension_id,
    profit_center_dimension_id,
    status,
    document_date,
    effective_date,
    gross_amount,
    taxable_amount,
    tax_amount,
    net_amount,
    finance_approved_by,
    finance_approved_at
  )
  values (
    p_document_family,
    'transportation',
    p_source_table,
    p_source_id,
    v_source_no,
    v_division_id,
    v_counterparty_dimension_id,
    v_project_dimension_id,
    v_profit_center_dimension_id,
    'ready_for_posting',
    v_document_date,
    coalesce(v_effective_date, v_document_date),
    v_gross,
    v_taxable,
    v_tax,
    v_net,
    v_actor_app_user_id,
    now()
  )
  on conflict (source_module, source_table, source_document_id, document_family)
  do update set
    source_document_no = excluded.source_document_no,
    division_id = excluded.division_id,
    counterparty_dimension_id = excluded.counterparty_dimension_id,
    project_dimension_id = excluded.project_dimension_id,
    profit_center_dimension_id = excluded.profit_center_dimension_id,
    status = case when public.financial_documents.status = 'posted' then public.financial_documents.status else 'ready_for_posting' end,
    document_date = excluded.document_date,
    effective_date = excluded.effective_date,
    gross_amount = excluded.gross_amount,
    taxable_amount = excluded.taxable_amount,
    tax_amount = excluded.tax_amount,
    net_amount = excluded.net_amount,
    finance_approved_by = excluded.finance_approved_by,
    finance_approved_at = excluded.finance_approved_at,
    updated_at = now()
  returning id into v_financial_document_id;

  insert into public.posting_queue (
    financial_document_id,
    queue_status,
    requested_by,
    processed_by,
    processed_at,
    last_error
  )
  values (
    v_financial_document_id,
    'ready_to_post',
    v_actor_app_user_id,
    null,
    null,
    null
  )
  on conflict (financial_document_id)
  do update set
    queue_status = case when public.posting_queue.queue_status = 'posted' then public.posting_queue.queue_status else 'ready_to_post' end,
    requested_by = excluded.requested_by,
    updated_at = now(),
    last_error = null
  returning id into v_queue_id;

  perform public.log_central_accounts_audit_event(
    'transport_bridge_staged',
    p_document_family,
    p_source_id::text,
    v_financial_document_id,
    null,
    v_queue_id,
    null,
    v_actor_app_user_id,
    jsonb_build_object(
      'source_module', 'transportation',
      'source_table', p_source_table,
      'source_no', v_source_no,
      'stage', 'ready_for_posting'
    )
  );

  return v_financial_document_id;
exception when others then
  perform public.log_central_accounts_audit_event(
    'transport_bridge_failed',
    coalesce(p_document_family, 'UNKNOWN'),
    coalesce(p_source_id::text, 'UNKNOWN'),
    v_financial_document_id,
    null,
    v_queue_id,
    null,
    v_actor_app_user_id,
    jsonb_build_object(
      'source_module', 'transportation',
      'source_table', p_source_table,
      'source_no', v_source_no,
      'error', sqlerrm
    )
  );
  return v_financial_document_id;
end;
$$;

create or replace function public.execute_central_accounts_transport_posting(
  p_financial_document_id uuid
)
returns table (
  financial_document_id uuid,
  posting_id uuid,
  posting_sequence text,
  journal_entry_id uuid,
  posting_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fd record;
  v_fd_document_family text := 'UNKNOWN';
  v_fd_source_document_id uuid;
  v_posting_id uuid;
  v_posting_sequence text;
  v_period_id uuid;
  v_fiscal_year_id uuid;
  v_journal_id uuid;
  v_actor_app_user_id uuid := public.current_app_user_id();
  v_queue_id uuid;
  v_cash_account_id uuid;
  v_bank_account_id uuid;
  v_ar_account_id uuid;
  v_ap_account_id uuid;
  v_tax_account_id uuid;
  v_revenue_account_id uuid;
  v_cost_account_id uuid;
  v_open_item_id uuid;
  v_related_source_id uuid;
  v_payment_mode text;
begin
  if p_financial_document_id is null then
    raise exception 'financial_document_id is required';
  end if;

  if not (
    public.has_permission('central-accounts-posting-queue', 'post')
    or public.can_emergency_post_central_accounts()
  ) then
    raise exception 'Not authorized to execute Central Accounts posting';
  end if;

  select *
  into v_fd
  from public.financial_documents fd
  where fd.id = p_financial_document_id
    and fd.source_module = 'transportation';

  if v_fd.id is null then
    raise exception 'Transportation financial document not found';
  end if;

  v_fd_document_family := v_fd.document_family;
  v_fd_source_document_id := v_fd.source_document_id;

  if exists (
    select 1 from public.document_postings dp
    where dp.financial_document_id = v_fd.id and dp.posting_status = 'posted'
  ) then
    raise exception 'Financial document already posted';
  end if;

  select pq.id into v_queue_id from public.posting_queue pq where pq.financial_document_id = v_fd.id limit 1;
  if v_queue_id is null then
    raise exception 'Posting queue record not found';
  end if;

  v_period_id := public.get_central_accounts_period_id(coalesce(v_fd.effective_date, v_fd.document_date));
  if v_period_id is null then
    update public.posting_queue set queue_status = 'failed', last_error = 'No open accounting period found', processed_by = v_actor_app_user_id, processed_at = now(), updated_at = now() where id = v_queue_id;
    perform public.log_central_accounts_audit_event('transport_post_failed', v_fd.document_family, v_fd.source_document_id::text, v_fd.id, null, v_queue_id, null, v_actor_app_user_id, jsonb_build_object('error','No open accounting period found'));
    raise exception 'No open accounting period found';
  end if;

  select ap.fiscal_year_id into v_fiscal_year_id from public.accounting_periods ap where ap.id = v_period_id;

  update public.posting_queue
  set queue_status = 'processing',
      queue_attempt = queue_attempt + 1,
      processed_by = v_actor_app_user_id,
      processed_at = now(),
      updated_at = now(),
      last_error = null
  where id = v_queue_id;

  v_posting_sequence := public.generate_central_accounts_posting_sequence(coalesce(v_fd.effective_date, v_fd.document_date));

  insert into public.document_postings (
    financial_document_id,
    posting_sequence,
    posting_status,
    accounting_period_id,
    posted_by,
    posted_at
  ) values (
    v_fd.id,
    v_posting_sequence,
    'processing',
    v_period_id,
    v_actor_app_user_id,
    now()
  ) returning id into v_posting_id;

  insert into public.journal_entries (
    journal_no,
    posting_sequence,
    accounting_period_id,
    fiscal_year_id,
    financial_document_id,
    entry_date,
    source_module,
    source_document_id,
    source_document_family,
    division_id,
    status,
    created_by,
    posted_by,
    posted_at
  ) values (
    v_posting_sequence,
    v_posting_sequence,
    v_period_id,
    v_fiscal_year_id,
    v_fd.id,
    coalesce(v_fd.effective_date, v_fd.document_date),
    'transportation',
    v_fd.source_document_id,
    v_fd.document_family,
    v_fd.division_id,
    'posted',
    v_actor_app_user_id,
    v_actor_app_user_id,
    now()
  ) returning id into v_journal_id;

  select id into v_ar_account_id from public.coa_accounts where code = '1300' limit 1;
  select id into v_ap_account_id from public.coa_accounts where code = '2100' limit 1;
  select id into v_tax_account_id from public.coa_accounts where code = '2200' limit 1;
  select id into v_revenue_account_id from public.coa_accounts where code = '4100' limit 1;
  select id into v_cost_account_id from public.coa_accounts where code = '5100' limit 1;
  select id into v_cash_account_id from public.coa_accounts where code = '1000' limit 1;
  select id into v_bank_account_id from public.coa_accounts where code = '1100' limit 1;

  if v_fd.document_family = 'CLIENT_BILL' then
    insert into public.journal_lines (journal_entry_id, line_no, ledger_account_id, division_id, counterparty_dimension_id, project_dimension_id, profit_center_dimension_id, debit_amount, credit_amount, line_memo)
    values
      (v_journal_id, 1, v_ar_account_id, v_fd.division_id, v_fd.counterparty_dimension_id, v_fd.project_dimension_id, v_fd.profit_center_dimension_id, v_fd.net_amount, 0, 'Transportation client bill receivable'),
      (v_journal_id, 2, v_revenue_account_id, v_fd.division_id, v_fd.counterparty_dimension_id, v_fd.project_dimension_id, v_fd.profit_center_dimension_id, 0, v_fd.net_amount, 'Transportation client bill revenue');

    insert into public.receivable_open_items (financial_document_id, division_id, counterparty_dimension_id, due_date, original_amount, open_amount, status)
    values (v_fd.id, v_fd.division_id, v_fd.counterparty_dimension_id, v_fd.document_date, v_fd.net_amount, v_fd.net_amount, 'open')
    on conflict (financial_document_id) do update
    set original_amount = excluded.original_amount,
        open_amount = excluded.open_amount,
        due_date = excluded.due_date,
        status = excluded.status,
        updated_at = now();

  elsif v_fd.document_family = 'GST_INVOICE' then
    insert into public.journal_lines (journal_entry_id, line_no, ledger_account_id, division_id, counterparty_dimension_id, project_dimension_id, profit_center_dimension_id, debit_amount, credit_amount, line_memo)
    values
      (v_journal_id, 1, v_ar_account_id, v_fd.division_id, v_fd.counterparty_dimension_id, v_fd.project_dimension_id, v_fd.profit_center_dimension_id, v_fd.tax_amount, 0, 'Transportation GST invoice receivable'),
      (v_journal_id, 2, v_tax_account_id, v_fd.division_id, v_fd.counterparty_dimension_id, v_fd.project_dimension_id, v_fd.profit_center_dimension_id, 0, v_fd.tax_amount, 'Transportation GST output');

  elsif v_fd.document_family = 'CREDIT_NOTE' then
    select client_bill_id into v_related_source_id from public.transport_client_credit_notes where id = v_fd.source_document_id;

    insert into public.journal_lines (journal_entry_id, line_no, ledger_account_id, division_id, counterparty_dimension_id, project_dimension_id, profit_center_dimension_id, debit_amount, credit_amount, line_memo)
    values
      (v_journal_id, 1, v_revenue_account_id, v_fd.division_id, v_fd.counterparty_dimension_id, v_fd.project_dimension_id, v_fd.profit_center_dimension_id, v_fd.net_amount, 0, 'Transportation credit note revenue reversal'),
      (v_journal_id, 2, v_ar_account_id, v_fd.division_id, v_fd.counterparty_dimension_id, v_fd.project_dimension_id, v_fd.profit_center_dimension_id, 0, v_fd.net_amount, 'Transportation credit note receivable reversal');

    if v_related_source_id is not null then
      select roi.id into v_open_item_id
      from public.receivable_open_items roi
      join public.financial_documents fd on fd.id = roi.financial_document_id
      where fd.source_module = 'transportation'
        and fd.source_table = 'transport_client_bills'
        and fd.source_document_id = v_related_source_id
        and fd.document_family = 'CLIENT_BILL'
      limit 1;

      if v_open_item_id is not null then
        insert into public.receivable_allocations (receivable_item_id, applied_document_id, allocation_date, amount, status)
        values (v_open_item_id, v_fd.id, coalesce(v_fd.effective_date, v_fd.document_date), v_fd.net_amount, 'posted');

        update public.receivable_open_items
        set open_amount = greatest(open_amount - v_fd.net_amount, 0),
            status = case when greatest(open_amount - v_fd.net_amount, 0) = 0 then 'settled' when open_amount - v_fd.net_amount < open_amount then 'partially_settled' else status end,
            updated_at = now()
        where id = v_open_item_id;
      end if;
    end if;

  elsif v_fd.document_family = 'CLIENT_RECEIPT' then
    select client_bill_id, payment_mode into v_related_source_id, v_payment_mode from public.transport_client_receipts where id = v_fd.source_document_id;

    insert into public.journal_lines (journal_entry_id, line_no, ledger_account_id, division_id, counterparty_dimension_id, project_dimension_id, profit_center_dimension_id, debit_amount, credit_amount, line_memo)
    values
      (v_journal_id, 1, case when v_payment_mode = 'Cash' then v_cash_account_id else v_bank_account_id end, v_fd.division_id, v_fd.counterparty_dimension_id, v_fd.project_dimension_id, v_fd.profit_center_dimension_id, v_fd.net_amount, 0, 'Transportation client receipt treasury'),
      (v_journal_id, 2, v_ar_account_id, v_fd.division_id, v_fd.counterparty_dimension_id, v_fd.project_dimension_id, v_fd.profit_center_dimension_id, 0, v_fd.net_amount, 'Transportation client receipt receivable settlement');

    if v_related_source_id is not null then
      select roi.id into v_open_item_id
      from public.receivable_open_items roi
      join public.financial_documents fd on fd.id = roi.financial_document_id
      where fd.source_module = 'transportation'
        and fd.source_table = 'transport_client_bills'
        and fd.source_document_id = v_related_source_id
        and fd.document_family = 'CLIENT_BILL'
      limit 1;

      if v_open_item_id is not null then
        insert into public.receivable_allocations (receivable_item_id, applied_document_id, allocation_date, amount, status)
        values (v_open_item_id, v_fd.id, coalesce(v_fd.effective_date, v_fd.document_date), v_fd.net_amount, 'posted');

        update public.receivable_open_items
        set open_amount = greatest(open_amount - v_fd.net_amount, 0),
            status = case when greatest(open_amount - v_fd.net_amount, 0) = 0 then 'settled' when open_amount - v_fd.net_amount < open_amount then 'partially_settled' else status end,
            updated_at = now()
        where id = v_open_item_id;
      end if;
    end if;

  elsif v_fd.document_family = 'TRANSPORTER_STATEMENT' then
    insert into public.journal_lines (journal_entry_id, line_no, ledger_account_id, division_id, counterparty_dimension_id, project_dimension_id, profit_center_dimension_id, debit_amount, credit_amount, line_memo)
    values
      (v_journal_id, 1, v_cost_account_id, v_fd.division_id, v_fd.counterparty_dimension_id, v_fd.project_dimension_id, v_fd.profit_center_dimension_id, v_fd.net_amount, 0, 'Transportation transporter cost'),
      (v_journal_id, 2, v_ap_account_id, v_fd.division_id, v_fd.counterparty_dimension_id, v_fd.project_dimension_id, v_fd.profit_center_dimension_id, 0, v_fd.net_amount, 'Transportation transporter payable');

    insert into public.payable_open_items (financial_document_id, division_id, counterparty_dimension_id, due_date, original_amount, open_amount, status)
    values (v_fd.id, v_fd.division_id, v_fd.counterparty_dimension_id, v_fd.document_date, v_fd.net_amount, v_fd.net_amount, 'open')
    on conflict (financial_document_id) do update
    set original_amount = excluded.original_amount,
        open_amount = excluded.open_amount,
        due_date = excluded.due_date,
        status = excluded.status,
        updated_at = now();

  elsif v_fd.document_family = 'TRANSPORTER_PAYMENT' then
    select transporter_statement_id, payment_mode into v_related_source_id, v_payment_mode from public.transport_transporter_payments where id = v_fd.source_document_id;

    insert into public.journal_lines (journal_entry_id, line_no, ledger_account_id, division_id, counterparty_dimension_id, project_dimension_id, profit_center_dimension_id, debit_amount, credit_amount, line_memo)
    values
      (v_journal_id, 1, v_ap_account_id, v_fd.division_id, v_fd.counterparty_dimension_id, v_fd.project_dimension_id, v_fd.profit_center_dimension_id, v_fd.net_amount, 0, 'Transportation transporter payment payable settlement'),
      (v_journal_id, 2, case when v_payment_mode = 'Cash' then v_cash_account_id else v_bank_account_id end, v_fd.division_id, v_fd.counterparty_dimension_id, v_fd.project_dimension_id, v_fd.profit_center_dimension_id, 0, v_fd.net_amount, 'Transportation transporter payment treasury');

    if v_related_source_id is not null then
      select poi.id into v_open_item_id
      from public.payable_open_items poi
      join public.financial_documents fd on fd.id = poi.financial_document_id
      where fd.source_module = 'transportation'
        and fd.source_table = 'transport_transporter_statements'
        and fd.source_document_id = v_related_source_id
        and fd.document_family = 'TRANSPORTER_STATEMENT'
      limit 1;

      if v_open_item_id is not null then
        insert into public.payable_allocations (payable_item_id, applied_document_id, allocation_date, amount, status)
        values (v_open_item_id, v_fd.id, coalesce(v_fd.effective_date, v_fd.document_date), v_fd.net_amount, 'posted');

        update public.payable_open_items
        set open_amount = greatest(open_amount - v_fd.net_amount, 0),
            status = case when greatest(open_amount - v_fd.net_amount, 0) = 0 then 'settled' when open_amount - v_fd.net_amount < open_amount then 'partially_settled' else status end,
            updated_at = now()
        where id = v_open_item_id;
      end if;
    end if;
  end if;

  update public.document_postings
  set posting_status = 'posted',
      journal_entry_id = v_journal_id,
      posted_by = v_actor_app_user_id,
      posted_at = now(),
      updated_at = now()
  where id = v_posting_id;

  update public.posting_queue
  set queue_status = 'posted',
      processed_by = v_actor_app_user_id,
      processed_at = now(),
      updated_at = now(),
      last_error = null
  where id = v_queue_id;

  update public.financial_documents
  set status = 'posted',
      posted_by = v_actor_app_user_id,
      posted_at = now(),
      updated_at = now()
  where id = v_fd.id;

  perform public.log_central_accounts_audit_event(
    'transport_posted',
    v_fd.document_family,
    v_fd.source_document_id::text,
    v_fd.id,
    v_journal_id,
    v_queue_id,
    v_period_id,
    v_actor_app_user_id,
    jsonb_build_object(
      'source_module', v_fd.source_module,
      'source_table', v_fd.source_table,
      'source_no', v_fd.source_document_no,
      'posting_sequence', v_posting_sequence
    )
  );

  return query
  select v_fd.id, v_posting_id, v_posting_sequence, v_journal_id, 'posted'::text;
exception when others then
  if v_queue_id is not null then
    update public.posting_queue
    set queue_status = 'failed',
        processed_by = v_actor_app_user_id,
        processed_at = now(),
        updated_at = now(),
        last_error = sqlerrm
    where id = v_queue_id;
  end if;

  if v_posting_id is not null then
    update public.document_postings
    set posting_status = 'failed',
        failure_reason = sqlerrm,
        failed_at = now(),
        updated_at = now()
    where id = v_posting_id;
  end if;

  perform public.log_central_accounts_audit_event(
    'transport_post_failed',
    coalesce(v_fd_document_family, 'UNKNOWN'),
    coalesce(v_fd_source_document_id::text, p_financial_document_id::text),
    p_financial_document_id,
    v_journal_id,
    v_queue_id,
    v_period_id,
    v_actor_app_user_id,
    jsonb_build_object('error', sqlerrm)
  );

  raise;
end;
$$;

do $$
declare
  r record;
begin
  update public.central_accounts_audit_events cae
  set journal_entry_id = null,
      posting_queue_id = null
  from public.financial_documents fd
  where cae.financial_document_id = fd.id
    and fd.source_module = 'transportation';

  delete from public.receivable_allocations ra
  using public.financial_documents fd
  where ra.applied_document_id = fd.id
    and fd.source_module = 'transportation';

  delete from public.payable_allocations pa
  using public.financial_documents fd
  where pa.applied_document_id = fd.id
    and fd.source_module = 'transportation';

  delete from public.receivable_open_items roi
  using public.financial_documents fd
  where roi.financial_document_id = fd.id
    and fd.source_module = 'transportation';

  delete from public.payable_open_items poi
  using public.financial_documents fd
  where poi.financial_document_id = fd.id
    and fd.source_module = 'transportation';

  delete from public.journal_lines jl
  using public.journal_entries je
  join public.financial_documents fd on fd.id = je.financial_document_id
  where jl.journal_entry_id = je.id
    and fd.source_module = 'transportation';

  update public.document_postings dp
  set journal_entry_id = null,
      reversal_journal_entry_id = null
  from public.financial_documents fd
  where dp.financial_document_id = fd.id
    and fd.source_module = 'transportation';

  delete from public.journal_entries je
  using public.financial_documents fd
  where je.financial_document_id = fd.id
    and fd.source_module = 'transportation';

  delete from public.document_postings dp
  using public.financial_documents fd
  where dp.financial_document_id = fd.id
    and fd.source_module = 'transportation';

  update public.financial_documents
  set status = 'ready_for_posting',
      posted_by = null,
      posted_at = null,
      updated_at = now()
  where source_module = 'transportation';

  insert into public.posting_queue (financial_document_id, queue_status, requested_by)
  select fd.id, 'ready_to_post', public.current_app_user_id()
  from public.financial_documents fd
  where fd.source_module = 'transportation'
  on conflict (financial_document_id)
  do update set
    queue_status = 'ready_to_post',
    processed_by = null,
    processed_at = null,
    last_error = null,
    updated_at = now();

  for r in
    select fd.id, fd.document_family, fd.source_document_id
    from public.financial_documents fd
    where fd.source_module = 'transportation'
  loop
    perform public.log_central_accounts_audit_event(
      'transport_bridge_restaged',
      r.document_family,
      r.source_document_id::text,
      r.id,
      null,
      null,
      null,
      public.current_app_user_id(),
      jsonb_build_object('reason', 'approval_not_posting_stabilization')
    );
  end loop;
end $$;