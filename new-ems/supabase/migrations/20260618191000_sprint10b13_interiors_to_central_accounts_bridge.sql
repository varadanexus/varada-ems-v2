-- Sprint 10B.13: Interiors -> Central Accounts staging bridge
-- Staging only. No journals, no receivables/payables, no document_postings.

create extension if not exists pgcrypto;

create or replace function public.bridge_interiors_bill_to_central_accounts(
  p_billing_header_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bill record;
  v_financial_document_id uuid;
  v_queue_id uuid;
  v_actor_app_user_id uuid := public.current_app_user_id();
  v_division_dimension_id uuid;
  v_counterparty_dimension_id uuid;
  v_project_dimension_id uuid;
  v_profit_center_dimension_id uuid;
begin
  if p_billing_header_id is null then
    raise exception 'billing_header_id is required';
  end if;

  select
    bh.id,
    bh.project_id,
    bh.bill_number,
    bh.bill_type,
    bh.bill_date,
    bh.amount,
    bh.tax_amount,
    bh.total_amount,
    bh.status,
    bh.created_by,
    ip.id as interior_project_id,
    ip.project_code,
    ip.project_name,
    ip.project_title,
    ip.division_id,
    ip.interior_client_id,
    ic.client_name,
    d.code as division_code,
    d.name as division_name
  into v_bill
  from public.interior_billing_headers bh
  join public.interior_projects ip on ip.shared_project_id = bh.project_id
  left join public.interior_clients ic on ic.id = ip.interior_client_id
  left join public.divisions d on d.id = ip.division_id
  where bh.id = p_billing_header_id;

  if v_bill.id is null then
    raise exception 'Interior bill % not found', p_billing_header_id;
  end if;

  if v_bill.status <> 'ready_for_accounts' then
    return null;
  end if;

  v_division_dimension_id := public.ensure_reporting_dimension(
    'division',
    coalesce(nullif(upper(v_bill.division_code), ''), 'INTERIORS'),
    coalesce(v_bill.division_name, 'Interiors')
  );

  v_counterparty_dimension_id := public.ensure_reporting_dimension(
    'counterparty',
    'INTERIOR_CLIENT:' || coalesce(v_bill.interior_client_id::text, 'UNASSIGNED'),
    coalesce(v_bill.client_name, 'Interior Client')
  );

  v_project_dimension_id := public.ensure_reporting_dimension(
    'project',
    coalesce(nullif(v_bill.project_code, ''), 'INTERIOR_PROJECT:' || v_bill.interior_project_id::text),
    coalesce(v_bill.project_title, v_bill.project_name, 'Interior Project')
  );

  v_profit_center_dimension_id := public.ensure_reporting_dimension(
    'profit_center',
    'INTERIORS_CORE',
    'Interiors Core'
  );

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
    'INTERIOR_BILL',
    'interiors',
    'interior_billing_headers',
    v_bill.id,
    v_bill.bill_number,
    v_bill.division_id,
    v_counterparty_dimension_id,
    v_project_dimension_id,
    v_profit_center_dimension_id,
    'ready_for_posting',
    v_bill.bill_date,
    v_bill.bill_date,
    coalesce(v_bill.total_amount, 0),
    coalesce(v_bill.amount, 0),
    coalesce(v_bill.tax_amount, 0),
    coalesce(v_bill.total_amount, 0),
    coalesce(v_bill.created_by, v_actor_app_user_id),
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
    coalesce(v_actor_app_user_id, v_bill.created_by),
    null,
    null,
    null
  )
  on conflict (financial_document_id)
  do update set
    queue_status = case when public.posting_queue.queue_status = 'posted' then public.posting_queue.queue_status else 'ready_to_post' end,
    requested_by = excluded.requested_by,
    processed_by = case when public.posting_queue.queue_status = 'posted' then public.posting_queue.processed_by else null end,
    processed_at = case when public.posting_queue.queue_status = 'posted' then public.posting_queue.processed_at else null end,
    last_error = null,
    updated_at = now()
  returning id into v_queue_id;

  perform public.log_central_accounts_audit_event(
    'interior_bill_staged',
    'INTERIOR_BILL',
    v_bill.id::text,
    v_financial_document_id,
    null,
    v_queue_id,
    null,
    coalesce(v_actor_app_user_id, v_bill.created_by),
    jsonb_build_object(
      'source_module', 'interiors',
      'source_table', 'interior_billing_headers',
      'source_bill_number', v_bill.bill_number,
      'bill_type', v_bill.bill_type,
      'total_amount', v_bill.total_amount,
      'project_id', v_bill.interior_project_id,
      'project_code', v_bill.project_code,
      'client_id', v_bill.interior_client_id,
      'client_name', v_bill.client_name,
      'stage', 'ready_for_posting'
    )
  );

  return v_financial_document_id;
end;
$$;

grant execute on function public.bridge_interiors_bill_to_central_accounts(uuid) to authenticated;

create or replace function public.trg_bridge_interiors_bills_to_central_accounts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'ready_for_accounts'
     and (tg_op = 'INSERT' or coalesce(old.status, '') <> new.status) then
    perform public.bridge_interiors_bill_to_central_accounts(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bridge_interiors_bills_to_central_accounts on public.interior_billing_headers;
create trigger trg_bridge_interiors_bills_to_central_accounts
after insert or update on public.interior_billing_headers
for each row
execute function public.trg_bridge_interiors_bills_to_central_accounts();