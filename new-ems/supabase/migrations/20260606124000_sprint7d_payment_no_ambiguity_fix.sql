-- Sprint 7D bugfix: resolve ambiguous payment_no and related references

create or replace function public.create_transport_transporter_payment(
  p_division_id uuid,
  p_transport_transporter_id uuid,
  p_transporter_statement_id uuid,
  p_payment_date date,
  p_amount_paid numeric,
  p_payment_mode text,
  p_reference_no text,
  p_remarks text
)
returns table (payment_id uuid, payment_no text, status text)
language plpgsql
as $$
declare
  v_outstanding numeric(14,2);
  v_payment_no text;
begin
  if p_division_id is null then raise exception 'division_id is required'; end if;
  if p_transport_transporter_id is null then raise exception 'transport_transporter_id is required'; end if;
  if p_payment_date is null then raise exception 'payment_date is required'; end if;
  if p_payment_mode not in ('Cash','Bank Transfer','Cheque','UPI','Other') then raise exception 'Invalid payment mode'; end if;
  if coalesce(p_amount_paid,0) <= 0 then raise exception 'amount_paid must be > 0'; end if;

  select payment_outstanding.outstanding_amount
  into v_outstanding
  from public.get_transport_transporter_payment_outstanding(p_division_id, p_transport_transporter_id, p_transporter_statement_id) as payment_outstanding;

  if coalesce(v_outstanding,0) <= 0 then raise exception 'No outstanding available'; end if;
  if p_amount_paid > v_outstanding then raise exception 'Amount cannot exceed outstanding'; end if;

  v_payment_no := public.generate_transport_transporter_payment_no(p_division_id, p_payment_date);

  return query
  insert into public.transport_transporter_payments (
    division_id,
    payment_no,
    transport_transporter_id,
    transporter_statement_id,
    payment_date,
    amount_paid,
    payment_mode,
    reference_no,
    remarks,
    status
  )
  values (
    p_division_id,
    v_payment_no,
    p_transport_transporter_id,
    p_transporter_statement_id,
    p_payment_date,
    p_amount_paid,
    p_payment_mode,
    nullif(btrim(coalesce(p_reference_no,'')), ''),
    nullif(btrim(coalesce(p_remarks,'')), ''),
    'draft'
  )
  returning public.transport_transporter_payments.id as returned_payment_id,
            public.transport_transporter_payments.payment_no as returned_payment_no,
            public.transport_transporter_payments.status as returned_status;
end;
$$;

create or replace function public.confirm_transport_transporter_payment(p_payment_id uuid)
returns table (payment_id uuid, payment_no text, status text)
language plpgsql
as $$
declare
  v_payment record;
  v_outstanding numeric(14,2);
begin
  select p.*
  into v_payment
  from public.transport_transporter_payments p
  where p.id = p_payment_id
    and p.deleted_at is null;

  if v_payment.id is null then raise exception 'Payment not found'; end if;
  if v_payment.status = 'confirmed' then raise exception 'Payment already confirmed'; end if;
  if v_payment.status = 'cancelled' then raise exception 'Cancelled payment cannot be confirmed'; end if;

  select payment_outstanding.outstanding_amount
  into v_outstanding
  from public.get_transport_transporter_payment_outstanding(v_payment.division_id, v_payment.transport_transporter_id, v_payment.transporter_statement_id) as payment_outstanding;

  if coalesce(v_outstanding,0) < v_payment.amount_paid then raise exception 'Payment amount exceeds current outstanding'; end if;

  return query
  update public.transport_transporter_payments p
  set status = 'confirmed', updated_at = now()
  where p.id = p_payment_id
    and p.status = 'draft'
  returning p.id as returned_payment_id,
            p.payment_no as returned_payment_no,
            p.status as returned_status;
end;
$$;