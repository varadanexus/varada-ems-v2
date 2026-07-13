-- Transportation Trip Expenses Foundation

create table if not exists public.transport_trip_expense_sequences (
  division_id uuid not null references public.divisions(id),
  yymm text not null,
  last_seq integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (division_id, yymm)
);

create or replace function public.generate_transport_trip_expense_no(p_division_id uuid)
returns text
language plpgsql
as $$
declare
  v_yymm text;
  v_seq integer;
begin
  if p_division_id is null then
    raise exception 'division_id is required for expense number generation';
  end if;

  v_yymm := to_char(current_date, 'YYMM');

  insert into public.transport_trip_expense_sequences (division_id, yymm, last_seq)
  values (p_division_id, v_yymm, 1)
  on conflict (division_id, yymm)
  do update set last_seq = public.transport_trip_expense_sequences.last_seq + 1,
                updated_at = now()
  returning last_seq into v_seq;

  return 'EX' || v_yymm || lpad(v_seq::text, 3, '0');
end;
$$;

create table if not exists public.transport_trip_expenses (
  id uuid primary key default gen_random_uuid(),
  division_id uuid references public.divisions(id),
  trip_id uuid not null references public.transport_trips(id),
  expense_no text unique,
  expense_date date not null,
  category text not null,
  amount numeric not null check (amount >= 0),
  paid_by text not null,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_transport_trip_expenses_trip_id on public.transport_trip_expenses(trip_id);
create index if not exists idx_transport_trip_expenses_division_id on public.transport_trip_expenses(division_id);
create index if not exists idx_transport_trip_expenses_date on public.transport_trip_expenses(expense_date);
create index if not exists idx_transport_trip_expenses_deleted_at on public.transport_trip_expenses(deleted_at);

create or replace function public.before_ins_transport_trip_expenses_set_no()
returns trigger
language plpgsql
as $$
begin
  if new.expense_no is null or btrim(new.expense_no) = '' then
    new.expense_no := public.generate_transport_trip_expense_no(new.division_id);
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_before_ins_transport_trip_expenses_set_no on public.transport_trip_expenses;
create trigger trg_before_ins_transport_trip_expenses_set_no
before insert on public.transport_trip_expenses
for each row execute function public.before_ins_transport_trip_expenses_set_no();

alter table public.transport_trip_expenses enable row level security;

do $$ begin
  create policy transport_trip_expenses_auth_rw on public.transport_trip_expenses
  for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

insert into public.permissions (module_code, action_code, label, is_active)
select 'transport-trip-expenses', a.action_code,
       'Transport Trip Expenses ' || initcap(a.action_code), true
from (values ('view'), ('edit')) as a(action_code)
where not exists (
  select 1 from public.permissions p
  where p.module_code = 'transport-trip-expenses'
    and p.action_code = a.action_code
);

insert into public.role_permissions (role_id, permission_id, allow)
select r.id, p.id, true
from public.roles r
join public.permissions p
  on p.module_code = 'transport-trip-expenses'
 and p.action_code in ('view', 'edit')
where r.code = 'super_admin'
  and not exists (
    select 1 from public.role_permissions rp
    where rp.role_id = r.id
      and rp.permission_id = p.id
  );
