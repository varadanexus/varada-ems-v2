-- Approved client credit notes reduce receivables on the Transportation Dashboard.
-- Keep the existing RPC result shape so current dashboard clients remain compatible.

create or replace function public.get_transport_client_financial_reconciliation(p_division_id uuid)
returns table (
  total_approved_bills numeric,
  total_approved_gst numeric,
  total_confirmed_receipts numeric,
  outstanding_receivable numeric
)
language sql
stable
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
  ),
  credit_note_totals as (
    select round(coalesce(sum(n.credit_note_amount), 0)::numeric, 2) as total_approved_credit_notes
    from public.transport_client_credit_notes n
    where n.division_id = p_division_id
      and n.deleted_at is null
      and n.status = 'approved'
  )
  select bt.total_approved_bills,
         gt.total_approved_gst,
         rt.total_confirmed_receipts,
         round((
           bt.total_approved_bills
           + gt.total_approved_gst
           - rt.total_confirmed_receipts
           - ct.total_approved_credit_notes
         )::numeric, 2) as outstanding_receivable
  from bill_totals bt
  cross join gst_totals gt
  cross join receipt_totals rt
  cross join credit_note_totals ct;
$$;

