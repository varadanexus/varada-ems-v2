-- Sprint 13F.17: allow the Transportation Dashboard to show finance aggregates.
--
-- These reconciliation functions previously ran as SECURITY INVOKER. A user
-- allowed to view the dashboard but not the underlying billing/payment pages
-- therefore saw zero rows through RLS and every finance KPI rendered as ₹0.
-- SECURITY DEFINER is safe here because the functions return aggregate totals
-- only, explicitly require dashboard/finance permission, and enforce division
-- access before reading any rows.

create or replace function public.get_transport_client_financial_reconciliation(p_division_id uuid)
returns table (
  total_approved_bills numeric,
  total_approved_gst numeric,
  total_confirmed_receipts numeric,
  outstanding_receivable numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_division_access_by_id(p_division_id)
     or not (
       public.has_permission('transportation', 'view')
       or public.has_permission('transport-dashboard', 'view')
       or public.has_permission('transport-client-billing', 'view')
       or public.is_super_admin()
       or public.has_role_code('admin')
     ) then
    raise exception 'Not authorized to view transportation finance summary';
  end if;

  return query
  with bill_totals as (
    select round(coalesce(sum(b.net_receivable), 0)::numeric, 2) as amount
    from public.transport_client_bills b
    where b.division_id = p_division_id
      and b.deleted_at is null
      and b.status = 'approved'
  ),
  gst_totals as (
    select round(coalesce(sum(i.gst_amount), 0)::numeric, 2) as amount
    from public.transport_gst_invoices i
    where i.division_id = p_division_id
      and i.deleted_at is null
      and i.status = 'approved'
  ),
  receipt_totals as (
    select round(coalesce(sum(r.amount_received), 0)::numeric, 2) as amount
    from public.transport_client_receipts r
    where r.division_id = p_division_id
      and r.deleted_at is null
      and r.status = 'confirmed'
  ),
  credit_note_totals as (
    select round(coalesce(sum(n.credit_note_amount), 0)::numeric, 2) as amount
    from public.transport_client_credit_notes n
    where n.division_id = p_division_id
      and n.deleted_at is null
      and n.status = 'approved'
  )
  select bt.amount,
         gt.amount,
         rt.amount,
         round((bt.amount + gt.amount - rt.amount - ct.amount)::numeric, 2)
  from bill_totals bt
  cross join gst_totals gt
  cross join receipt_totals rt
  cross join credit_note_totals ct;
end;
$$;

create or replace function public.get_transport_transporter_financial_reconciliation(p_division_id uuid)
returns table (
  total_approved_statements numeric,
  total_confirmed_payments numeric,
  outstanding_payable numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_division_access_by_id(p_division_id)
     or not (
       public.has_permission('transportation', 'view')
       or public.has_permission('transport-dashboard', 'view')
       or public.has_permission('transport-transporter-statements', 'view')
       or public.is_super_admin()
       or public.has_role_code('admin')
     ) then
    raise exception 'Not authorized to view transportation finance summary';
  end if;

  return query
  with statement_totals as (
    select round(coalesce(sum(s.net_payable_total), 0)::numeric, 2) as amount
    from public.transport_transporter_statements s
    where s.division_id = p_division_id
      and s.deleted_at is null
      and s.status = 'approved'
  ),
  payment_totals as (
    select round(coalesce(sum(p.amount_paid), 0)::numeric, 2) as amount
    from public.transport_transporter_payments p
    where p.division_id = p_division_id
      and p.deleted_at is null
      and p.status = 'confirmed'
  )
  select st.amount,
         pt.amount,
         round((st.amount - pt.amount)::numeric, 2)
  from statement_totals st
  cross join payment_totals pt;
end;
$$;

revoke all on function public.get_transport_client_financial_reconciliation(uuid) from public;
revoke all on function public.get_transport_transporter_financial_reconciliation(uuid) from public;
grant execute on function public.get_transport_client_financial_reconciliation(uuid) to authenticated;
grant execute on function public.get_transport_transporter_financial_reconciliation(uuid) to authenticated;
