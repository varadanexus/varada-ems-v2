-- Sprint 9C.6B: Transportation to Central Accounts integration bridge
-- Additive integration only. Transportation remains source of truth.
-- Existing Transportation runtime behavior must remain unchanged even if bridge work fails.

alter table public.financial_documents add column if not exists source_table text;

create unique index if not exists uq_financial_documents_source_family
  on public.financial_documents(source_module, source_table, source_document_id, document_family);

create unique index if not exists uq_posting_queue_financial_document_id
  on public.posting_queue(financial_document_id);

create or replace function public.get_central_accounts_period_id(p_effective_date date)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select ap.id
  from public.accounting_periods ap
  where p_effective_date between ap.start_date and ap.end_date
    and ap.status in ('open', 'reopened')
  order by ap.start_date desc
  limit 1;
$$;

create or replace function public.ensure_reporting_dimension(
  p_dimension_type text,
  p_code text,
  p_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select rd.id
  into v_id
  from public.reporting_dimensions rd
  where rd.dimension_type = p_dimension_type
    and rd.code = p_code
  limit 1;

  if v_id is not null then
    return v_id;
  end if;

  insert into public.reporting_dimensions (dimension_type, code, name, is_active)
  values (p_dimension_type, p_code, p_name, true)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.log_central_accounts_audit_event(
  p_event_type text,
  p_entity_type text,
  p_entity_id text,
  p_financial_document_id uuid default null,
  p_journal_entry_id uuid default null,
  p_posting_queue_id uuid default null,
  p_accounting_period_id uuid default null,
  p_actor_app_user_id uuid default null,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.central_accounts_audit_events (
    event_type,
    entity_type,
    entity_id,
    financial_document_id,
    journal_entry_id,
    posting_queue_id,
    accounting_period_id,
    actor_app_user_id,
    details
  )
  values (
    p_event_type,
    p_entity_type,
    p_entity_id,
    p_financial_document_id,
    p_journal_entry_id,
    p_posting_queue_id,
    p_accounting_period_id,
    p_actor_app_user_id,
    coalesce(p_details, '{}'::jsonb)
  );
exception when others then
  null;
end;
$$;

create or replace function public.seed_central_accounts_transport_defaults()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fy_start date;
  v_fy_end date;
  v_fy_code text;
  v_fy_id uuid;
  v_month integer;
  v_period_start date;
  v_period_end date;
begin
  insert into public.coa_accounts (code, name, account_class, account_group, hierarchy_level, is_posting_allowed, is_control_account, is_active)
  select s.code, s.name, s.account_class, s.account_group, 4, true, s.is_control_account, true
  from (
    values
      ('1000', 'Central Cash on Hand', 'ASSET', 'CASH', false),
      ('1100', 'Central Bank Clearing', 'ASSET', 'BANK', false),
      ('1300', 'Trade Receivable Control', 'ASSET', 'RECEIVABLE_CONTROL', true),
      ('2100', 'Trade Payable Control', 'LIABILITY', 'PAYABLE_CONTROL', true),
      ('2200', 'GST Output Control', 'LIABILITY', 'TAX_CONTROL', false),
      ('4100', 'Transportation Revenue', 'INCOME', 'TRANSPORT_REVENUE', false),
      ('5100', 'Transportation Direct Cost', 'EXPENSE', 'TRANSPORT_COST', false)
  ) as s(code, name, account_class, account_group, is_control_account)
  where not exists (
    select 1 from public.coa_accounts a where a.code = s.code
  );

  insert into public.cash_accounts (code, name, ledger_account_id, is_active)
  select 'CENTRAL-CASH', 'Central Cash on Hand', a.id, true
  from public.coa_accounts a
  where a.code = '1000'
    and not exists (select 1 from public.cash_accounts c where c.code = 'CENTRAL-CASH');

  insert into public.bank_accounts (code, bank_name, account_title, masked_account_number, ifsc_code, ledger_account_id, is_active)
  select 'CENTRAL-BANK', 'Central Bank', 'Central Bank Clearing', 'XXXX0000', 'PENDING', a.id, true
  from public.coa_accounts a
  where a.code = '1100'
    and not exists (select 1 from public.bank_accounts b where b.code = 'CENTRAL-BANK');

  v_fy_start := make_date(
    case when extract(month from current_date) >= 4 then extract(year from current_date)::int else extract(year from current_date)::int - 1 end,
    4,
    1
  );
  v_fy_end := (v_fy_start + interval '1 year' - interval '1 day')::date;
  v_fy_code := to_char(v_fy_start, 'YYYY') || '-' || to_char(v_fy_end, 'YYYY');

  insert into public.fiscal_years (code, start_date, end_date, status, is_year_end_locked)
  values (v_fy_code, v_fy_start, v_fy_end, 'open', false)
  on conflict (code) do nothing;

  select fy.id into v_fy_id from public.fiscal_years fy where fy.code = v_fy_code limit 1;

  if v_fy_id is not null then
    for v_month in 0..11 loop
      v_period_start := (v_fy_start + make_interval(months => v_month))::date;
      v_period_end := ((v_period_start + interval '1 month') - interval '1 day')::date;

      insert into public.accounting_periods (
        fiscal_year_id,
        period_code,
        period_name,
        period_index,
        start_date,
        end_date,
        status
      )
      values (
        v_fy_id,
        to_char(v_period_start, 'YYYYMM'),
        to_char(v_period_start, 'Mon YYYY'),
        v_month + 1,
        v_period_start,
        v_period_end,
        'open'
      )
      on conflict (fiscal_year_id, period_code) do nothing;
    end loop;
  end if;

  perform public.ensure_reporting_dimension('division', 'TRANSPORT', 'Transportation');
  perform public.ensure_reporting_dimension('project', 'UNASSIGNED', 'Unassigned Project');
  perform public.ensure_reporting_dimension('profit_center', 'TRANSPORT_CORE', 'Transportation Core');
  perform public.ensure_reporting_dimension('counterparty', 'UNASSIGNED', 'Unassigned Counterparty');
end;
$$;

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
  v_existing_posted boolean := false;
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
  v_posting_sequence text;
  v_period_id uuid;
  v_fiscal_year_id uuid;
  v_posting_id uuid;
  v_queue_id uuid;
  v_journal_id uuid;
  v_actor_app_user_id uuid := public.current_app_user_id();
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
  if p_document_family is null or p_source_table is null or p_source_id is null then
    raise exception 'document_family, source_table, and source_id are required';
  end if;

  select fd.id,
         exists (
           select 1
           from public.document_postings dp
           where dp.financial_document_id = fd.id
             and dp.posting_status = 'posted'
         )
  into v_financial_document_id, v_existing_posted
  from public.financial_documents fd
  where fd.source_module = 'transportation'
    and fd.source_table = p_source_table
    and fd.source_document_id = p_source_id
    and fd.document_family = p_document_family
  limit 1;

  if v_existing_posted then
    return v_financial_document_id;
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
           round(coalesce(b.net_receivable, 0)::numeric, 2),
           b.id
    into v_division_id, v_document_date, v_effective_date, v_source_no, v_status, v_counterparty_id,
         v_counterparty_name, v_gross, v_taxable, v_tax, v_net, v_related_source_id
    from public.transport_client_bills b
    join public.transport_clients tc on tc.id = b.transport_client_id
    where b.id = p_source_id and b.deleted_at is null;
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
           round(coalesce(i.gst_amount, 0)::numeric, 2),
           i.client_bill_id
    into v_division_id, v_document_date, v_effective_date, v_source_no, v_status, v_counterparty_id,
         v_counterparty_name, v_gross, v_taxable, v_tax, v_net, v_related_source_id
    from public.transport_gst_invoices i
    join public.transport_clients tc on tc.id = i.transport_client_id
    where i.id = p_source_id and i.deleted_at is null;
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
           round(coalesce(n.credit_note_amount, 0)::numeric, 2),
           n.client_bill_id
    into v_division_id, v_document_date, v_effective_date, v_source_no, v_status, v_counterparty_id,
         v_counterparty_name, v_gross, v_taxable, v_tax, v_net, v_related_source_id
    from public.transport_client_credit_notes n
    join public.transport_clients tc on tc.id = n.transport_client_id
    where n.id = p_source_id and n.deleted_at is null;
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
           round(coalesce(r.amount_received, 0)::numeric, 2),
           r.client_bill_id,
           r.payment_mode
    into v_division_id, v_document_date, v_effective_date, v_source_no, v_status, v_counterparty_id,
         v_counterparty_name, v_gross, v_taxable, v_tax, v_net, v_related_source_id, v_payment_mode
    from public.transport_client_receipts r
    join public.transport_clients tc on tc.id = r.transport_client_id
    where r.id = p_source_id and r.deleted_at is null;
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
           round(coalesce(s.net_payable_total, 0)::numeric, 2),
           s.id
    into v_division_id, v_document_date, v_effective_date, v_source_no, v_status, v_counterparty_id,
         v_counterparty_name, v_gross, v_taxable, v_tax, v_net, v_related_source_id
    from public.transport_transporter_statements s
    join public.transport_transporters tt on tt.id = s.transport_transporter_id
    where s.id = p_source_id and s.deleted_at is null;
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
           round(coalesce(p.amount_paid, 0)::numeric, 2),
           p.transporter_statement_id,
           p.payment_mode
    into v_division_id, v_document_date, v_effective_date, v_source_no, v_status, v_counterparty_id,
         v_counterparty_name, v_gross, v_taxable, v_tax, v_net, v_related_source_id, v_payment_mode
    from public.transport_transporter_payments p
    join public.transport_transporters tt on tt.id = p.transport_transporter_id
    where p.id = p_source_id and p.deleted_at is null;
  else
    raise exception 'Unsupported bridge mapping: % / %', p_document_family, p_source_table;
  end if;

  if v_division_id is null then
    raise exception 'Source document not found or invalid for % / %', p_document_family, p_source_id;
  end if;

  if (p_document_family in ('CLIENT_BILL', 'GST_INVOICE', 'CREDIT_NOTE', 'TRANSPORTER_STATEMENT') and v_status <> 'approved')
     or (p_document_family in ('CLIENT_RECEIPT', 'TRANSPORTER_PAYMENT') and v_status <> 'confirmed') then
    return v_financial_document_id;
  end if;

  if p_document_family = 'CREDIT_NOTE' and v_related_source_id is not null then
    perform public.bridge_transport_document_to_central_accounts('CLIENT_BILL', 'transport_client_bills', v_related_source_id);
  elsif p_document_family = 'CLIENT_RECEIPT' and v_related_source_id is not null then
    perform public.bridge_transport_document_to_central_accounts('CLIENT_BILL', 'transport_client_bills', v_related_source_id);
  elsif p_document_family = 'TRANSPORTER_PAYMENT' and v_related_source_id is not null then
    perform public.bridge_transport_document_to_central_accounts('TRANSPORTER_STATEMENT', 'transport_transporter_statements', v_related_source_id);
  end if;

  v_counterparty_dimension_id := public.ensure_reporting_dimension(
    'counterparty',
    case when p_document_family in ('TRANSPORTER_STATEMENT', 'TRANSPORTER_PAYMENT') then 'TRANSPORTER:' || v_counterparty_id::text else 'CLIENT:' || v_counterparty_id::text end,
    coalesce(v_counterparty_name, 'Unknown Counterparty')
  );
  select id into v_project_dimension_id from public.reporting_dimensions where dimension_type = 'project' and code = 'UNASSIGNED' limit 1;
  select id into v_profit_center_dimension_id from public.reporting_dimensions where dimension_type = 'profit_center' and code = 'TRANSPORT_CORE' limit 1;

  if v_financial_document_id is null then
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
      'approved',
      v_document_date,
      coalesce(v_effective_date, v_document_date),
      v_gross,
      v_taxable,
      v_tax,
      v_net,
      v_actor_app_user_id,
      now()
    )
    returning id into v_financial_document_id;
  else
    update public.financial_documents
    set source_document_no = v_source_no,
        division_id = v_division_id,
        counterparty_dimension_id = v_counterparty_dimension_id,
        project_dimension_id = v_project_dimension_id,
        profit_center_dimension_id = v_profit_center_dimension_id,
        status = case when status = 'posted' then status else 'approved' end,
        document_date = v_document_date,
        effective_date = coalesce(v_effective_date, v_document_date),
        gross_amount = v_gross,
        taxable_amount = v_taxable,
        tax_amount = v_tax,
        net_amount = v_net,
        updated_at = now()
    where id = v_financial_document_id;
  end if;

  insert into public.posting_queue (
    financial_document_id,
    queue_status,
    requested_by
  )
  values (v_financial_document_id, 'validation_pending', v_actor_app_user_id)
  on conflict do nothing;

  select pq.id into v_queue_id from public.posting_queue pq where pq.financial_document_id = v_financial_document_id limit 1;

  begin
    v_period_id := public.get_central_accounts_period_id(coalesce(v_effective_date, v_document_date));
    if v_period_id is null then
      raise exception 'No open accounting period found for effective date %', coalesce(v_effective_date, v_document_date);
    end if;

    select ap.fiscal_year_id into v_fiscal_year_id from public.accounting_periods ap where ap.id = v_period_id;

    if exists (
      select 1 from public.document_postings dp
      where dp.financial_document_id = v_financial_document_id and dp.posting_status = 'posted'
    ) then
      update public.posting_queue
      set queue_status = 'posted', processed_at = now(), updated_at = now()
      where id = v_queue_id;

      update public.financial_documents
      set status = 'posted', posted_by = coalesce(posted_by, v_actor_app_user_id), posted_at = coalesce(posted_at, now()), updated_at = now()
      where id = v_financial_document_id;

      return v_financial_document_id;
    end if;

    v_posting_sequence := public.generate_central_accounts_posting_sequence(coalesce(v_effective_date, v_document_date));

    insert into public.document_postings (
      financial_document_id,
      posting_sequence,
      posting_status,
      accounting_period_id,
      posted_by,
      posted_at
    )
    values (
      v_financial_document_id,
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
      v_financial_document_id,
      coalesce(v_effective_date, v_document_date),
      'transportation',
      p_source_id,
      p_document_family,
      v_division_id,
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

    if p_document_family = 'CLIENT_BILL' then
      insert into public.journal_lines (journal_entry_id, line_no, ledger_account_id, division_id, counterparty_dimension_id, project_dimension_id, profit_center_dimension_id, debit_amount, credit_amount, line_memo)
      values
        (v_journal_id, 1, v_ar_account_id, v_division_id, v_counterparty_dimension_id, v_project_dimension_id, v_profit_center_dimension_id, v_net, 0, 'Transportation client bill receivable'),
        (v_journal_id, 2, v_revenue_account_id, v_division_id, v_counterparty_dimension_id, v_project_dimension_id, v_profit_center_dimension_id, 0, v_net, 'Transportation client bill revenue');

      insert into public.receivable_open_items (
        financial_document_id, division_id, counterparty_dimension_id, due_date, original_amount, open_amount, status
      )
      values (
        v_financial_document_id, v_division_id, v_counterparty_dimension_id, v_document_date, v_net, v_net, 'open'
      )
      on conflict (financial_document_id) do update
      set original_amount = excluded.original_amount,
          open_amount = excluded.open_amount,
          due_date = excluded.due_date,
          status = excluded.status,
          updated_at = now();

    elsif p_document_family = 'GST_INVOICE' then
      insert into public.journal_lines (journal_entry_id, line_no, ledger_account_id, division_id, counterparty_dimension_id, project_dimension_id, profit_center_dimension_id, debit_amount, credit_amount, line_memo)
      values
        (v_journal_id, 1, v_ar_account_id, v_division_id, v_counterparty_dimension_id, v_project_dimension_id, v_profit_center_dimension_id, v_tax, 0, 'Transportation GST invoice receivable'),
        (v_journal_id, 2, v_tax_account_id, v_division_id, v_counterparty_dimension_id, v_project_dimension_id, v_profit_center_dimension_id, 0, v_tax, 'Transportation GST output');

    elsif p_document_family = 'CREDIT_NOTE' then
      insert into public.journal_lines (journal_entry_id, line_no, ledger_account_id, division_id, counterparty_dimension_id, project_dimension_id, profit_center_dimension_id, debit_amount, credit_amount, line_memo)
      values
        (v_journal_id, 1, v_revenue_account_id, v_division_id, v_counterparty_dimension_id, v_project_dimension_id, v_profit_center_dimension_id, v_net, 0, 'Transportation credit note revenue reversal'),
        (v_journal_id, 2, v_ar_account_id, v_division_id, v_counterparty_dimension_id, v_project_dimension_id, v_profit_center_dimension_id, 0, v_net, 'Transportation credit note receivable reversal');

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
          insert into public.receivable_allocations (
            receivable_item_id, applied_document_id, allocation_date, amount, status
          )
          values (v_open_item_id, v_financial_document_id, coalesce(v_effective_date, v_document_date), v_net, 'posted');

          update public.receivable_open_items
          set open_amount = greatest(open_amount - v_net, 0),
              status = case when greatest(open_amount - v_net, 0) = 0 then 'settled' when open_amount - v_net < open_amount then 'partially_settled' else status end,
              updated_at = now()
          where id = v_open_item_id;
        end if;
      end if;

    elsif p_document_family = 'CLIENT_RECEIPT' then
      insert into public.journal_lines (journal_entry_id, line_no, ledger_account_id, division_id, counterparty_dimension_id, project_dimension_id, profit_center_dimension_id, debit_amount, credit_amount, line_memo)
      values
        (v_journal_id, 1, case when v_payment_mode = 'Cash' then v_cash_account_id else v_bank_account_id end, v_division_id, v_counterparty_dimension_id, v_project_dimension_id, v_profit_center_dimension_id, v_net, 0, 'Transportation client receipt treasury'),
        (v_journal_id, 2, v_ar_account_id, v_division_id, v_counterparty_dimension_id, v_project_dimension_id, v_profit_center_dimension_id, 0, v_net, 'Transportation client receipt receivable settlement');

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
          insert into public.receivable_allocations (
            receivable_item_id, applied_document_id, allocation_date, amount, status
          )
          values (v_open_item_id, v_financial_document_id, coalesce(v_effective_date, v_document_date), v_net, 'posted');

          update public.receivable_open_items
          set open_amount = greatest(open_amount - v_net, 0),
              status = case when greatest(open_amount - v_net, 0) = 0 then 'settled' when open_amount - v_net < open_amount then 'partially_settled' else status end,
              updated_at = now()
          where id = v_open_item_id;
        end if;
      end if;

    elsif p_document_family = 'TRANSPORTER_STATEMENT' then
      insert into public.journal_lines (journal_entry_id, line_no, ledger_account_id, division_id, counterparty_dimension_id, project_dimension_id, profit_center_dimension_id, debit_amount, credit_amount, line_memo)
      values
        (v_journal_id, 1, v_cost_account_id, v_division_id, v_counterparty_dimension_id, v_project_dimension_id, v_profit_center_dimension_id, v_net, 0, 'Transportation transporter cost'),
        (v_journal_id, 2, v_ap_account_id, v_division_id, v_counterparty_dimension_id, v_project_dimension_id, v_profit_center_dimension_id, 0, v_net, 'Transportation transporter payable');

      insert into public.payable_open_items (
        financial_document_id, division_id, counterparty_dimension_id, due_date, original_amount, open_amount, status
      )
      values (
        v_financial_document_id, v_division_id, v_counterparty_dimension_id, v_document_date, v_net, v_net, 'open'
      )
      on conflict (financial_document_id) do update
      set original_amount = excluded.original_amount,
          open_amount = excluded.open_amount,
          due_date = excluded.due_date,
          status = excluded.status,
          updated_at = now();

    elsif p_document_family = 'TRANSPORTER_PAYMENT' then
      insert into public.journal_lines (journal_entry_id, line_no, ledger_account_id, division_id, counterparty_dimension_id, project_dimension_id, profit_center_dimension_id, debit_amount, credit_amount, line_memo)
      values
        (v_journal_id, 1, v_ap_account_id, v_division_id, v_counterparty_dimension_id, v_project_dimension_id, v_profit_center_dimension_id, v_net, 0, 'Transportation transporter payment payable settlement'),
        (v_journal_id, 2, case when v_payment_mode = 'Cash' then v_cash_account_id else v_bank_account_id end, v_division_id, v_counterparty_dimension_id, v_project_dimension_id, v_profit_center_dimension_id, 0, v_net, 'Transportation transporter payment treasury');

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
          insert into public.payable_allocations (
            payable_item_id, applied_document_id, allocation_date, amount, status
          )
          values (v_open_item_id, v_financial_document_id, coalesce(v_effective_date, v_document_date), v_net, 'posted');

          update public.payable_open_items
          set open_amount = greatest(open_amount - v_net, 0),
              status = case when greatest(open_amount - v_net, 0) = 0 then 'settled' when open_amount - v_net < open_amount then 'partially_settled' else status end,
              updated_at = now()
          where id = v_open_item_id;
        end if;
      end if;
    end if;

    update public.document_postings
    set posting_status = 'posted',
        journal_entry_id = v_journal_id,
        posted_at = now(),
        updated_at = now()
    where id = v_posting_id;

    update public.posting_queue
    set queue_status = 'posted',
        queue_attempt = queue_attempt + 1,
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
    where id = v_financial_document_id;

    perform public.log_central_accounts_audit_event(
      'transport_bridge_posted',
      p_document_family,
      p_source_id::text,
      v_financial_document_id,
      v_journal_id,
      v_queue_id,
      v_period_id,
      v_actor_app_user_id,
      jsonb_build_object(
        'source_module', 'transportation',
        'source_table', p_source_table,
        'source_no', v_source_no,
        'posting_sequence', v_posting_sequence
      )
    );
  exception when others then
    update public.posting_queue
    set queue_status = 'failed',
        queue_attempt = queue_attempt + 1,
        processed_by = v_actor_app_user_id,
        processed_at = now(),
        updated_at = now(),
        last_error = sqlerrm
    where id = v_queue_id;

    update public.financial_documents
    set status = case when status = 'posted' then status else 'ready_for_posting' end,
        updated_at = now()
    where id = v_financial_document_id;

    perform public.log_central_accounts_audit_event(
      'transport_bridge_failed',
      p_document_family,
      p_source_id::text,
      v_financial_document_id,
      null,
      v_queue_id,
      v_period_id,
      v_actor_app_user_id,
      jsonb_build_object(
        'source_module', 'transportation',
        'source_table', p_source_table,
        'source_no', v_source_no,
        'error', sqlerrm
      )
    );
  end;

  return v_financial_document_id;
end;
$$;

create or replace function public.trg_bridge_transport_client_bills_to_central_accounts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.deleted_at is null and new.status = 'approved' and (tg_op = 'INSERT' or coalesce(old.status, '') <> new.status) then
    perform public.bridge_transport_document_to_central_accounts('CLIENT_BILL', 'transport_client_bills', new.id);
  end if;
  return new;
exception when others then
  return new;
end;
$$;

create or replace function public.trg_bridge_transport_gst_invoices_to_central_accounts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.deleted_at is null and new.status = 'approved' and (tg_op = 'INSERT' or coalesce(old.status, '') <> new.status) then
    perform public.bridge_transport_document_to_central_accounts('GST_INVOICE', 'transport_gst_invoices', new.id);
  end if;
  return new;
exception when others then
  return new;
end;
$$;

create or replace function public.trg_bridge_transport_credit_notes_to_central_accounts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.deleted_at is null and new.status = 'approved' and (tg_op = 'INSERT' or coalesce(old.status, '') <> new.status) then
    perform public.bridge_transport_document_to_central_accounts('CREDIT_NOTE', 'transport_client_credit_notes', new.id);
  end if;
  return new;
exception when others then
  return new;
end;
$$;

create or replace function public.trg_bridge_transport_client_receipts_to_central_accounts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.deleted_at is null and new.status = 'confirmed' and (tg_op = 'INSERT' or coalesce(old.status, '') <> new.status) then
    perform public.bridge_transport_document_to_central_accounts('CLIENT_RECEIPT', 'transport_client_receipts', new.id);
  end if;
  return new;
exception when others then
  return new;
end;
$$;

create or replace function public.trg_bridge_transport_transporter_statements_to_central_accounts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.deleted_at is null and new.status = 'approved' and (tg_op = 'INSERT' or coalesce(old.status, '') <> new.status) then
    perform public.bridge_transport_document_to_central_accounts('TRANSPORTER_STATEMENT', 'transport_transporter_statements', new.id);
  end if;
  return new;
exception when others then
  return new;
end;
$$;

create or replace function public.trg_bridge_transport_transporter_payments_to_central_accounts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.deleted_at is null and new.status = 'confirmed' and (tg_op = 'INSERT' or coalesce(old.status, '') <> new.status) then
    perform public.bridge_transport_document_to_central_accounts('TRANSPORTER_PAYMENT', 'transport_transporter_payments', new.id);
  end if;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists trg_bridge_transport_client_bills_to_central_accounts on public.transport_client_bills;
create trigger trg_bridge_transport_client_bills_to_central_accounts
after insert or update on public.transport_client_bills
for each row
execute function public.trg_bridge_transport_client_bills_to_central_accounts();

drop trigger if exists trg_bridge_transport_gst_invoices_to_central_accounts on public.transport_gst_invoices;
create trigger trg_bridge_transport_gst_invoices_to_central_accounts
after insert or update on public.transport_gst_invoices
for each row
execute function public.trg_bridge_transport_gst_invoices_to_central_accounts();

drop trigger if exists trg_bridge_transport_credit_notes_to_central_accounts on public.transport_client_credit_notes;
create trigger trg_bridge_transport_credit_notes_to_central_accounts
after insert or update on public.transport_client_credit_notes
for each row
execute function public.trg_bridge_transport_credit_notes_to_central_accounts();

drop trigger if exists trg_bridge_transport_client_receipts_to_central_accounts on public.transport_client_receipts;
create trigger trg_bridge_transport_client_receipts_to_central_accounts
after insert or update on public.transport_client_receipts
for each row
execute function public.trg_bridge_transport_client_receipts_to_central_accounts();

drop trigger if exists trg_bridge_transport_transporter_statements_to_central_accounts on public.transport_transporter_statements;
create trigger trg_bridge_transport_transporter_statements_to_central_accounts
after insert or update on public.transport_transporter_statements
for each row
execute function public.trg_bridge_transport_transporter_statements_to_central_accounts();

drop trigger if exists trg_bridge_transport_transporter_payments_to_central_accounts on public.transport_transporter_payments;
create trigger trg_bridge_transport_transporter_payments_to_central_accounts
after insert or update on public.transport_transporter_payments
for each row
execute function public.trg_bridge_transport_transporter_payments_to_central_accounts();

select public.seed_central_accounts_transport_defaults();

do $$
declare
  r record;
begin
  for r in
    select id from public.transport_client_bills where deleted_at is null and status = 'approved'
  loop
    perform public.bridge_transport_document_to_central_accounts('CLIENT_BILL', 'transport_client_bills', r.id);
  end loop;

  for r in
    select id from public.transport_gst_invoices where deleted_at is null and status = 'approved'
  loop
    perform public.bridge_transport_document_to_central_accounts('GST_INVOICE', 'transport_gst_invoices', r.id);
  end loop;

  for r in
    select id from public.transport_client_credit_notes where deleted_at is null and status = 'approved'
  loop
    perform public.bridge_transport_document_to_central_accounts('CREDIT_NOTE', 'transport_client_credit_notes', r.id);
  end loop;

  for r in
    select id from public.transport_transporter_statements where deleted_at is null and status = 'approved'
  loop
    perform public.bridge_transport_document_to_central_accounts('TRANSPORTER_STATEMENT', 'transport_transporter_statements', r.id);
  end loop;

  for r in
    select id from public.transport_client_receipts where deleted_at is null and status = 'confirmed'
  loop
    perform public.bridge_transport_document_to_central_accounts('CLIENT_RECEIPT', 'transport_client_receipts', r.id);
  end loop;

  for r in
    select id from public.transport_transporter_payments where deleted_at is null and status = 'confirmed'
  loop
    perform public.bridge_transport_document_to_central_accounts('TRANSPORTER_PAYMENT', 'transport_transporter_payments', r.id);
  end loop;
end $$;