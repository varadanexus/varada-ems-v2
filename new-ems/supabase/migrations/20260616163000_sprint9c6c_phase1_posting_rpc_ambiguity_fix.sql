-- Sprint 9C.6C Phase 1 stabilization
-- Fix ambiguous PL/pgSQL output-column variable collision in
-- execute_central_accounts_transport_posting(p_financial_document_id uuid)
-- No Transportation logic changes. No security weakening.

drop function if exists public.execute_central_accounts_transport_posting(uuid);

create or replace function public.execute_central_accounts_transport_posting(
  p_financial_document_id uuid
)
returns table (
  result_financial_document_id uuid,
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

  if not (public.has_permission('central-accounts-posting-queue', 'post') or public.can_emergency_post_central_accounts()) then
    raise exception 'Not authorized to execute Central Accounts posting';
  end if;

  select * into v_fd
  from public.financial_documents fd
  where fd.id = p_financial_document_id and fd.source_module = 'transportation';

  if v_fd.id is null then
    raise exception 'Transportation financial document not found';
  end if;

  v_fd_document_family := v_fd.document_family;
  v_fd_source_document_id := v_fd.source_document_id;

  if exists (
    select 1
    from public.document_postings dp
    where dp.financial_document_id = v_fd.id
      and dp.posting_status = 'posted'
  ) then
    raise exception 'Financial document already posted';
  end if;

  select pq.id into v_queue_id
  from public.posting_queue pq
  where pq.financial_document_id = v_fd.id
  limit 1;

  if v_queue_id is null then
    raise exception 'Posting queue record not found';
  end if;

  v_period_id := public.get_central_accounts_period_id(coalesce(v_fd.effective_date, v_fd.document_date));
  if v_period_id is null then
    update public.posting_queue
    set queue_status = 'failed',
        last_error = 'No open accounting period found',
        processed_by = v_actor_app_user_id,
        processed_at = now(),
        updated_at = now()
    where id = v_queue_id;

    perform public.log_central_accounts_audit_event(
      'transport_post_failed',
      v_fd.document_family,
      v_fd.source_document_id::text,
      v_fd.id,
      null,
      v_queue_id,
      null,
      v_actor_app_user_id,
      jsonb_build_object('error','No open accounting period found')
    );

    raise exception 'No open accounting period found';
  end if;

  select ap.fiscal_year_id into v_fiscal_year_id
  from public.accounting_periods ap
  where ap.id = v_period_id;

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
  )
  values (
    v_fd.id,
    v_posting_sequence,
    'processing',
    v_period_id,
    v_actor_app_user_id,
    now()
  )
  returning id into v_posting_id;

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
  )
  values (
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
  )
  returning id into v_journal_id;

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
            status = case
              when greatest(open_amount - v_fd.net_amount, 0) = 0 then 'settled'
              when open_amount - v_fd.net_amount < open_amount then 'partially_settled'
              else status
            end,
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
            status = case
              when greatest(open_amount - v_fd.net_amount, 0) = 0 then 'settled'
              when open_amount - v_fd.net_amount < open_amount then 'partially_settled'
              else status
            end,
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
            status = case
              when greatest(open_amount - v_fd.net_amount, 0) = 0 then 'settled'
              when open_amount - v_fd.net_amount < open_amount then 'partially_settled'
              else status
            end,
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
    jsonb_build_object('source_module',v_fd.source_module,'source_table',v_fd.source_table,'source_no',v_fd.source_document_no,'posting_sequence',v_posting_sequence)
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
    coalesce(v_fd_document_family,'UNKNOWN'),
    coalesce(v_fd_source_document_id::text, p_financial_document_id::text),
    p_financial_document_id,
    v_journal_id,
    v_queue_id,
    v_period_id,
    v_actor_app_user_id,
    jsonb_build_object('error',sqlerrm)
  );

  raise;
end;
$$;
