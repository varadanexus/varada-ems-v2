-- Sprint 13D.5
-- Expose support deductions on client portal bills so portal views/PDFs can show
-- deductions separately from net receivable, matching the existing EMS billing data.
-- Penalties remain a transporter-statement adjustment source; there is no separate
-- penalty column stored on transport_client_bills in the current business model.

create or replace function public.transport_client_portal_bills(p_session_token text, p_transport_client_id uuid)
returns table(
  id uuid,
  bill_no text,
  bill_date date,
  status text,
  billing_type text,
  gross_total numeric,
  support_deduction_total numeric,
  net_receivable numeric,
  taxable_value numeric,
  gst_percentage numeric,
  gst_amount numeric,
  invoice_total numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_portal_user_id uuid;
begin
  select portal_user_id into v_portal_user_id from public.transport_portal_validate_session(p_session_token);
  if not exists (
    select 1
    from public.transport_client_portal_access a
    where a.portal_user_id = v_portal_user_id
      and a.transport_client_id = p_transport_client_id
      and a.is_active
  ) then
    raise exception 'Access denied for this client';
  end if;

  return query
  select
    b.id,
    b.bill_no,
    b.bill_date,
    b.status,
    b.billing_type,
    b.gross_total,
    b.support_deduction_total,
    b.net_receivable,
    b.taxable_value,
    b.gst_percentage,
    b.gst_amount,
    b.invoice_total
  from public.transport_client_bills b
  where b.transport_client_id = p_transport_client_id
    and b.deleted_at is null
  order by b.bill_date desc nulls last, b.created_at desc;
end;
$$;

grant execute on function public.transport_client_portal_bills(text, uuid) to anon, authenticated;