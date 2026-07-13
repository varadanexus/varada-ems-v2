-- Sprint 7D: Payment tracking foundation

create table if not exists public.transport_client_receipt_number_sequences (
  division_id uuid not null references public.divisions(id),
  financial_year_label text not null,
  last_number integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (division_id, financial_year_label)
);

create table if not exists public.transport_transporter_payment_number_sequences (
  division_id uuid not null references public.divisions(id),
  financial_year_label text not null,
  last_number integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (division_id, financial_year_label)
);

create table if not exists public.transport_client_receipts (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id),
  receipt_no text not null,
  transport_client_id uuid not null references public.transport_clients(id),
  client_bill_id uuid references public.transport_client_bills(id),
  receipt_date date not null,
  amount_received numeric(14,2) not null,
  payment_mode text not null,
  reference_no text,
  remarks text,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.transport_transporter_payments (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id),
  payment_no text not null,
  transport_transporter_id uuid not null references public.transport_transporters(id),
  transporter_statement_id uuid references public.transport_transporter_statements(id),
  payment_date date not null,
  amount_paid numeric(14,2) not null,
  payment_mode text not null,
  reference_no text,
  remarks text,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

do $$ begin
  alter table public.transport_client_receipts add constraint chk_transport_client_receipts_status check (status in ('draft','confirmed','cancelled'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.transport_transporter_payments add constraint chk_transport_transporter_payments_status check (status in ('draft','confirmed','cancelled'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.transport_client_receipts add constraint chk_transport_client_receipts_mode check (payment_mode in ('Cash','Bank Transfer','Cheque','UPI','Other'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.transport_transporter_payments add constraint chk_transport_transporter_payments_mode check (payment_mode in ('Cash','Bank Transfer','Cheque','UPI','Other'));
exception when duplicate_object then null; end $$;

create unique index if not exists uq_transport_client_receipts_no_active on public.transport_client_receipts(division_id, receipt_no) where deleted_at is null;
create unique index if not exists uq_transport_transporter_payments_no_active on public.transport_transporter_payments(division_id, payment_no) where deleted_at is null;

create or replace function public.generate_transport_client_receipt_no(p_division_id uuid, p_receipt_date date)
returns text
language plpgsql
as $$
declare v_fy text; v_next integer;
begin
  if p_division_id is null then raise exception 'division_id is required'; end if;
  if p_receipt_date is null then raise exception 'receipt_date is required'; end if;
  v_fy := public.get_transport_financial_year_label(p_receipt_date);
  insert into public.transport_client_receipt_number_sequences (division_id, financial_year_label, last_number)
  values (p_division_id, v_fy, 1)
  on conflict (division_id, financial_year_label)
  do update set last_number = public.transport_client_receipt_number_sequences.last_number + 1, updated_at = now()
  returning last_number into v_next;
  return 'CR/' || v_fy || '/' || lpad(v_next::text, 4, '0');
end;
$$;

create or replace function public.generate_transport_transporter_payment_no(p_division_id uuid, p_payment_date date)
returns text
language plpgsql
as $$
declare v_fy text; v_next integer;
begin
  if p_division_id is null then raise exception 'division_id is required'; end if;
  if p_payment_date is null then raise exception 'payment_date is required'; end if;
  v_fy := public.get_transport_financial_year_label(p_payment_date);
  insert into public.transport_transporter_payment_number_sequences (division_id, financial_year_label, last_number)
  values (p_division_id, v_fy, 1)
  on conflict (division_id, financial_year_label)
  do update set last_number = public.transport_transporter_payment_number_sequences.last_number + 1, updated_at = now()
  returning last_number into v_next;
  return 'TP/' || v_fy || '/' || lpad(v_next::text, 4, '0');
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
         round((coalesce(b.net_receivable,0) - coalesce(cr.confirmed_amount,0))::numeric, 2) as outstanding_amount
  from public.transport_client_bills b
  left join confirmed_receipts cr on cr.client_bill_id = b.id
  where b.deleted_at is null
    and b.division_id = p_division_id
    and b.transport_client_id = p_transport_client_id
    and b.status = 'approved'
    and round((coalesce(b.net_receivable,0) - coalesce(cr.confirmed_amount,0))::numeric, 2) > 0
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
declare v_outstanding numeric(14,2); v_receipt_no text;
begin
  if p_division_id is null then raise exception 'division_id is required'; end if;
  if p_transport_client_id is null then raise exception 'transport_client_id is required'; end if;
  if p_receipt_date is null then raise exception 'receipt_date is required'; end if;
  if p_payment_mode not in ('Cash','Bank Transfer','Cheque','UPI','Other') then raise exception 'Invalid payment mode'; end if;
  if coalesce(p_amount_received,0) <= 0 then raise exception 'amount_received must be > 0'; end if;
  select outstanding_amount into v_outstanding from public.get_transport_client_receipt_outstanding(p_division_id, p_transport_client_id, p_client_bill_id);
  if coalesce(v_outstanding,0) <= 0 then raise exception 'No outstanding available'; end if;
  if p_amount_received > v_outstanding then raise exception 'Amount cannot exceed outstanding'; end if;
  v_receipt_no := public.generate_transport_client_receipt_no(p_division_id, p_receipt_date);
  return query
  insert into public.transport_client_receipts (division_id, receipt_no, transport_client_id, client_bill_id, receipt_date, amount_received, payment_mode, reference_no, remarks, status)
  values (p_division_id, v_receipt_no, p_transport_client_id, p_client_bill_id, p_receipt_date, p_amount_received, p_payment_mode, nullif(btrim(coalesce(p_reference_no,'')), ''), nullif(btrim(coalesce(p_remarks,'')), ''), 'draft')
  returning public.transport_client_receipts.id as receipt_id,
            public.transport_client_receipts.receipt_no as receipt_no,
            public.transport_client_receipts.status as status;
end;
$$;

create or replace function public.confirm_transport_client_receipt(p_receipt_id uuid)
returns table (receipt_id uuid, receipt_no text, status text)
language plpgsql
as $$
declare v_receipt record; v_outstanding numeric(14,2);
begin
  select * into v_receipt from public.transport_client_receipts where id = p_receipt_id and deleted_at is null;
  if v_receipt.id is null then raise exception 'Receipt not found'; end if;
  if v_receipt.status = 'confirmed' then raise exception 'Receipt already confirmed'; end if;
  if v_receipt.status = 'cancelled' then raise exception 'Cancelled receipt cannot be confirmed'; end if;
  select outstanding_amount into v_outstanding from public.get_transport_client_receipt_outstanding(v_receipt.division_id, v_receipt.transport_client_id, v_receipt.client_bill_id);
  if coalesce(v_outstanding,0) < v_receipt.amount_received then raise exception 'Receipt amount exceeds current outstanding'; end if;
  return query
  update public.transport_client_receipts
  set status = 'confirmed', updated_at = now()
  where id = p_receipt_id and status = 'draft'
  returning public.transport_client_receipts.id as receipt_id,
            public.transport_client_receipts.receipt_no as receipt_no,
            public.transport_client_receipts.status as status;
end;
$$;

create or replace function public.list_transport_transporter_payment_statement_options(p_division_id uuid, p_transport_transporter_id uuid)
returns table (transporter_statement_id uuid, statement_no text, outstanding_amount numeric)
language sql
as $$
  with confirmed_payments as (
    select p.transporter_statement_id, round(sum(coalesce(p.amount_paid,0))::numeric,2) as confirmed_amount
    from public.transport_transporter_payments p
    where p.deleted_at is null and p.status = 'confirmed' and p.transporter_statement_id is not null
    group by p.transporter_statement_id
  )
  select s.id as transporter_statement_id,
         s.statement_no as statement_no,
         round((coalesce(s.net_payable_total,0) - coalesce(cp.confirmed_amount,0))::numeric, 2) as outstanding_amount
  from public.transport_transporter_statements s
  left join confirmed_payments cp on cp.transporter_statement_id = s.id
  where s.deleted_at is null
    and s.division_id = p_division_id
    and s.transport_transporter_id = p_transport_transporter_id
    and s.status = 'approved'
    and round((coalesce(s.net_payable_total,0) - coalesce(cp.confirmed_amount,0))::numeric, 2) > 0
  order by s.statement_date asc, s.statement_no asc;
$$;

create or replace function public.get_transport_transporter_payment_outstanding(p_division_id uuid, p_transport_transporter_id uuid, p_transporter_statement_id uuid default null)
returns table (target_label text, outstanding_amount numeric)
language plpgsql
as $$
begin
  if p_transporter_statement_id is not null then
    return query
    with options as (
      select * from public.list_transport_transporter_payment_statement_options(p_division_id, p_transport_transporter_id)
    )
    select coalesce(o.statement_no, 'Selected Statement') as target_label,
           coalesce(o.outstanding_amount, 0)::numeric(14,2) as outstanding_amount
    from options o
    where o.transporter_statement_id = p_transporter_statement_id;
    if not found then return query select 'Selected Statement' as target_label, 0::numeric(14,2) as outstanding_amount; end if;
  else
    return query
    with options as (
      select * from public.list_transport_transporter_payment_statement_options(p_division_id, p_transport_transporter_id)
    )
    select 'All Approved Statements' as target_label,
           round(coalesce(sum(o.outstanding_amount),0)::numeric,2) as outstanding_amount
    from options o;
  end if;
end;
$$;

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
declare v_outstanding numeric(14,2); v_payment_no text;
begin
  if p_division_id is null then raise exception 'division_id is required'; end if;
  if p_transport_transporter_id is null then raise exception 'transport_transporter_id is required'; end if;
  if p_payment_date is null then raise exception 'payment_date is required'; end if;
  if p_payment_mode not in ('Cash','Bank Transfer','Cheque','UPI','Other') then raise exception 'Invalid payment mode'; end if;
  if coalesce(p_amount_paid,0) <= 0 then raise exception 'amount_paid must be > 0'; end if;
  select outstanding_amount into v_outstanding from public.get_transport_transporter_payment_outstanding(p_division_id, p_transport_transporter_id, p_transporter_statement_id);
  if coalesce(v_outstanding,0) <= 0 then raise exception 'No outstanding available'; end if;
  if p_amount_paid > v_outstanding then raise exception 'Amount cannot exceed outstanding'; end if;
  v_payment_no := public.generate_transport_transporter_payment_no(p_division_id, p_payment_date);
  return query
  insert into public.transport_transporter_payments (division_id, payment_no, transport_transporter_id, transporter_statement_id, payment_date, amount_paid, payment_mode, reference_no, remarks, status)
  values (p_division_id, v_payment_no, p_transport_transporter_id, p_transporter_statement_id, p_payment_date, p_amount_paid, p_payment_mode, nullif(btrim(coalesce(p_reference_no,'')), ''), nullif(btrim(coalesce(p_remarks,'')), ''), 'draft')
  returning public.transport_transporter_payments.id as payment_id,
            public.transport_transporter_payments.payment_no as payment_no,
            public.transport_transporter_payments.status as status;
end;
$$;

create or replace function public.confirm_transport_transporter_payment(p_payment_id uuid)
returns table (payment_id uuid, payment_no text, status text)
language plpgsql
as $$
declare v_payment record; v_outstanding numeric(14,2);
begin
  select * into v_payment from public.transport_transporter_payments where id = p_payment_id and deleted_at is null;
  if v_payment.id is null then raise exception 'Payment not found'; end if;
  if v_payment.status = 'confirmed' then raise exception 'Payment already confirmed'; end if;
  if v_payment.status = 'cancelled' then raise exception 'Cancelled payment cannot be confirmed'; end if;
  select outstanding_amount into v_outstanding from public.get_transport_transporter_payment_outstanding(v_payment.division_id, v_payment.transport_transporter_id, v_payment.transporter_statement_id);
  if coalesce(v_outstanding,0) < v_payment.amount_paid then raise exception 'Payment amount exceeds current outstanding'; end if;
  return query
  update public.transport_transporter_payments
  set status = 'confirmed', updated_at = now()
  where id = p_payment_id and status = 'draft'
  returning public.transport_transporter_payments.id as payment_id,
            public.transport_transporter_payments.payment_no as payment_no,
            public.transport_transporter_payments.status as status;
end;
$$;

alter table public.transport_client_receipt_number_sequences enable row level security;
alter table public.transport_transporter_payment_number_sequences enable row level security;
alter table public.transport_client_receipts enable row level security;
alter table public.transport_transporter_payments enable row level security;

do $$ begin create policy transport_client_receipt_number_sequences_auth_rw on public.transport_client_receipt_number_sequences for all to authenticated using (true) with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy transport_transporter_payment_number_sequences_auth_rw on public.transport_transporter_payment_number_sequences for all to authenticated using (true) with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy transport_client_receipts_auth_rw on public.transport_client_receipts for all to authenticated using (true) with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy transport_transporter_payments_auth_rw on public.transport_transporter_payments for all to authenticated using (true) with check (true); exception when duplicate_object then null; end $$;