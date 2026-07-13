-- Sprint 7C: GST Invoice foundation from approved client bills

create table if not exists public.transport_gst_invoice_number_sequences (
  division_id uuid not null references public.divisions(id),
  financial_year_label text not null,
  last_number integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (division_id, financial_year_label)
);

create table if not exists public.transport_gst_invoices (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id),
  invoice_no text not null,
  client_bill_id uuid not null references public.transport_client_bills(id),
  transport_client_id uuid not null references public.transport_clients(id),
  invoice_date date not null,
  taxable_value numeric(14,2) not null default 0,
  gst_percentage numeric(5,2) not null default 0,
  gst_amount numeric(14,2) not null default 0,
  invoice_total numeric(14,2) not null default 0,
  gst_mode text not null default 'exclusive',
  status text not null default 'draft',
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

do $$ begin
  alter table public.transport_gst_invoices add constraint chk_transport_gst_invoices_status check (status in ('draft','approved','cancelled'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.transport_gst_invoices add constraint chk_transport_gst_invoices_mode check (gst_mode in ('exclusive','inclusive'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.transport_gst_invoices add constraint chk_transport_gst_invoices_rate check (gst_percentage in (0,5,12,18,28));
exception when duplicate_object then null; end $$;

create unique index if not exists uq_transport_gst_invoices_division_no_active on public.transport_gst_invoices(division_id, invoice_no) where deleted_at is null;
create unique index if not exists uq_transport_gst_invoices_bill_active on public.transport_gst_invoices(client_bill_id) where deleted_at is null;

create or replace function public.generate_transport_gst_invoice_no(p_division_id uuid, p_invoice_date date)
returns text
language plpgsql
as $$
declare v_fy text; v_next_number integer;
begin
  if p_division_id is null then raise exception 'division_id is required'; end if;
  if p_invoice_date is null then raise exception 'invoice_date is required'; end if;
  v_fy := public.get_transport_financial_year_label(p_invoice_date);
  insert into public.transport_gst_invoice_number_sequences (division_id, financial_year_label, last_number)
  values (p_division_id, v_fy, 1)
  on conflict (division_id, financial_year_label)
  do update set last_number = public.transport_gst_invoice_number_sequences.last_number + 1, updated_at = now()
  returning last_number into v_next_number;
  return 'INV/' || v_fy || '/' || lpad(v_next_number::text, 4, '0');
end;
$$;

create or replace function public.list_transport_gst_invoice_eligible_bills(p_division_id uuid)
returns table (
  client_bill_id uuid,
  bill_no text,
  transport_client_id uuid,
  client_name text,
  bill_amount numeric
)
language sql
as $$
  select b.id as client_bill_id,
         b.bill_no as bill_no,
         b.transport_client_id as transport_client_id,
         coalesce(c.company_name, c.name) as client_name,
         coalesce(b.net_receivable, 0)::numeric(14,2) as bill_amount
  from public.transport_client_bills b
  join public.transport_clients c on c.id = b.transport_client_id
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
  p_gst_percentage numeric,
  p_remarks text
)
returns table (
  invoice_id uuid,
  invoice_no text,
  taxable_value numeric,
  gst_amount numeric,
  invoice_total numeric
)
language plpgsql
as $$
declare
  v_invoice_no text;
  v_bill record;
  v_taxable numeric(14,2);
  v_gst numeric(14,2);
  v_total numeric(14,2);
begin
  if p_division_id is null then raise exception 'division_id is required'; end if;
  if p_client_bill_id is null then raise exception 'client_bill_id is required'; end if;
  if p_invoice_date is null then raise exception 'invoice_date is required'; end if;
  if p_gst_mode not in ('exclusive','inclusive') then raise exception 'Invalid GST mode'; end if;
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

  if p_gst_mode = 'inclusive' then
    v_total := round(coalesce(v_bill.net_receivable,0)::numeric, 2);
    if p_gst_percentage = 0 then
      v_taxable := v_total;
      v_gst := 0;
    else
      v_taxable := round((v_total / (1 + (p_gst_percentage / 100.0)))::numeric, 2);
      v_gst := round((v_total - v_taxable)::numeric, 2);
    end if;
  else
    v_taxable := round(coalesce(v_bill.net_receivable,0)::numeric, 2);
    v_gst := round((v_taxable * (p_gst_percentage / 100.0))::numeric, 2);
    v_total := round((v_taxable + v_gst)::numeric, 2);
  end if;

  v_invoice_no := public.generate_transport_gst_invoice_no(p_division_id, p_invoice_date);

  return query
  insert into public.transport_gst_invoices (
    division_id, invoice_no, client_bill_id, transport_client_id, invoice_date,
    taxable_value, gst_percentage, gst_amount, invoice_total, gst_mode, status, remarks
  )
  values (
    p_division_id, v_invoice_no, p_client_bill_id, v_bill.transport_client_id, p_invoice_date,
    v_taxable, p_gst_percentage, v_gst, v_total, p_gst_mode, 'draft', nullif(btrim(coalesce(p_remarks,'')), '')
  )
  returning public.transport_gst_invoices.id as invoice_id,
            public.transport_gst_invoices.invoice_no as invoice_no,
            public.transport_gst_invoices.taxable_value as taxable_value,
            public.transport_gst_invoices.gst_amount as gst_amount,
            public.transport_gst_invoices.invoice_total as invoice_total;
end;
$$;

alter table public.transport_gst_invoices enable row level security;
alter table public.transport_gst_invoice_number_sequences enable row level security;

do $$ begin
  create policy transport_gst_invoices_auth_rw on public.transport_gst_invoices for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy transport_gst_invoice_number_sequences_auth_rw on public.transport_gst_invoice_number_sequences for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;