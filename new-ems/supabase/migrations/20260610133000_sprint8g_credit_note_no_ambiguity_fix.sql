-- Sprint 8G bugfix: resolve ambiguous credit_note_no/output-column references

create or replace function public.create_transport_client_credit_note(
  p_division_id uuid,
  p_transport_client_id uuid,
  p_client_bill_id uuid,
  p_credit_note_date date,
  p_credit_note_amount numeric,
  p_reason text default null,
  p_remarks text default null
)
returns table (
  credit_note_id uuid,
  credit_note_no text,
  credit_note_amount numeric,
  status text
)
language plpgsql
as $$
declare
  v_generated_credit_note_no text;
  v_bill record;
  v_outstanding numeric(14,2);
begin
  if p_division_id is null then raise exception 'division_id is required'; end if;
  if p_transport_client_id is null then raise exception 'transport_client_id is required'; end if;
  if p_client_bill_id is null then raise exception 'client_bill_id is required'; end if;
  if p_credit_note_date is null then raise exception 'credit_note_date is required'; end if;
  if coalesce(p_credit_note_amount, 0) <= 0 then raise exception 'credit_note_amount must be greater than zero'; end if;

  select b.id,
         b.bill_no,
         b.status,
         b.transport_client_id,
         case
           when coalesce(b.billing_type, 'NON_GST') = 'GST' then coalesce(b.invoice_total, b.net_receivable, 0)
           else coalesce(b.net_receivable, 0)
         end as bill_total
  into v_bill
  from public.transport_client_bills b
  where b.id = p_client_bill_id
    and b.division_id = p_division_id
    and b.transport_client_id = p_transport_client_id
    and b.deleted_at is null;

  if v_bill.id is null then raise exception 'Approved client bill not found for selected client'; end if;
  if v_bill.status <> 'approved' then raise exception 'Credit note can only be created against approved client bill'; end if;

  select o.outstanding_amount
  into v_outstanding
  from public.get_transport_client_receipt_outstanding(p_division_id, p_transport_client_id, p_client_bill_id) o;

  if coalesce(v_outstanding, 0) <= 0 then
    raise exception 'No outstanding amount available for selected bill';
  end if;

  if round(coalesce(p_credit_note_amount, 0)::numeric, 2) > round(coalesce(v_outstanding, 0)::numeric, 2) then
    raise exception 'Credit note amount cannot exceed current outstanding';
  end if;

  v_generated_credit_note_no := public.generate_transport_client_credit_note_no(p_division_id, p_credit_note_date);

  return query
  with inserted_credit_note as (
    insert into public.transport_client_credit_notes (
      division_id,
      credit_note_no,
      transport_client_id,
      client_bill_id,
      credit_note_date,
      credit_note_amount,
      reason,
      remarks,
      status,
      created_at,
      updated_at
    )
    values (
      p_division_id,
      v_generated_credit_note_no,
      p_transport_client_id,
      p_client_bill_id,
      p_credit_note_date,
      round(p_credit_note_amount::numeric, 2),
      nullif(btrim(coalesce(p_reason, '')), ''),
      nullif(btrim(coalesce(p_remarks, '')), ''),
      'draft',
      now(),
      now()
    )
    returning public.transport_client_credit_notes.id as returned_credit_note_id,
              public.transport_client_credit_notes.credit_note_no as returned_credit_note_no,
              public.transport_client_credit_notes.credit_note_amount as returned_credit_note_amount,
              public.transport_client_credit_notes.status as returned_status
  )
  select inserted_credit_note.returned_credit_note_id as credit_note_id,
         inserted_credit_note.returned_credit_note_no as credit_note_no,
         inserted_credit_note.returned_credit_note_amount as credit_note_amount,
         inserted_credit_note.returned_status as status
  from inserted_credit_note;
end;
$$;