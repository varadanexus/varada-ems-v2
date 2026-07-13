-- Sprint 7A bugfix: align create_transport_client_bill status with current table constraint

create or replace function public.create_transport_client_bill(
  p_division_id uuid,
  p_transport_client_id uuid,
  p_bill_date date,
  p_remarks text,
  p_trip_ids uuid[]
)
returns table (
  bill_id uuid,
  bill_no text,
  gross_total numeric,
  support_deduction_total numeric,
  net_receivable numeric
)
language plpgsql
as $$
declare
  v_bill_id uuid;
  v_bill_no text;
  v_requested_count integer;
  v_eligible_count integer;
begin
  if p_division_id is null then
    raise exception 'division_id is required';
  end if;
  if p_transport_client_id is null then
    raise exception 'transport_client_id is required';
  end if;
  if p_bill_date is null then
    raise exception 'bill_date is required';
  end if;
  if coalesce(array_length(p_trip_ids, 1), 0) = 0 then
    raise exception 'At least one trip is required';
  end if;

  select count(distinct requested_trip.requested_trip_id) into v_requested_count
  from unnest(p_trip_ids) as requested_trip(requested_trip_id);

  with eligible as (
    select eligible_trip.trip_id as eligible_trip_id,
           eligible_trip.trip_no as eligible_trip_no,
           eligible_trip.trip_date as eligible_trip_date,
           eligible_trip.quantity_mt as eligible_quantity_mt,
           eligible_trip.client_rate_per_mt as eligible_client_rate_per_mt,
           eligible_trip.client_gross_amount as eligible_client_gross_amount,
           eligible_trip.support_deduction_amount as eligible_support_deduction_amount,
           eligible_trip.client_net_receivable as eligible_client_net_receivable
    from public.list_transport_client_billable_trips(p_division_id, p_transport_client_id) as eligible_trip
    where eligible_trip.trip_id = any(p_trip_ids)
  )
  select count(*) into v_eligible_count
  from eligible;

  if v_eligible_count <> v_requested_count then
    raise exception 'One or more selected trips are no longer eligible for billing';
  end if;

  v_bill_no := public.generate_transport_client_bill_no(p_division_id, p_bill_date);

  with eligible as (
    select eligible_trip.trip_id as eligible_trip_id,
           eligible_trip.trip_no as eligible_trip_no,
           eligible_trip.trip_date as eligible_trip_date,
           eligible_trip.quantity_mt as eligible_quantity_mt,
           eligible_trip.client_rate_per_mt as eligible_client_rate_per_mt,
           eligible_trip.client_gross_amount as eligible_client_gross_amount,
           eligible_trip.support_deduction_amount as eligible_support_deduction_amount,
           eligible_trip.client_net_receivable as eligible_client_net_receivable
    from public.list_transport_client_billable_trips(p_division_id, p_transport_client_id) as eligible_trip
    where eligible_trip.trip_id = any(p_trip_ids)
  ), inserted_bill as (
    insert into public.transport_client_bills (
      division_id,
      bill_no,
      transport_client_id,
      bill_date,
      status,
      gross_total,
      support_deduction_total,
      net_receivable,
      remarks
    )
    select p_division_id,
           v_bill_no,
           p_transport_client_id,
           p_bill_date,
           'draft',
           round(sum(eligible.eligible_client_gross_amount)::numeric, 2),
           round(sum(eligible.eligible_support_deduction_amount)::numeric, 2),
           round(sum(eligible.eligible_client_net_receivable)::numeric, 2),
           nullif(btrim(coalesce(p_remarks, '')), '')
    from eligible
    returning public.transport_client_bills.id as inserted_bill_id,
              public.transport_client_bills.bill_no as inserted_bill_no,
              public.transport_client_bills.gross_total as inserted_gross_total,
              public.transport_client_bills.support_deduction_total as inserted_support_deduction_total,
              public.transport_client_bills.net_receivable as inserted_net_receivable
  )
  select inserted_bill.inserted_bill_id into v_bill_id
  from inserted_bill;

  insert into public.transport_client_bill_trips (
    bill_id,
    trip_id,
    trip_no,
    trip_date,
    quantity_mt,
    client_rate_per_mt,
    client_gross_amount,
    support_deduction_amount,
    client_net_receivable
  )
  select v_bill_id,
         eligible_trip.trip_id,
         eligible_trip.trip_no,
         eligible_trip.trip_date,
         eligible_trip.quantity_mt,
         eligible_trip.client_rate_per_mt,
         eligible_trip.client_gross_amount,
         eligible_trip.support_deduction_amount,
         eligible_trip.client_net_receivable
  from public.list_transport_client_billable_trips(p_division_id, p_transport_client_id) as eligible_trip
  where eligible_trip.trip_id = any(p_trip_ids);

  return query
  select b.id as bill_id,
         b.bill_no as bill_no,
         b.gross_total as gross_total,
         b.support_deduction_total as support_deduction_total,
         b.net_receivable as net_receivable
  from public.transport_client_bills b
  where b.id = v_bill_id;
end;
$$;