-- Sprint 7B bugfix: resolve ambiguous statement_no and related column references

create or replace function public.create_transport_transporter_statement(
  p_division_id uuid,
  p_transport_transporter_id uuid,
  p_statement_date date,
  p_remarks text,
  p_trip_ids uuid[]
)
returns table (
  statement_id uuid,
  statement_no text,
  gross_payable_total numeric,
  support_deduction_total numeric,
  net_payable_total numeric
)
language plpgsql
as $$
declare
  v_statement_id uuid;
  v_statement_no text;
  v_requested_count integer;
  v_eligible_count integer;
begin
  if p_division_id is null then raise exception 'division_id is required'; end if;
  if p_transport_transporter_id is null then raise exception 'transport_transporter_id is required'; end if;
  if p_statement_date is null then raise exception 'statement_date is required'; end if;
  if coalesce(array_length(p_trip_ids, 1), 0) = 0 then raise exception 'At least one trip is required'; end if;

  select count(distinct requested_trip.requested_trip_id)
  into v_requested_count
  from unnest(p_trip_ids) as requested_trip(requested_trip_id);

  with eligible as (
    select eligible_trip.trip_id as eligible_trip_id,
           eligible_trip.trip_no as eligible_trip_no,
           eligible_trip.trip_date as eligible_trip_date,
           eligible_trip.quantity_mt as eligible_quantity_mt,
           eligible_trip.transporter_rate_per_mt as eligible_transporter_rate_per_mt,
           eligible_trip.transporter_gross_payable as eligible_transporter_gross_payable,
           eligible_trip.support_deduction_amount as eligible_support_deduction_amount,
           eligible_trip.transporter_net_payable as eligible_transporter_net_payable
    from public.list_transport_transporter_statementable_trips(p_division_id, p_transport_transporter_id) as eligible_trip
    where eligible_trip.trip_id = any(p_trip_ids)
  )
  select count(*) into v_eligible_count from eligible;

  if v_eligible_count <> v_requested_count then raise exception 'One or more selected trips are no longer eligible for transporter statement'; end if;

  v_statement_no := public.generate_transport_transporter_statement_no(p_division_id, p_statement_date);

  with eligible as (
    select eligible_trip.trip_id as eligible_trip_id,
           eligible_trip.trip_no as eligible_trip_no,
           eligible_trip.trip_date as eligible_trip_date,
           eligible_trip.quantity_mt as eligible_quantity_mt,
           eligible_trip.transporter_rate_per_mt as eligible_transporter_rate_per_mt,
           eligible_trip.transporter_gross_payable as eligible_transporter_gross_payable,
           eligible_trip.support_deduction_amount as eligible_support_deduction_amount,
           eligible_trip.transporter_net_payable as eligible_transporter_net_payable
    from public.list_transport_transporter_statementable_trips(p_division_id, p_transport_transporter_id) as eligible_trip
    where eligible_trip.trip_id = any(p_trip_ids)
  ), inserted_statement as (
    insert into public.transport_transporter_statements (
      division_id, statement_no, transport_transporter_id, statement_date, status,
      gross_payable_total, support_deduction_total, net_payable_total, remarks
    )
    select p_division_id,
           v_statement_no,
           p_transport_transporter_id,
           p_statement_date,
           'draft',
           round(sum(eligible.eligible_transporter_gross_payable)::numeric, 2),
           round(sum(eligible.eligible_support_deduction_amount)::numeric, 2),
           round(sum(eligible.eligible_transporter_net_payable)::numeric, 2),
           nullif(btrim(coalesce(p_remarks, '')), '')
    from eligible
    returning public.transport_transporter_statements.id as returned_statement_id,
              public.transport_transporter_statements.statement_no as returned_statement_no,
              public.transport_transporter_statements.gross_payable_total as returned_gross_payable_total,
              public.transport_transporter_statements.support_deduction_total as returned_support_deduction_total,
              public.transport_transporter_statements.net_payable_total as returned_net_payable_total
  )
  select inserted_statement.returned_statement_id into v_statement_id from inserted_statement;

  insert into public.transport_transporter_statement_trips (
    statement_id, trip_id, trip_no, trip_date, quantity_mt, transporter_rate_per_mt,
    transporter_gross_payable, support_deduction_amount, transporter_net_payable
  )
  select v_statement_id,
         eligible_trip.trip_id,
         eligible_trip.trip_no,
         eligible_trip.trip_date,
         eligible_trip.quantity_mt,
         eligible_trip.transporter_rate_per_mt,
         eligible_trip.transporter_gross_payable,
         eligible_trip.support_deduction_amount,
         eligible_trip.transporter_net_payable
  from public.list_transport_transporter_statementable_trips(p_division_id, p_transport_transporter_id) as eligible_trip
  where eligible_trip.trip_id = any(p_trip_ids);

  return query
  select s.id as statement_id,
         s.statement_no as statement_no,
         s.gross_payable_total as gross_payable_total,
         s.support_deduction_total as support_deduction_total,
         s.net_payable_total as net_payable_total
  from public.transport_transporter_statements s
  where s.id = v_statement_id;
end;
$$;