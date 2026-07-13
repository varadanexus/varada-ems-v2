-- Sprint 8B.2: Correct GST MARGIN_ONLY margin basis to use transporter net payable

create or replace function public.create_transport_client_bill(
  p_division_id uuid,
  p_transport_client_id uuid,
  p_bill_date date,
  p_remarks text,
  p_trip_ids uuid[],
  p_billing_type text default 'NON_GST',
  p_gst_base text default null,
  p_gst_mode text default null,
  p_gst_percentage numeric default null
)
returns table (
  bill_id uuid,
  bill_no text,
  gross_total numeric,
  support_deduction_total numeric,
  net_receivable numeric,
  billing_type text,
  taxable_value numeric,
  gst_amount numeric,
  invoice_total numeric,
  transporter_cost numeric,
  margin_amount numeric
)
language plpgsql
as $$
declare
  v_bill_id uuid;
  v_bill_no text;
  v_requested_count integer;
  v_eligible_count integer;
  v_billing_type text := coalesce(nullif(btrim(coalesce(p_billing_type, '')), ''), 'NON_GST');
  v_gst_base text := nullif(btrim(coalesce(p_gst_base, '')), '');
  v_gst_mode text := nullif(btrim(coalesce(p_gst_mode, '')), '');
  v_gst_percentage numeric := p_gst_percentage;
  v_bill_amount numeric(14,2) := 0;
  v_transporter_cost numeric(14,2) := 0;
  v_margin numeric(14,2) := 0;
  v_taxable numeric(14,2) := null;
  v_gst numeric(14,2) := null;
  v_invoice_total numeric(14,2) := null;
  v_base_amount numeric(14,2) := 0;
begin
  if p_division_id is null then raise exception 'division_id is required'; end if;
  if p_transport_client_id is null then raise exception 'transport_client_id is required'; end if;
  if p_bill_date is null then raise exception 'bill_date is required'; end if;
  if coalesce(array_length(p_trip_ids, 1), 0) = 0 then raise exception 'At least one trip is required'; end if;
  if v_billing_type not in ('NON_GST', 'GST') then raise exception 'Invalid billing_type'; end if;

  if v_billing_type = 'GST' then
    if v_gst_base not in ('ENTIRE_BILL', 'MARGIN_ONLY') then raise exception 'Invalid GST base'; end if;
    if v_gst_mode not in ('EXCLUSIVE', 'INCLUSIVE') then raise exception 'Invalid GST mode'; end if;
    if v_gst_percentage not in (0,5,12,18,28) then raise exception 'Invalid GST percentage'; end if;
  else
    v_gst_base := null;
    v_gst_mode := null;
    v_gst_percentage := null;
  end if;

  select count(distinct trip_id) into v_requested_count
  from unnest(p_trip_ids) as trip_id;

  with eligible as (
    select *
    from public.list_transport_client_billable_trips(p_division_id, p_transport_client_id)
    where trip_id = any(p_trip_ids)
  )
  select count(*) into v_eligible_count
  from eligible;

  if v_eligible_count <> v_requested_count then
    raise exception 'One or more selected trips are no longer eligible for billing';
  end if;

  select round(coalesce(sum(eligible.client_net_receivable), 0)::numeric, 2),
         round(coalesce(sum(eligible.transporter_net_payable), 0)::numeric, 2)
  into v_bill_amount, v_transporter_cost
  from public.list_transport_client_billable_trips(p_division_id, p_transport_client_id) as eligible
  where eligible.trip_id = any(p_trip_ids);

  v_margin := greatest(round((coalesce(v_bill_amount, 0) - coalesce(v_transporter_cost, 0))::numeric, 2), 0::numeric);

  if v_billing_type = 'GST' then
    v_base_amount := case when v_gst_base = 'MARGIN_ONLY' then v_margin else v_bill_amount end;
    if coalesce(v_base_amount, 0) <= 0 then raise exception 'GST base amount must be greater than zero'; end if;

    if v_gst_mode = 'INCLUSIVE' then
      v_invoice_total := round(v_bill_amount::numeric, 2);
      if coalesce(v_gst_percentage, 0) = 0 then
        v_taxable := round(v_base_amount::numeric, 2);
        v_gst := 0;
      else
        v_taxable := round((v_base_amount / (1 + (v_gst_percentage / 100.0)))::numeric, 2);
        v_gst := round((v_base_amount - v_taxable)::numeric, 2);
      end if;
    else
      v_taxable := round(v_base_amount::numeric, 2);
      v_gst := round((v_taxable * (v_gst_percentage / 100.0))::numeric, 2);
      v_invoice_total := round((v_bill_amount + v_gst)::numeric, 2);
    end if;
  end if;

  v_bill_no := public.generate_transport_client_bill_no(p_division_id, p_bill_date);

  with eligible as (
    select *
    from public.list_transport_client_billable_trips(p_division_id, p_transport_client_id)
    where trip_id = any(p_trip_ids)
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
      billing_type,
      gst_base,
      gst_mode,
      gst_percentage,
      taxable_value,
      gst_amount,
      invoice_total,
      transporter_cost,
      margin_amount,
      remarks
    )
    select p_division_id,
           v_bill_no,
           p_transport_client_id,
           p_bill_date,
           'draft',
           round(sum(client_gross_amount)::numeric, 2),
           round(sum(support_deduction_amount)::numeric, 2),
           round(sum(client_net_receivable)::numeric, 2),
           v_billing_type,
           v_gst_base,
           v_gst_mode,
           v_gst_percentage,
           v_taxable,
           v_gst,
           v_invoice_total,
           v_transporter_cost,
           v_margin,
           nullif(btrim(coalesce(p_remarks, '')), '')
    from eligible
    returning public.transport_client_bills.id as bill_id,
              public.transport_client_bills.bill_no as bill_no,
              public.transport_client_bills.gross_total as gross_total,
              public.transport_client_bills.support_deduction_total as support_deduction_total,
              public.transport_client_bills.net_receivable as net_receivable,
              public.transport_client_bills.billing_type as billing_type,
              public.transport_client_bills.taxable_value as taxable_value,
              public.transport_client_bills.gst_amount as gst_amount,
              public.transport_client_bills.invoice_total as invoice_total,
              public.transport_client_bills.transporter_cost as transporter_cost,
              public.transport_client_bills.margin_amount as margin_amount
  )
  select inserted_bill.bill_id into v_bill_id
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
         e.trip_id,
         e.trip_no,
         e.trip_date,
         e.quantity_mt,
         e.client_rate_per_mt,
         e.client_gross_amount,
         e.support_deduction_amount,
         e.client_net_receivable
  from public.list_transport_client_billable_trips(p_division_id, p_transport_client_id) e
  where e.trip_id = any(p_trip_ids);

  return query
  select b.id as bill_id,
         b.bill_no as bill_no,
         b.gross_total as gross_total,
         b.support_deduction_total as support_deduction_total,
         b.net_receivable as net_receivable,
         b.billing_type as billing_type,
         b.taxable_value as taxable_value,
         b.gst_amount as gst_amount,
         b.invoice_total as invoice_total,
         b.transporter_cost as transporter_cost,
         b.margin_amount as margin_amount
  from public.transport_client_bills b
  where b.id = v_bill_id;
end;
$$;