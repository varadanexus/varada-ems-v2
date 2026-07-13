-- Sprint 7C.2: GST base enhancement for entire bill vs margin only

alter table public.transport_gst_invoices add column if not exists gst_base text;
alter table public.transport_gst_invoices add column if not exists margin_amount numeric(18,2);

do $$ begin
  alter table public.transport_gst_invoices add constraint chk_transport_gst_invoices_base check (gst_base in ('ENTIRE_BILL','MARGIN_ONLY') or gst_base is null);
exception when duplicate_object then null; end $$;

drop function if exists public.list_transport_gst_invoice_eligible_bills(uuid);

create or replace function public.list_transport_gst_invoice_eligible_bills(p_division_id uuid)
returns table (
  client_bill_id uuid,
  bill_no text,
  transport_client_id uuid,
  client_name text,
  bill_amount numeric,
  transporter_cost numeric,
  margin_amount numeric
)
language sql
as $$
  with transporter_costs as (
    select bt.bill_id as client_bill_id,
           round(coalesce(sum(stl.transporter_net_payable), 0)::numeric, 2) as transporter_cost
    from public.transport_client_bill_trips bt
    left join public.transport_transporter_statement_trips stl
      on stl.trip_id = bt.trip_id
     and stl.deleted_at is null
    left join public.transport_transporter_statements sts
      on sts.id = stl.statement_id
     and sts.deleted_at is null
     and sts.status = 'approved'
    where bt.deleted_at is null
    group by bt.bill_id
  )
  select b.id as client_bill_id,
         b.bill_no as bill_no,
         b.transport_client_id as transport_client_id,
         coalesce(c.company_name, c.name) as client_name,
         coalesce(b.net_receivable, 0)::numeric(14,2) as bill_amount,
         coalesce(tc.transporter_cost, 0)::numeric(18,2) as transporter_cost,
         greatest(round((coalesce(b.net_receivable, 0) - coalesce(tc.transporter_cost, 0))::numeric, 2), 0::numeric) as margin_amount
  from public.transport_client_bills b
  join public.transport_clients c on c.id = b.transport_client_id
  left join transporter_costs tc on tc.client_bill_id = b.id
  where b.deleted_at is null
    and b.division_id = p_division_id
    and b.status = 'approved'
    and not exists (
      select 1 from public.transport_gst_invoices i
      where i.client_bill_id = b.id
        and i.deleted_at is null
        and i.status <> 'cancelled'
    )
  order by b.bill_date asc, b.bill_no asc;
$$;

create or replace function public.create_transport_gst_invoice(
  p_division_id uuid,
  p_client_bill_id uuid,
  p_invoice_date date,
  p_gst_mode text,
  p_gst_base text,
  p_gst_percentage numeric,
  p_remarks text
)
returns table (
  invoice_id uuid,
  invoice_no text,
  taxable_value numeric,
  gst_amount numeric,
  invoice_total numeric,
  margin_amount numeric
)
language plpgsql
as $$
declare
  v_invoice_no text;
  v_bill record;
  v_taxable numeric(14,2);
  v_gst numeric(14,2);
  v_total numeric(14,2);
  v_transporter_cost numeric(18,2);
  v_margin numeric(18,2);
  v_base_amount numeric(18,2);
begin
  if p_division_id is null then raise exception 'division_id is required'; end if;
  if p_client_bill_id is null then raise exception 'client_bill_id is required'; end if;
  if p_invoice_date is null then raise exception 'invoice_date is required'; end if;
  if p_gst_mode not in ('exclusive','inclusive') then raise exception 'Invalid GST mode'; end if;
  if p_gst_base not in ('ENTIRE_BILL','MARGIN_ONLY') then raise exception 'Invalid GST base'; end if;
  if p_gst_percentage not in (0,5,12,18,28) then raise exception 'Invalid GST percentage'; end if;

  select b.* into v_bill
  from public.transport_client_bills b
  where b.id = p_client_bill_id
    and b.deleted_at is null
    and b.division_id = p_division_id
    and b.status = 'approved';
  if v_bill.id is null then raise exception 'Approved client bill not found'; end if;
  if exists (
    select 1 from public.transport_gst_invoices i
    where i.client_bill_id = p_client_bill_id
      and i.deleted_at is null
      and i.status <> 'cancelled'
  ) then raise exception 'Active GST invoice already exists for this bill'; end if;
  if coalesce(v_bill.net_receivable, 0) <= 0 then raise exception 'Invoice total must be greater than zero'; end if;

  select round(coalesce(sum(stl.transporter_net_payable), 0)::numeric, 2)
  into v_transporter_cost
  from public.transport_client_bill_trips bt
  left join public.transport_transporter_statement_trips stl
    on stl.trip_id = bt.trip_id
   and stl.deleted_at is null
  left join public.transport_transporter_statements sts
    on sts.id = stl.statement_id
   and sts.deleted_at is null
   and sts.status = 'approved'
  where bt.bill_id = p_client_bill_id
    and bt.deleted_at is null;

  v_margin := round((coalesce(v_bill.net_receivable, 0) - coalesce(v_transporter_cost, 0))::numeric, 2);
  v_base_amount := case when p_gst_base = 'MARGIN_ONLY' then v_margin else round(coalesce(v_bill.net_receivable, 0)::numeric, 2) end;
  if coalesce(v_base_amount, 0) <= 0 then raise exception 'GST base amount must be greater than zero'; end if;

  if p_gst_mode = 'inclusive' then
    v_total := round(coalesce(v_base_amount,0)::numeric, 2);
    if p_gst_percentage = 0 then
      v_taxable := v_total;
      v_gst := 0;
    else
      v_taxable := round((v_total / (1 + (p_gst_percentage / 100.0)))::numeric, 2);
      v_gst := round((v_total - v_taxable)::numeric, 2);
    end if;
  else
    v_taxable := round(coalesce(v_base_amount,0)::numeric, 2);
    v_gst := round((v_taxable * (p_gst_percentage / 100.0))::numeric, 2);
    v_total := round((v_taxable + v_gst)::numeric, 2);
  end if;

  v_invoice_no := public.generate_transport_gst_invoice_no(p_division_id, p_invoice_date);

  return query
  insert into public.transport_gst_invoices (
    division_id, invoice_no, client_bill_id, transport_client_id, invoice_date,
    taxable_value, gst_base, margin_amount, gst_percentage, gst_amount, invoice_total, gst_mode, status, remarks
  )
  values (
    p_division_id, v_invoice_no, p_client_bill_id, v_bill.transport_client_id, p_invoice_date,
    v_taxable, p_gst_base, v_margin, p_gst_percentage, v_gst, v_total, p_gst_mode, 'draft', nullif(btrim(coalesce(p_remarks,'')), '')
  )
  returning public.transport_gst_invoices.id as invoice_id,
            public.transport_gst_invoices.invoice_no as invoice_no,
            public.transport_gst_invoices.taxable_value as taxable_value,
            public.transport_gst_invoices.gst_amount as gst_amount,
            public.transport_gst_invoices.invoice_total as invoice_total,
            public.transport_gst_invoices.margin_amount as margin_amount;
end;
$$;