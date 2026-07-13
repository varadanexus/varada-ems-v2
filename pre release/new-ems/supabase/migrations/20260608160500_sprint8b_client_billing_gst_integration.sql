-- Sprint 8B: Integrate GST billing into Client Billing workflow

alter table public.transport_client_bills
  add column if not exists billing_type text not null default 'NON_GST',
  add column if not exists gst_base text,
  add column if not exists gst_mode text,
  add column if not exists gst_percentage numeric(5,2),
  add column if not exists taxable_value numeric(14,2),
  add column if not exists gst_amount numeric(14,2),
  add column if not exists invoice_total numeric(14,2),
  add column if not exists transporter_cost numeric(14,2),
  add column if not exists margin_amount numeric(14,2);

do $$ begin
  alter table public.transport_client_bills
    add constraint chk_transport_client_bills_billing_type
    check (billing_type in ('NON_GST', 'GST'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.transport_client_bills
    add constraint chk_transport_client_bills_gst_base
    check (gst_base is null or gst_base in ('ENTIRE_BILL', 'MARGIN_ONLY'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.transport_client_bills
    add constraint chk_transport_client_bills_gst_mode
    check (gst_mode is null or gst_mode in ('EXCLUSIVE', 'INCLUSIVE'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.transport_client_bills
    add constraint chk_transport_client_bills_gst_percentage
    check (gst_percentage is null or gst_percentage in (0,5,12,18,28));
exception when duplicate_object then null; end $$;

update public.transport_client_bills
set billing_type = coalesce(billing_type, 'NON_GST')
where billing_type is distinct from coalesce(billing_type, 'NON_GST');

drop function if exists public.list_transport_client_billable_trips(uuid, uuid);

create or replace function public.list_transport_client_billable_trips(p_division_id uuid, p_transport_client_id uuid)
returns table (
  trip_id uuid,
  trip_no text,
  trip_date date,
  quantity_mt numeric,
  client_rate_per_mt numeric,
  client_gross_amount numeric,
  support_deduction_amount numeric,
  client_net_receivable numeric,
  transporter_rate_per_mt numeric,
  transporter_gross_payable numeric,
  transporter_net_payable numeric
)
language sql
as $$
  with expense_totals as (
    select e.trip_id,
           round(sum(coalesce(e.amount, 0))::numeric, 2) as support_deduction_amount
    from public.transport_trip_expenses e
    where e.deleted_at is null
      and coalesce(e.is_active, true) = true
    group by e.trip_id
  )
  select t.id as trip_id,
         t.trip_no,
         t.trip_date,
         round(coalesce(t.quantity_mt, 0)::numeric, 3) as quantity_mt,
         round(coalesce(t.client_rate_per_mt, 0)::numeric, 3) as client_rate_per_mt,
         round((coalesce(t.quantity_mt, 0) * coalesce(t.client_rate_per_mt, 0))::numeric, 2) as client_gross_amount,
         coalesce(et.support_deduction_amount, 0)::numeric(14,2) as support_deduction_amount,
         round(((coalesce(t.quantity_mt, 0) * coalesce(t.client_rate_per_mt, 0)) - coalesce(et.support_deduction_amount, 0))::numeric, 2) as client_net_receivable,
         round(coalesce(t.transporter_rate_per_mt, 0)::numeric, 3) as transporter_rate_per_mt,
         round((coalesce(t.quantity_mt, 0) * coalesce(t.transporter_rate_per_mt, 0))::numeric, 2) as transporter_gross_payable,
         round(((coalesce(t.quantity_mt, 0) * coalesce(t.transporter_rate_per_mt, 0)) - coalesce(et.support_deduction_amount, 0))::numeric, 2) as transporter_net_payable
  from public.transport_trips t
  left join expense_totals et on et.trip_id = t.id
  where t.deleted_at is null
    and t.division_id = p_division_id
    and t.transport_client_id = p_transport_client_id
    and t.status in ('completed', 'financial_review')
    and not exists (
      select 1
      from public.transport_client_bill_trips bt
      join public.transport_client_bills b
        on b.id = bt.bill_id
       and b.deleted_at is null
       and b.status <> 'cancelled'
      where bt.trip_id = t.id
        and bt.deleted_at is null
    )
  order by t.trip_date asc, t.trip_no asc;
$$;

drop function if exists public.create_transport_client_bill(uuid, uuid, date, text, uuid[]);

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

create or replace function public.list_transport_client_receipt_bill_options(p_division_id uuid, p_transport_client_id uuid)
returns table (client_bill_id uuid, bill_no text, outstanding_amount numeric)
language sql
as $$
  with confirmed_receipts as (
    select r.client_bill_id, round(sum(coalesce(r.amount_received,0))::numeric,2) as confirmed_amount
    from public.transport_client_receipts r
    where r.deleted_at is null and r.status = 'confirmed' and r.client_bill_id is not null
    group by r.client_bill_id
  )
  select b.id as client_bill_id,
         b.bill_no as bill_no,
         round((coalesce(case when coalesce(b.billing_type, 'NON_GST') = 'GST' then coalesce(b.invoice_total, b.net_receivable, 0) else coalesce(b.net_receivable, 0) end,0) - coalesce(cr.confirmed_amount,0))::numeric, 2) as outstanding_amount
  from public.transport_client_bills b
  left join confirmed_receipts cr on cr.client_bill_id = b.id
  where b.deleted_at is null
    and b.division_id = p_division_id
    and b.transport_client_id = p_transport_client_id
    and b.status = 'approved'
    and round((coalesce(case when coalesce(b.billing_type, 'NON_GST') = 'GST' then coalesce(b.invoice_total, b.net_receivable, 0) else coalesce(b.net_receivable, 0) end,0) - coalesce(cr.confirmed_amount,0))::numeric, 2) > 0
  order by b.bill_date asc, b.bill_no asc;
$$;

create or replace function public.get_transport_client_receipt_outstanding(p_division_id uuid, p_transport_client_id uuid, p_client_bill_id uuid default null)
returns table (target_label text, outstanding_amount numeric)
language plpgsql
as $$
begin
  if p_client_bill_id is not null then
    return query
    with options as (
      select * from public.list_transport_client_receipt_bill_options(p_division_id, p_transport_client_id)
    )
    select coalesce(o.bill_no, 'Selected Bill') as target_label,
           coalesce(o.outstanding_amount, 0)::numeric(14,2) as outstanding_amount
    from options o
    where o.client_bill_id = p_client_bill_id;
    if not found then return query select 'Selected Bill' as target_label, 0::numeric(14,2) as outstanding_amount; end if;
  else
    return query
    with options as (
      select * from public.list_transport_client_receipt_bill_options(p_division_id, p_transport_client_id)
    )
    select 'All Approved Bills' as target_label,
           round(coalesce(sum(o.outstanding_amount),0)::numeric,2) as outstanding_amount
    from options o;
  end if;
end;
$$;