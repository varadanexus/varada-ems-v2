create or replace function public.execute_central_accounts_interiors_posting(p_financial_document_id uuid)
 returns table(result_financial_document_id uuid, result_posting_id uuid, result_posting_sequence text, result_journal_entry_id uuid, result_posting_status text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_fd record;
  v_fd_document_family text := 'INTERIOR_BILL';
  v_fd_source_document_id uuid;
  v_posting_id uuid;
  v_posting_sequence text;
  v_period_id uuid;
  v_fiscal_year_id uuid;
  v_journal_id uuid;
  v_actor_app_user_id uuid := public.current_app_user_id();
  v_queue_id uuid;
  v_ar_account_id uuid;
  v_revenue_account_id uuid;
begin
  if p_financial_document_id is null then
    raise exception 'financial_document_id is required';
  end if;

  if not (public.has_permission('central-accounts-posting-queue', 'post') or public.can_emergency_post_central_accounts()) then
    raise exception 'Not authorized to execute Central Accounts posting';
  end if;

  select * into v_fd
  from public.financial_documents fd
  where fd.id = p_financial_document_id
    and fd.source_module = 'interiors'
    and fd.source_table = 'interior_billing_headers'
    and fd.document_family = 'INTERIOR_BILL';

  if v_fd.id is null then
    raise exception 'Interiors financial document not found';
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
    set queue_status = 'failed', last_error = 'No open accounting period found', processed_by = v_actor_app_user_id, processed_at = now(), updated_at = now()
    where id = v_queue_id;
    perform public.log_central_accounts_audit_event('interior_bill_post_failed', v_fd.document_family, v_fd.source_document_id::text, v_fd.id, null, v_queue_id, null, v_actor_app_user_id, jsonb_build_object('error','No open accounting period found'));
    raise exception 'No open accounting period found';
  end if;

  select ap.fiscal_year_id into v_fiscal_year_id
  from public.accounting_periods ap
  where ap.id = v_period_id;

  update public.posting_queue
  set queue_status = 'processing', queue_attempt = queue_attempt + 1, processed_by = v_actor_app_user_id, processed_at = now(), updated_at = now(), last_error = null
  where id = v_queue_id;

  v_posting_sequence := public.generate_central_accounts_posting_sequence(coalesce(v_fd.effective_date, v_fd.document_date));

  insert into public.document_postings (financial_document_id, posting_sequence, posting_status, accounting_period_id, posted_by, posted_at)
  values (v_fd.id, v_posting_sequence, 'processing', v_period_id, v_actor_app_user_id, now())
  returning id into v_posting_id;

  insert into public.journal_entries (
    journal_no, posting_sequence, accounting_period_id, fiscal_year_id, financial_document_id,
    entry_date, source_module, source_document_id, source_document_family, division_id,
    status, created_by, posted_by, posted_at
  ) values (
    v_posting_sequence, v_posting_sequence, v_period_id, v_fiscal_year_id, v_fd.id,
    coalesce(v_fd.effective_date, v_fd.document_date), 'interiors', v_fd.source_document_id, v_fd.document_family, v_fd.division_id,
    'posted', v_actor_app_user_id, v_actor_app_user_id, now()
  ) returning id into v_journal_id;

  select id into v_ar_account_id from public.coa_accounts where code = '1310' limit 1;
  select id into v_revenue_account_id from public.coa_accounts where code = '4110' limit 1;

  if v_ar_account_id is null or v_revenue_account_id is null then
    raise exception 'Required Interiors posting accounts not found';
  end if;

  insert into public.journal_lines (journal_entry_id, line_no, ledger_account_id, division_id, counterparty_dimension_id, project_dimension_id, profit_center_dimension_id, debit_amount, credit_amount, line_memo)
  values
    (v_journal_id, 1, v_ar_account_id, v_fd.division_id, v_fd.counterparty_dimension_id, v_fd.project_dimension_id, v_fd.profit_center_dimension_id, v_fd.gross_amount, 0, 'Interior bill receivable'),
    (v_journal_id, 2, v_revenue_account_id, v_fd.division_id, v_fd.counterparty_dimension_id, v_fd.project_dimension_id, v_fd.profit_center_dimension_id, 0, v_fd.gross_amount, 'Interior bill revenue');

  insert into public.receivable_open_items (financial_document_id, division_id, counterparty_dimension_id, due_date, original_amount, open_amount, status)
  values (v_fd.id, v_fd.division_id, v_fd.counterparty_dimension_id, v_fd.document_date, v_fd.gross_amount, v_fd.gross_amount, 'open')
  on conflict (financial_document_id) do update
  set original_amount = excluded.original_amount,
      open_amount = excluded.open_amount,
      due_date = excluded.due_date,
      status = excluded.status,
      updated_at = now();

  update public.document_postings
  set posting_status = 'posted', journal_entry_id = v_journal_id, posted_by = v_actor_app_user_id, posted_at = now(), updated_at = now()
  where id = v_posting_id;

  update public.posting_queue
  set queue_status = 'posted', processed_by = v_actor_app_user_id, processed_at = now(), updated_at = now(), last_error = null
  where id = v_queue_id;

  update public.financial_documents
  set status = 'posted', posted_by = v_actor_app_user_id, posted_at = now(), updated_at = now()
  where id = v_fd.id;

  perform public.log_central_accounts_audit_event(
    'interior_bill_posted',
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
      'source_bill_number', v_fd.source_document_no,
      'posting_sequence', v_posting_sequence,
      'amount', v_fd.gross_amount
    )
  );

  return query select v_fd.id, v_posting_id, v_posting_sequence, v_journal_id, 'posted'::text;
exception when others then
  if v_queue_id is not null then
    update public.posting_queue set queue_status = 'failed', processed_by = v_actor_app_user_id, processed_at = now(), updated_at = now(), last_error = sqlerrm where id = v_queue_id;
  end if;
  if v_posting_id is not null then
    update public.document_postings set posting_status = 'failed', failure_reason = sqlerrm, failed_at = now(), updated_at = now() where id = v_posting_id;
  end if;
  perform public.log_central_accounts_audit_event(
    'interior_bill_post_failed',
    coalesce(v_fd_document_family, 'INTERIOR_BILL'),
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
$function$;