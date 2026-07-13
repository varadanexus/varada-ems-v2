-- Sprint 6A: Trip operations foundation

create table if not exists public.transport_trips (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id),
  trip_no text not null,
  status text not null default 'draft',
  trip_date date not null default current_date,
  client_id uuid references public.master_clients(id),
  transporter_id uuid references public.master_transporters(id),
  truck_id uuid references public.transport_trucks(id),
  driver_id uuid references public.transport_drivers(id),
  route_id uuid references public.transport_route_master(id),
  commodity_id uuid references public.master_commodities(id),
  quantity_mt numeric(12,3),
  notes text,
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_transport_trips_division_trip_no_active
on public.transport_trips (division_id, trip_no)
where deleted_at is null;

create index if not exists idx_transport_trips_status on public.transport_trips(status) where deleted_at is null;
create index if not exists idx_transport_trips_deleted_at on public.transport_trips(deleted_at);

create table if not exists public.transport_trip_timeline (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.transport_trips(id) on delete cascade,
  status text not null,
  remarks text,
  changed_by uuid references public.app_users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_transport_trip_timeline_trip on public.transport_trip_timeline(trip_id, created_at desc);

alter table public.transport_trips enable row level security;
alter table public.transport_trip_timeline enable row level security;

do $$ begin
  create policy transport_trips_auth_rw on public.transport_trips for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy transport_trip_timeline_auth_rw on public.transport_trip_timeline for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;