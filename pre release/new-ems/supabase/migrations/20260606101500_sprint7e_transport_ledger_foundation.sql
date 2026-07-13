-- Sprint 7E: Transportation ledger posting foundation

create table if not exists public.transport_ledger_accounts (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id),
  code text not null,
  name text not null,
  account_type text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.transport_ledger_entry_number_sequences (
  division_id uuid not null references public.divisions(id),
  financial_year_label text not null,
  last_number integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (division_id, financial_year_label)
);

create table if not exists public.transport_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id),
  entry_no text not null,
  entry_date date not null,
  source_type text not null,
  source_id uuid not null,
  account_code text not null,
  debit_amount numeric(14,2) not null default 0,
  credit_amount numeric(14,2) not null default 0,
  remarks text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists uq_transport_ledger_accounts_division_code_active
  on public.transport_ledger_accounts(division_id, code)
  where deleted_at is null;

create unique index if not exists uq_transport_ledger_entries_source_account_active
  on public.transport_ledger_entries(division_id, source_type, source_id, account_code)
  where deleted_at is null;

create index if not exists idx_transport_ledger_entries_entry_no_active
  on public.transport_ledger_entries(division_id, entry_no)
  where deleted_at is null;

insert into public.transport_ledger_accounts (division_id, code, name, account_type, is_system)
select d.id, s.code, s.name, s.account_type, true
from public.divisions d
cross join (
  values
    ('TRANSPORT_REVENUE', 'Transport Revenue', 'INCOME'),
    ('CLIENT_RECEIVABLE', 'Client Receivable', 'ASSET'),
    ('GST_OUTPUT', 'GST Output', 'LIABILITY'),
    ('CLIENT_RECEIPTS', 'Client Receipts', 'ASSET'),
    ('TRANSPORT_COST', 'Transport Cost', 'EXPENSE'),
    ('TRANSPORTER_PAYABLE', 'Transporter Payable', 'LIABILITY'),
    ('TRANSPORTER_PAYMENTS', 'Transporter Payments', 'ASSET')
) as s(code, name, account_type)
where d.code = 'TRANSPORT'
  and not exists (
    select 1 from public.transport_ledger_accounts a
    where a.division_id = d.id and a.code = s.code and a.deleted_at is null
  );

create or replace function public.generate_transport_ledger_entry_no(p_division_id uuid, p_entry_date date)
returns text
language plpgsql
as $$
declare v_fy text; v_next integer;
begin
  if p_division_id is null then raise exception 'division_id is required'; end if;
  if p_entry_date is null then raise exception 'entry_date is required'; end if;
  v_fy := public.get_transport_financial_year_label(p_entry_date);
  insert into public.transport_ledger_entry_number_sequences (division_id, financial_year_label, last_number)
  values (p_division_id, v_fy, 1)
  on conflict (division_id, financial_year_label)
  do update set last_number = public.transport_ledger_entry_number_sequences.last_number + 1, updated_at = now()
  returning last_number into v_next;
  return 'LE/' || v_fy || '/' || lpad(v_next::text, 4, '0');
end;
$$;

create or replace function public.list_transport_pending_ledger_events(p_division_id uuid, p_source_type text)
returns table (
  source_type text,
  source_id uuid,
  source_no text,
  event_date date,
  party_name text,
  amount numeric,
  status text
)
language plpgsql
as $$
begin
  if p_source_type = 'CLIENT_BILL' then
    return query
    select 'CLIENT_BILL'::text as source_type,
           b.id as source_id,
           b.bill_no as source_no,
           b.bill_date as event_date,
           coalesce(c.company_name, c.name) as party_name,
           b.net_receivable as amount,
           b.status as status
    from public.transport_client_bills b
    join public.transport_clients c on c.id = b.transport_client_id
    where b.division_id = p_division_id and b.deleted_at is null and b.status = 'approved'
      and not exists (
        select 1 from public.transport_ledger_entries le
        where le.division_id = p_division_id and le.source_type = 'CLIENT_BILL' and le.source_id = b.id and le.deleted_at is null
      )
    order by b.bill_date desc, b.bill_no desc;
  elsif p_source_type = 'GST_INVOICE' then
    return query
    select 'GST_INVOICE'::text as source_type,
           i.id as source_id,
           i.invoice_no as source_no,
           i.invoice_date as event_date,
           coalesce(c.company_name, c.name) as party_name,
           i.gst_amount as amount,
           i.status as status
    from public.transport_gst_invoices i
    join public.transport_clients c on c.id = i.transport_client_id
    where i.division_id = p_division_id and i.deleted_at is null and i.status = 'approved'
      and not exists (
        select 1 from public.transport_ledger_entries le
        where le.division_id = p_division_id and le.source_type = 'GST_INVOICE' and le.source_id = i.id and le.deleted_at is null
      )
    order by i.invoice_date desc, i.invoice_no desc;
  elsif p_source_type = 'CLIENT_RECEIPT' then
    return query
    select 'CLIENT_RECEIPT'::text as source_type,
           r.id as source_id,
           r.receipt_no as source_no,
           r.receipt_date as event_date,
           coalesce(c.company_name, c.name) as party_name,
           r.amount_received as amount,
           r.status as status
    from public.transport_client_receipts r
    join public.transport_clients c on c.id = r.transport_client_id
    where r.division_id = p_division_id and r.deleted_at is null and r.status = 'confirmed'
      and not exists (
        select 1 from public.transport_ledger_entries le
        where le.division_id = p_division_id and le.source_type = 'CLIENT_RECEIPT' and le.source_id = r.id and le.deleted_at is null
      )
    order by r.receipt_date desc, r.receipt_no desc;
  elsif p_source_type = 'TRANSPORTER_STATEMENT' then
    return query
    select 'TRANSPORTER_STATEMENT'::text as source_type,
           s.id as source_id,
           s.statement_no as source_no,
           s.statement_date as event_date,
           t.name as party_name,
           s.net_payable_total as amount,
           s.status as status
    from public.transport_transporter_statements s
    join public.transport_transporters t on t.id = s.transport_transporter_id
    where s.division_id = p_division_id and s.deleted_at is null and s.status = 'approved'
      and not exists (
        select 1 from public.transport_ledger_entries le
        where le.division_id = p_division_id and le.source_type = 'TRANSPORTER_STATEMENT' and le.source_id = s.id and le.deleted_at is null
      )
    order by s.statement_date desc, s.statement_no desc;
  elsif p_source_type = 'TRANSPORTER_PAYMENT' then
    return query
    select 'TRANSPORTER_PAYMENT'::text as source_type,
           p.id as source_id,
           p.payment_no as source_no,
           p.payment_date as event_date,
           t.name as party_name,
           p.amount_paid as amount,
           p.status as status
    from public.transport_transporter_payments p
    join public.transport_transporters t on t.id = p.transport_transporter_id
    where p.division_id = p_division_id and p.deleted_at is null and p.status = 'confirmed'
      and not exists (
        select 1 from public.transport_ledger_entries le
        where le.division_id = p_division_id and le.source_type = 'TRANSPORTER_PAYMENT' and le.source_id = p.id and le.deleted_at is null
      )
    order by p.payment_date desc, p.payment_no desc;
  else
    return;
  end if;
end;
$$;

create or replace function public.post_transport_ledger_source(p_division_id uuid, p_source_type text, p_source_id uuid)
returns table (
  entry_no text,
  posted_rows integer,
  total_debit numeric,
  total_credit numeric
)
language plpgsql
as $$
declare
  v_event_date date;
  v_amount numeric(14,2);
  v_debit_account text;
  v_credit_account text;
  v_entry_no text;
  v_rows integer;
  v_total_debit numeric(14,2);
  v_total_credit numeric(14,2);
begin
  if p_division_id is null then raise exception 'division_id is required'; end if;
  if p_source_type is null or p_source_id is null then raise exception 'source_type and source_id are required'; end if;
  if exists (
    select 1 from public.transport_ledger_entries le
    where le.division_id = p_division_id and le.source_type = p_source_type and le.source_id = p_source_id and le.deleted_at is null
  ) then raise exception 'Ledger already posted for source % / %', p_source_type, p_source_id; end if;

  if p_source_type = 'CLIENT_BILL' then
    select b.bill_date, b.net_receivable into v_event_date, v_amount
    from public.transport_client_bills b
    where b.id = p_source_id and b.division_id = p_division_id and b.deleted_at is null and b.status = 'approved';
    v_debit_account := 'CLIENT_RECEIVABLE';
    v_credit_account := 'TRANSPORT_REVENUE';
  elsif p_source_type = 'GST_INVOICE' then
    select i.invoice_date, i.gst_amount into v_event_date, v_amount
    from public.transport_gst_invoices i
    where i.id = p_source_id and i.division_id = p_division_id and i.deleted_at is null and i.status = 'approved';
    v_debit_account := 'CLIENT_RECEIVABLE';
    v_credit_account := 'GST_OUTPUT';
  elsif p_source_type = 'CLIENT_RECEIPT' then
    select r.receipt_date, r.amount_received into v_event_date, v_amount
    from public.transport_client_receipts r
    where r.id = p_source_id and r.division_id = p_division_id and r.deleted_at is null and r.status = 'confirmed';
    v_debit_account := 'CLIENT_RECEIPTS';
    v_credit_account := 'CLIENT_RECEIVABLE';
  elsif p_source_type = 'TRANSPORTER_STATEMENT' then
    select s.statement_date, s.net_payable_total into v_event_date, v_amount
    from public.transport_transporter_statements s
    where s.id = p_source_id and s.division_id = p_division_id and s.deleted_at is null and s.status = 'approved';
    v_debit_account := 'TRANSPORT_COST';
    v_credit_account := 'TRANSPORTER_PAYABLE';
  elsif p_source_type = 'TRANSPORTER_PAYMENT' then
    select p.payment_date, p.amount_paid into v_event_date, v_amount
    from public.transport_transporter_payments p
    where p.id = p_source_id and p.division_id = p_division_id and p.deleted_at is null and p.status = 'confirmed';
    v_debit_account := 'TRANSPORTER_PAYABLE';
    v_credit_account := 'TRANSPORTER_PAYMENTS';
  else
    raise exception 'Unsupported source_type: %', p_source_type;
  end if;

  if v_event_date is null then raise exception 'Eligible source record not found for posting'; end if;
  if coalesce(v_amount, 0) <= 0 then raise exception 'Posting amount must be greater than zero'; end if;

  v_entry_no := public.generate_transport_ledger_entry_no(p_division_id, v_event_date);

  insert into public.transport_ledger_entries (division_id, entry_no, entry_date, source_type, source_id, account_code, debit_amount, credit_amount, remarks)
  values
    (p_division_id, v_entry_no, v_event_date, p_source_type, p_source_id, v_debit_account, v_amount, 0, p_source_type || ' debit'),
    (p_division_id, v_entry_no, v_event_date, p_source_type, p_source_id, v_credit_account, 0, v_amount, p_source_type || ' credit');

  select count(*)::integer,
         round(coalesce(sum(le.debit_amount),0)::numeric,2),
         round(coalesce(sum(le.credit_amount),0)::numeric,2)
  into v_rows, v_total_debit, v_total_credit
  from public.transport_ledger_entries le
  where le.division_id = p_division_id and le.entry_no = v_entry_no and le.deleted_at is null;

  if coalesce(v_total_debit,0) <> coalesce(v_total_credit,0) then
    raise exception 'Debit/Credit mismatch for ledger entry %', v_entry_no;
  end if;

  return query
  select v_entry_no as entry_no,
         v_rows as posted_rows,
         v_total_debit as total_debit,
         v_total_credit as total_credit;
end;
$$;

create or replace function public.list_transport_ledger_entries(
  p_division_id uuid,
  p_source_type text default null,
  p_account_code text default null,
  p_from_date date default null,
  p_to_date date default null,
  p_entry_no text default null
)
returns table (
  id uuid,
  entry_no text,
  entry_date date,
  source_type text,
  source_id uuid,
  account_code text,
  debit_amount numeric,
  credit_amount numeric,
  remarks text,
  created_at timestamptz
)
language sql
as $$
  select le.id as id,
         le.entry_no as entry_no,
         le.entry_date as entry_date,
         le.source_type as source_type,
         le.source_id as source_id,
         le.account_code as account_code,
         le.debit_amount as debit_amount,
         le.credit_amount as credit_amount,
         le.remarks as remarks,
         le.created_at as created_at
  from public.transport_ledger_entries le
  where le.division_id = p_division_id
    and le.deleted_at is null
    and (p_source_type is null or le.source_type = p_source_type)
    and (p_account_code is null or le.account_code = p_account_code)
    and (p_from_date is null or le.entry_date >= p_from_date)
    and (p_to_date is null or le.entry_date <= p_to_date)
    and (p_entry_no is null or le.entry_no = p_entry_no)
  order by le.entry_date desc, le.entry_no desc, le.created_at asc;
$$;

create or replace function public.get_transport_ledger_entry_details(p_division_id uuid, p_entry_no text)
returns table (
  id uuid,
  entry_no text,
  entry_date date,
  source_type text,
  source_id uuid,
  account_code text,
  debit_amount numeric,
  credit_amount numeric,
  remarks text,
  created_at timestamptz
)
language sql
as $$
  select le.id as id,
         le.entry_no as entry_no,
         le.entry_date as entry_date,
         le.source_type as source_type,
         le.source_id as source_id,
         le.account_code as account_code,
         le.debit_amount as debit_amount,
         le.credit_amount as credit_amount,
         le.remarks as remarks,
         le.created_at as created_at
  from public.transport_ledger_entries le
  where le.division_id = p_division_id and le.entry_no = p_entry_no and le.deleted_at is null
  order by le.created_at asc, le.account_code asc;
$$;

alter table public.transport_ledger_accounts enable row level security;
alter table public.transport_ledger_entry_number_sequences enable row level security;
alter table public.transport_ledger_entries enable row level security;

do $$ begin create policy transport_ledger_accounts_auth_rw on public.transport_ledger_accounts for all to authenticated using (true) with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy transport_ledger_entry_number_sequences_auth_rw on public.transport_ledger_entry_number_sequences for all to authenticated using (true) with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy transport_ledger_entries_auth_rw on public.transport_ledger_entries for all to authenticated using (true) with check (true); exception when duplicate_object then null; end $$;