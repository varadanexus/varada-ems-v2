-- Sprint 7F: Financial flow reconciliation helpers

create or replace function public.get_transport_client_financial_reconciliation(p_division_id uuid)
returns table (
  total_approved_bills numeric,
  total_approved_gst numeric,
  total_confirmed_receipts numeric,
  outstanding_receivable numeric
)
language sql
as $$
  with bill_totals as (
    select round(coalesce(sum(b.net_receivable), 0)::numeric, 2) as total_approved_bills
    from public.transport_client_bills b
    where b.division_id = p_division_id
      and b.deleted_at is null
      and b.status = 'approved'
  ),
  gst_totals as (
    select round(coalesce(sum(i.gst_amount), 0)::numeric, 2) as total_approved_gst
    from public.transport_gst_invoices i
    where i.division_id = p_division_id
      and i.deleted_at is null
      and i.status = 'approved'
  ),
  receipt_totals as (
    select round(coalesce(sum(r.amount_received), 0)::numeric, 2) as total_confirmed_receipts
    from public.transport_client_receipts r
    where r.division_id = p_division_id
      and r.deleted_at is null
      and r.status = 'confirmed'
  )
  select bt.total_approved_bills as total_approved_bills,
         gt.total_approved_gst as total_approved_gst,
         rt.total_confirmed_receipts as total_confirmed_receipts,
         round((bt.total_approved_bills + gt.total_approved_gst - rt.total_confirmed_receipts)::numeric, 2) as outstanding_receivable
  from bill_totals bt
  cross join gst_totals gt
  cross join receipt_totals rt;
$$;

create or replace function public.get_transport_transporter_financial_reconciliation(p_division_id uuid)
returns table (
  total_approved_statements numeric,
  total_confirmed_payments numeric,
  outstanding_payable numeric
)
language sql
as $$
  with statement_totals as (
    select round(coalesce(sum(s.net_payable_total), 0)::numeric, 2) as total_approved_statements
    from public.transport_transporter_statements s
    where s.division_id = p_division_id
      and s.deleted_at is null
      and s.status = 'approved'
  ),
  payment_totals as (
    select round(coalesce(sum(p.amount_paid), 0)::numeric, 2) as total_confirmed_payments
    from public.transport_transporter_payments p
    where p.division_id = p_division_id
      and p.deleted_at is null
      and p.status = 'confirmed'
  )
  select st.total_approved_statements as total_approved_statements,
         pt.total_confirmed_payments as total_confirmed_payments,
         round((st.total_approved_statements - pt.total_confirmed_payments)::numeric, 2) as outstanding_payable
  from statement_totals st
  cross join payment_totals pt;
$$;