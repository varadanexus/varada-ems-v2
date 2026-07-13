-- Sprint 7B: Transporter Statement foundation

create table if not exists public.transport_transporter_statement_number_sequences (
  division_id uuid not null references public.divisions(id),
  financial_year_label text not null,
  last_number integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (division_id, financial_year_label)
);

create table if not exists public.transport_transporter_statements (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id),
  statement_no text not null,
  transport_transporter_id uuid not null references public.transport_transporters(id),
  statement_date date not null,
  status text not null default 'draft',
  gross_payable_total numeric(14,2) not null default 0,
  support_deduction_total numeric(14,2) not null default 0,
  net_payable_total numeric(14,2) not null default 0,
  remarks text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.transport_transporter_statement_trips (
  id uuid primary key default gen_random_uuid(),
  statement_id uuid not null references public.transport_transporter_statements(id) on delete cascade,
  trip_id uuid not null references public.transport_trips(id),
  trip_no text not null,
  trip_date date,
  quantity_mt numeric(12,3) not null default 0,
  transporter_rate_per_mt numeric(12,3) not null default 0,
  transporter_gross_payable numeric(14,2) not null default 0,
  support_deduction_amount numeric(14,2) not null default 0,
  transporter_net_payable numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

do $$ begin
  alter table public.transport_transporter_statements
    add constraint chk_transport_transporter_statements_status
    check (status in ('draft', 'approved', 'cancelled'));
exception when duplicate_object then null; end $$;

create unique index if not exists uq_transport_transporter_statements_division_no_active
  on public.transport_transporter_statements(division_id, statement_no)
  where deleted_at is null;

create unique index if not exists uq_transport_transporter_statement_trips_trip_active
  on public.transport_transporter_statement_trips(trip_id)
  where deleted_at is null;

create index if not exists idx_transport_transporter_statements_transporter_date
  on public.transport_transporter_statements(transport_transporter_id, statement_date desc)
  where deleted_at is null;

create or replace function public.generate_transport_transporter_statement_no(p_division_id uuid, p_statement_date date)
returns text
language plpgsql
as $$
declare
  v_fy text;
  v_next_number integer;
begin
  if p_division_id is null then raise exception 'division_id is required'; end if;
  if p_statement_date is null then raise exception 'statement_date is required'; end if;
  v_fy := public.get_transport_financial_year_label(p_statement_date);
  insert into public.transport_transporter_statement_number_sequences (division_id, financial_year_label, last_number)
  values (p_division_id, v_fy, 1)
  on conflict (division_id, financial_year_label)
  do update set last_number = public.transport_transporter_statement_number_sequences.last_number + 1, updated_at = now()
  returning last_number into v_next_number;
  return 'TS/' || v_fy || '/' || lpad(v_next_number::text, 4, '0');
end;
$$;

create or replace function public.list_transport_transporter_statementable_trips(p_division_id uuid, p_transport_transporter_id uuid)
returns table (
  trip_id uuid,
  trip_no text,
  trip_date date,
  quantity_mt numeric,
  transporter_rate_per_mt numeric,
  transporter_gross_payable numeric,
  support_deduction_amount numeric,
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
         t.trip_no as trip_no,
         t.trip_date as trip_date,
         round(coalesce(t.quantity_mt, 0)::numeric, 3) as quantity_mt,
         round(coalesce(t.transporter_rate_per_mt, 0)::numeric, 3) as transporter_rate_per_mt,
         round((coalesce(t.quantity_mt, 0) * coalesce(t.transporter_rate_per_mt, 0))::numeric, 2) as transporter_gross_payable,
         coalesce(et.support_deduction_amount, 0)::numeric(14,2) as support_deduction_amount,
         round(((coalesce(t.quantity_mt, 0) * coalesce(t.transporter_rate_per_mt, 0)) - coalesce(et.support_deduction_amount, 0))::numeric, 2) as transporter_net_payable
  from public.transport_trips t
  left join expense_totals et on et.trip_id = t.id
  where t.deleted_at is null
    and t.division_id = p_division_id
    and t.transport_transporter_id = p_transport_transporter_id
    and t.status in ('completed', 'financial_review')
    and not exists (
      select 1
      from public.transport_transporter_statement_trips st
      join public.transport_transporter_statements s
        on s.id = st.statement_id
       and s.deleted_at is null
       and s.status <> 'cancelled'
      where st.trip_id = t.id
        and st.deleted_at is null
    )
  order by t.trip_date asc, t.trip_no asc;
$$;

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

  select count(distinct trip_id) into v_requested_count from unnest(p_trip_ids) as trip_id;
  with eligible as (
    select * from public.list_transport_transporter_statementable_trips(p_division_id, p_transport_transporter_id)
    where trip_id = any(p_trip_ids)
  )
  select count(*) into v_eligible_count from eligible;
  if v_eligible_count <> v_requested_count then raise exception 'One or more selected trips are no longer eligible for transporter statement'; end if;

  v_statement_no := public.generate_transport_transporter_statement_no(p_division_id, p_statement_date);

  with eligible as (
    select * from public.list_transport_transporter_statementable_trips(p_division_id, p_transport_transporter_id)
    where trip_id = any(p_trip_ids)
  ), inserted_statement as (
    insert into public.transport_transporter_statements (
      division_id, statement_no, transport_transporter_id, statement_date, status,
      gross_payable_total, support_deduction_total, net_payable_total, remarks
    )
    select p_division_id, v_statement_no, p_transport_transporter_id, p_statement_date, 'draft',
           round(sum(transporter_gross_payable)::numeric, 2),
           round(sum(support_deduction_amount)::numeric, 2),
           round(sum(transporter_net_payable)::numeric, 2),
           nullif(btrim(coalesce(p_remarks, '')), '')
    from eligible
    returning public.transport_transporter_statements.id as statement_id,
              public.transport_transporter_statements.statement_no as statement_no,
              public.transport_transporter_statements.gross_payable_total as gross_payable_total,
              public.transport_transporter_statements.support_deduction_total as support_deduction_total,
              public.transport_transporter_statements.net_payable_total as net_payable_total
  )
  select inserted_statement.statement_id into v_statement_id from inserted_statement;

  insert into public.transport_transporter_statement_trips (
    statement_id, trip_id, trip_no, trip_date, quantity_mt, transporter_rate_per_mt,
    transporter_gross_payable, support_deduction_amount, transporter_net_payable
  )
  select v_statement_id, e.trip_id, e.trip_no, e.trip_date, e.quantity_mt, e.transporter_rate_per_mt,
         e.transporter_gross_payable, e.support_deduction_amount, e.transporter_net_payable
  from public.list_transport_transporter_statementable_trips(p_division_id, p_transport_transporter_id) e
  where e.trip_id = any(p_trip_ids);

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

alter table public.transport_transporter_statement_number_sequences enable row level security;
alter table public.transport_transporter_statements enable row level security;
alter table public.transport_transporter_statement_trips enable row level security;

do $$ begin
  create policy transport_transporter_statement_number_sequences_auth_rw on public.transport_transporter_statement_number_sequences for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy transport_transporter_statements_auth_rw on public.transport_transporter_statements for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy transport_transporter_statement_trips_auth_rw on public.transport_transporter_statement_trips for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;