-- Sprint 7A: Client Billing foundation for completed trips

create table if not exists public.transport_client_bill_number_sequences (
  division_id uuid not null references public.divisions(id),
  financial_year_label text not null,
  last_number integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (division_id, financial_year_label)
);

create table if not exists public.transport_client_bills (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id),
  bill_no text not null,
  transport_client_id uuid not null references public.transport_clients(id),
  bill_date date not null,
  status text not null default 'generated',
  gross_total numeric(14,2) not null default 0,
  support_deduction_total numeric(14,2) not null default 0,
  net_receivable numeric(14,2) not null default 0,
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.transport_client_bill_trips (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.transport_client_bills(id) on delete cascade,
  trip_id uuid not null references public.transport_trips(id),
  trip_no text not null,
  trip_date date,
  quantity_mt numeric(12,3) not null default 0,
  client_rate_per_mt numeric(12,3) not null default 0,
  client_gross_amount numeric(14,2) not null default 0,
  support_deduction_amount numeric(14,2) not null default 0,
  client_net_receivable numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

do $$ begin
  alter table public.transport_client_bills
    add constraint chk_transport_client_bills_status
    check (status in ('generated', 'cancelled'));
exception when duplicate_object then null; end $$;

create unique index if not exists uq_transport_client_bills_division_bill_no_active
  on public.transport_client_bills(division_id, bill_no)
  where deleted_at is null;

create unique index if not exists uq_transport_client_bill_trips_trip_active
  on public.transport_client_bill_trips(trip_id)
  where deleted_at is null;

create index if not exists idx_transport_client_bills_client_date
  on public.transport_client_bills(transport_client_id, bill_date desc)
  where deleted_at is null;

create index if not exists idx_transport_client_bill_trips_bill_id
  on public.transport_client_bill_trips(bill_id)
  where deleted_at is null;

create or replace function public.get_transport_financial_year_label(p_bill_date date)
returns text
language plpgsql
immutable
as $$
declare
  v_start_year integer;
  v_end_year integer;
begin
  if p_bill_date is null then
    raise exception 'bill_date is required';
  end if;
  if extract(month from p_bill_date) >= 4 then
    v_start_year := extract(year from p_bill_date);
    v_end_year := v_start_year + 1;
  else
    v_end_year := extract(year from p_bill_date);
    v_start_year := v_end_year - 1;
  end if;
  return lpad((v_start_year % 100)::text, 2, '0') || '-' || lpad((v_end_year % 100)::text, 2, '0');
end;
$$;

create or replace function public.generate_transport_client_bill_no(p_division_id uuid, p_bill_date date)
returns text
language plpgsql
as $$
declare
  v_fy text;
  v_next_number integer;
begin
  if p_division_id is null then
    raise exception 'division_id is required';
  end if;
  if p_bill_date is null then
    raise exception 'bill_date is required';
  end if;

  v_fy := public.get_transport_financial_year_label(p_bill_date);

  insert into public.transport_client_bill_number_sequences (division_id, financial_year_label, last_number)
  values (p_division_id, v_fy, 1)
  on conflict (division_id, financial_year_label)
  do update
    set last_number = public.transport_client_bill_number_sequences.last_number + 1,
        updated_at = now()
  returning last_number into v_next_number;

  return 'CB/' || v_fy || '/' || lpad(v_next_number::text, 4, '0');
end;
$$;

create or replace function public.list_transport_client_billable_trips(p_division_id uuid, p_transport_client_id uuid)
returns table (
  trip_id uuid,
  trip_no text,
  trip_date date,
  quantity_mt numeric,
  client_rate_per_mt numeric,
  client_gross_amount numeric,
  support_deduction_amount numeric,
  client_net_receivable numeric
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
         round(((coalesce(t.quantity_mt, 0) * coalesce(t.client_rate_per_mt, 0)) - coalesce(et.support_deduction_amount, 0))::numeric, 2) as client_net_receivable
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
      remarks
    )
    select p_division_id,
           v_bill_no,
           p_transport_client_id,
           p_bill_date,
           'generated',
           round(sum(client_gross_amount)::numeric, 2),
           round(sum(support_deduction_amount)::numeric, 2),
           round(sum(client_net_receivable)::numeric, 2),
           nullif(btrim(coalesce(p_remarks, '')), '')
    from eligible
    returning public.transport_client_bills.id as bill_id,
              public.transport_client_bills.bill_no as bill_no,
              public.transport_client_bills.gross_total as gross_total,
              public.transport_client_bills.support_deduction_total as support_deduction_total,
              public.transport_client_bills.net_receivable as net_receivable
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
         b.net_receivable as net_receivable
  from public.transport_client_bills b
  where b.id = v_bill_id;
end;
$$;

alter table public.transport_client_bill_number_sequences enable row level security;
alter table public.transport_client_bills enable row level security;
alter table public.transport_client_bill_trips enable row level security;

do $$ begin
  create policy transport_client_bill_number_sequences_auth_rw on public.transport_client_bill_number_sequences
  for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy transport_client_bills_auth_rw on public.transport_client_bills
  for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy transport_client_bill_trips_auth_rw on public.transport_client_bill_trips
  for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;