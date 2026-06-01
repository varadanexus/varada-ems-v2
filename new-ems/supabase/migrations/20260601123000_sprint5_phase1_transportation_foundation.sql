-- Sprint 5 Phase 1: Transportation foundation masters only

create table if not exists public.transport_truck_owners (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id),
  code text not null,
  name text not null,
  phone text,
  gstin text,
  pan text,
  bank_details text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (division_id, code)
);

create table if not exists public.transport_trucks (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id),
  code text not null,
  name text not null,
  owner_id uuid references public.transport_truck_owners(id),
  transporter_id uuid references public.master_transporters(id),
  registration_no text,
  capacity_mt numeric(12,3),
  permit_expiry date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (division_id, code)
);

create table if not exists public.transport_drivers (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id),
  code text not null,
  name text not null,
  phone text,
  license_no text,
  license_expiry date,
  transporter_id uuid references public.master_transporters(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (division_id, code)
);

create table if not exists public.transport_route_master (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id),
  code text not null,
  name text not null,
  from_location text,
  to_location text,
  distance_km numeric(12,3),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (division_id, code)
);

create table if not exists public.transport_rate_master (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id),
  code text not null,
  name text not null,
  rate_type text not null,
  client_id uuid references public.master_clients(id),
  transporter_id uuid references public.master_transporters(id),
  route_id uuid references public.transport_route_master(id),
  commodity_id uuid references public.master_commodities(id),
  rate_per_mt numeric(14,2),
  effective_from date,
  effective_to date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (division_id, code)
);

create table if not exists public.transport_client_mapping (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id),
  code text not null,
  name text not null,
  client_id uuid not null references public.master_clients(id),
  route_id uuid references public.transport_route_master(id),
  commodity_id uuid references public.master_commodities(id),
  default_rate_id uuid references public.transport_rate_master(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (division_id, code)
);

create table if not exists public.transport_transporter_mapping (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id),
  code text not null,
  name text not null,
  transporter_id uuid not null references public.master_transporters(id),
  truck_id uuid references public.transport_trucks(id),
  route_id uuid references public.transport_route_master(id),
  commodity_id uuid references public.master_commodities(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (division_id, code)
);

create index if not exists idx_transport_truck_owners_deleted_at on public.transport_truck_owners(deleted_at);
create index if not exists idx_transport_trucks_deleted_at on public.transport_trucks(deleted_at);
create index if not exists idx_transport_drivers_deleted_at on public.transport_drivers(deleted_at);
create index if not exists idx_transport_route_master_deleted_at on public.transport_route_master(deleted_at);
create index if not exists idx_transport_rate_master_deleted_at on public.transport_rate_master(deleted_at);
create index if not exists idx_transport_client_mapping_deleted_at on public.transport_client_mapping(deleted_at);
create index if not exists idx_transport_transporter_mapping_deleted_at on public.transport_transporter_mapping(deleted_at);

alter table public.transport_truck_owners enable row level security;
alter table public.transport_trucks enable row level security;
alter table public.transport_drivers enable row level security;
alter table public.transport_route_master enable row level security;
alter table public.transport_rate_master enable row level security;
alter table public.transport_client_mapping enable row level security;
alter table public.transport_transporter_mapping enable row level security;

drop policy if exists "auth rw transport_truck_owners" on public.transport_truck_owners;
create policy "auth rw transport_truck_owners" on public.transport_truck_owners for all to authenticated using (true) with check (true);
drop policy if exists "auth rw transport_trucks" on public.transport_trucks;
create policy "auth rw transport_trucks" on public.transport_trucks for all to authenticated using (true) with check (true);
drop policy if exists "auth rw transport_drivers" on public.transport_drivers;
create policy "auth rw transport_drivers" on public.transport_drivers for all to authenticated using (true) with check (true);
drop policy if exists "auth rw transport_route_master" on public.transport_route_master;
create policy "auth rw transport_route_master" on public.transport_route_master for all to authenticated using (true) with check (true);
drop policy if exists "auth rw transport_rate_master" on public.transport_rate_master;
create policy "auth rw transport_rate_master" on public.transport_rate_master for all to authenticated using (true) with check (true);
drop policy if exists "auth rw transport_client_mapping" on public.transport_client_mapping;
create policy "auth rw transport_client_mapping" on public.transport_client_mapping for all to authenticated using (true) with check (true);
drop policy if exists "auth rw transport_transporter_mapping" on public.transport_transporter_mapping;
create policy "auth rw transport_transporter_mapping" on public.transport_transporter_mapping for all to authenticated using (true) with check (true);