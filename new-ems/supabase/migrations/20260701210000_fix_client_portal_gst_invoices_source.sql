-- Fix: transport_client_portal_gst_invoices was querying transport_gst_invoices
-- which has 0 rows. GST billing data lives entirely on transport_client_bills
-- where billing_type = 'GST', with all GST columns populated (taxable_value,
-- gst_percentage, gst_amount, invoice_total). No separate GST invoice records
-- have ever been created in this workflow.
--
-- Fix: replace RPC body to read from transport_client_bills WHERE billing_type = 'GST'.
-- Return signature is unchanged — callers see same column names.
-- bill_no maps to invoice_no, bill_date maps to invoice_date.

create or replace function public.transport_client_portal_gst_invoices(
  p_session_token       text,
  p_transport_client_id uuid
)
returns table(
  id             uuid,
  invoice_no     text,
  invoice_date   date,
  status         text,
  taxable_value  numeric,
  gst_percentage numeric,
  gst_amount     numeric,
  invoice_total  numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_portal_user_id uuid;
begin
  select portal_user_id into v_portal_user_id
  from public.transport_portal_validate_session(p_session_token);

  if not exists (
    select 1 from public.transport_client_portal_access a
    where a.portal_user_id = v_portal_user_id
      and a.transport_client_id = p_transport_client_id
      and a.is_active
  ) then
    raise exception 'Access denied for this client';
  end if;

  -- GST invoice data lives on transport_client_bills where billing_type = 'GST'.
  -- transport_gst_invoices is a separate child table that is not populated in the
  -- current workflow. Read GST bills directly from transport_client_bills.
  return query
  select
    b.id,
    b.bill_no        as invoice_no,
    b.bill_date      as invoice_date,
    b.status,
    b.taxable_value,
    b.gst_percentage,
    b.gst_amount,
    b.invoice_total
  from public.transport_client_bills b
  where b.transport_client_id = p_transport_client_id
    and b.billing_type = 'GST'
    and b.deleted_at is null
  order by b.bill_date desc nulls last, b.created_at desc;
end;
$$;

grant execute on function public.transport_client_portal_gst_invoices(text, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
