-- Sprint 7D bugfix: resolve ambiguous receipt_no and related references

create or replace function public.create_transport_client_receipt(
  p_division_id uuid,
  p_transport_client_id uuid,
  p_client_bill_id uuid,
  p_receipt_date date,
  p_amount_received numeric,
  p_payment_mode text,
  p_reference_no text,
  p_remarks text
)
returns table (receipt_id uuid, receipt_no text, status text)
language plpgsql
as $$
declare
  v_outstanding numeric(14,2);
  v_receipt_no text;
begin
  if p_division_id is null then raise exception 'division_id is required'; end if;
  if p_transport_client_id is null then raise exception 'transport_client_id is required'; end if;
  if p_receipt_date is null then raise exception 'receipt_date is required'; end if;
  if p_payment_mode not in ('Cash','Bank Transfer','Cheque','UPI','Other') then raise exception 'Invalid payment mode'; end if;
  if coalesce(p_amount_received,0) <= 0 then raise exception 'amount_received must be > 0'; end if;

  select receipt_outstanding.outstanding_amount
  into v_outstanding
  from public.get_transport_client_receipt_outstanding(p_division_id, p_transport_client_id, p_client_bill_id) as receipt_outstanding;

  if coalesce(v_outstanding,0) <= 0 then raise exception 'No outstanding available'; end if;
  if p_amount_received > v_outstanding then raise exception 'Amount cannot exceed outstanding'; end if;

  v_receipt_no := public.generate_transport_client_receipt_no(p_division_id, p_receipt_date);

  return query
  insert into public.transport_client_receipts (
    division_id,
    receipt_no,
    transport_client_id,
    client_bill_id,
    receipt_date,
    amount_received,
    payment_mode,
    reference_no,
    remarks,
    status
  )
  values (
    p_division_id,
    v_receipt_no,
    p_transport_client_id,
    p_client_bill_id,
    p_receipt_date,
    p_amount_received,
    p_payment_mode,
    nullif(btrim(coalesce(p_reference_no,'')), ''),
    nullif(btrim(coalesce(p_remarks,'')), ''),
    'draft'
  )
  returning public.transport_client_receipts.id as returned_receipt_id,
            public.transport_client_receipts.receipt_no as returned_receipt_no,
            public.transport_client_receipts.status as returned_status;
end;
$$;

create or replace function public.confirm_transport_client_receipt(p_receipt_id uuid)
returns table (receipt_id uuid, receipt_no text, status text)
language plpgsql
as $$
declare
  v_receipt record;
  v_outstanding numeric(14,2);
begin
  select r.*
  into v_receipt
  from public.transport_client_receipts r
  where r.id = p_receipt_id
    and r.deleted_at is null;

  if v_receipt.id is null then raise exception 'Receipt not found'; end if;
  if v_receipt.status = 'confirmed' then raise exception 'Receipt already confirmed'; end if;
  if v_receipt.status = 'cancelled' then raise exception 'Cancelled receipt cannot be confirmed'; end if;

  select receipt_outstanding.outstanding_amount
  into v_outstanding
  from public.get_transport_client_receipt_outstanding(v_receipt.division_id, v_receipt.transport_client_id, v_receipt.client_bill_id) as receipt_outstanding;

  if coalesce(v_outstanding,0) < v_receipt.amount_received then raise exception 'Receipt amount exceeds current outstanding'; end if;

  return query
  update public.transport_client_receipts r
  set status = 'confirmed', updated_at = now()
  where r.id = p_receipt_id
    and r.status = 'draft'
  returning r.id as returned_receipt_id,
            r.receipt_no as returned_receipt_no,
            r.status as returned_status;
end;
$$;