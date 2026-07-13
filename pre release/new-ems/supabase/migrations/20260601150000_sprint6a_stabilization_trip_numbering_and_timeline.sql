-- Sprint 6A stabilization: server-side trip numbering + status constraints + auto timeline

create table if not exists public.transport_trip_number_sequences (
  division_id uuid not null references public.divisions(id),
  yymm text not null,
  last_seq integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (division_id, yymm)
);

create or replace function public.generate_transport_trip_no(p_division_id uuid)
returns text
language plpgsql
as $$
declare
  v_yymm text;
  v_seq integer;
begin
  if p_division_id is null then
    raise exception 'division_id is required for trip number generation';
  end if;

  v_yymm := to_char(current_date, 'YYMM');

  insert into public.transport_trip_number_sequences (division_id, yymm, last_seq)
  values (p_division_id, v_yymm, 1)
  on conflict (division_id, yymm)
  do update set last_seq = public.transport_trip_number_sequences.last_seq + 1,
                updated_at = now()
  returning last_seq into v_seq;

  return 'TR' || v_yymm || lpad(v_seq::text, 3, '0');
end;
$$;

do $$ begin
  alter table public.transport_trips
    add constraint chk_transport_trips_status
    check (status in ('draft','assigned','dispatched','loading','loaded','in_transit','unloading','completed','financial_review'));
exception when duplicate_object then null; end $$;

create or replace function public.before_ins_transport_trips_set_trip_no()
returns trigger
language plpgsql
as $$
begin
  if new.trip_no is null or btrim(new.trip_no) = '' then
    new.trip_no := public.generate_transport_trip_no(new.division_id);
  end if;
  new.status := coalesce(new.status, 'draft');
  return new;
end;
$$;

drop trigger if exists trg_before_ins_transport_trips_set_trip_no on public.transport_trips;
create trigger trg_before_ins_transport_trips_set_trip_no
before insert on public.transport_trips
for each row execute function public.before_ins_transport_trips_set_trip_no();

create or replace function public.after_ins_upd_transport_trips_timeline()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.transport_trip_timeline (trip_id, status, remarks)
    values (new.id, new.status, 'Status initialized');
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.transport_trip_timeline (trip_id, status, remarks)
    values (new.id, new.status, 'Status changed');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_after_ins_upd_transport_trips_timeline on public.transport_trips;
create trigger trg_after_ins_upd_transport_trips_timeline
after insert or update on public.transport_trips
for each row execute function public.after_ins_upd_transport_trips_timeline();