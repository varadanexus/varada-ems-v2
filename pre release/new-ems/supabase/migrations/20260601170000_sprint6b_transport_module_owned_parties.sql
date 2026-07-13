-- Sprint 6B: Transportation module-owned parties + safe migration path from global masters

-- 1) Canonical TRANSPORT division should exist
insert into public.divisions (code, name, is_active)
values ('TRANSPORT', 'Transportation', true)
on conflict (code) do update set name = excluded.name, is_active = true;

-- 2) Module-owned party tables (non-destructive)
create table if not exists public.transport_clients (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id),
  code text,
  name text not null,
  gstin text,
  contact_no text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.transport_transporters (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id),
  code text,
  name text not null,
  contact_no text,
  gstin text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.transport_agents (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id),
  code text,
  name text not null,
  contact_no text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.transport_commodities (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id),
  code text,
  name text not null,
  hsn_code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_transport_clients_division on public.transport_clients(division_id);
create index if not exists idx_transport_clients_deleted_at on public.transport_clients(deleted_at);
create unique index if not exists uq_transport_clients_div_code_active on public.transport_clients(division_id, code) where deleted_at is null and code is not null;

create index if not exists idx_transport_transporters_division on public.transport_transporters(division_id);
create index if not exists idx_transport_transporters_deleted_at on public.transport_transporters(deleted_at);
create unique index if not exists uq_transport_transporters_div_code_active on public.transport_transporters(division_id, code) where deleted_at is null and code is not null;

create index if not exists idx_transport_agents_division on public.transport_agents(division_id);
create index if not exists idx_transport_agents_deleted_at on public.transport_agents(deleted_at);
create unique index if not exists uq_transport_agents_div_code_active on public.transport_agents(division_id, code) where deleted_at is null and code is not null;

create index if not exists idx_transport_commodities_division on public.transport_commodities(division_id);
create index if not exists idx_transport_commodities_deleted_at on public.transport_commodities(deleted_at);
create unique index if not exists uq_transport_commodities_div_code_active on public.transport_commodities(division_id, code) where deleted_at is null and code is not null;

-- 3) Auto-code triggers
create or replace function public.before_ins_transport_clients_code()
returns trigger language plpgsql as $$ begin
  if coalesce(new.code,'') = '' then new.code := public.next_transport_code('transport_client','TCL'); end if;
  return new;
end $$;
drop trigger if exists trg_before_ins_transport_clients_code on public.transport_clients;
create trigger trg_before_ins_transport_clients_code before insert on public.transport_clients for each row execute function public.before_ins_transport_clients_code();

create or replace function public.before_ins_transport_transporters_code()
returns trigger language plpgsql as $$ begin
  if coalesce(new.code,'') = '' then new.code := public.next_transport_code('transport_transporter','TPR'); end if;
  return new;
end $$;
drop trigger if exists trg_before_ins_transport_transporters_code on public.transport_transporters;
create trigger trg_before_ins_transport_transporters_code before insert on public.transport_transporters for each row execute function public.before_ins_transport_transporters_code();

create or replace function public.before_ins_transport_agents_code()
returns trigger language plpgsql as $$ begin
  if coalesce(new.code,'') = '' then new.code := public.next_transport_code('transport_agent','TAG'); end if;
  return new;
end $$;
drop trigger if exists trg_before_ins_transport_agents_code on public.transport_agents;
create trigger trg_before_ins_transport_agents_code before insert on public.transport_agents for each row execute function public.before_ins_transport_agents_code();

create or replace function public.before_ins_transport_commodities_code()
returns trigger language plpgsql as $$ begin
  if coalesce(new.code,'') = '' then new.code := public.next_transport_code('transport_commodity','TCO'); end if;
  return new;
end $$;
drop trigger if exists trg_before_ins_transport_commodities_code on public.transport_commodities;
create trigger trg_before_ins_transport_commodities_code before insert on public.transport_commodities for each row execute function public.before_ins_transport_commodities_code();

-- 4) Safe backfill from global masters into transport-owned party tables (by name/code) for canonical TRANSPORT
with td as (
  select id from public.divisions where code = 'TRANSPORT' limit 1
)
insert into public.transport_clients (division_id, code, name, gstin, is_active)
select td.id, mc.code, mc.name, mc.gstin, coalesce(mc.is_active, true)
from td, public.master_clients mc
where mc.deleted_at is null
  and not exists (
    select 1 from public.transport_clients tc
    where tc.division_id = td.id and tc.deleted_at is null and (tc.code = mc.code or lower(tc.name) = lower(mc.name))
  );

with td as (
  select id from public.divisions where code = 'TRANSPORT' limit 1
)
insert into public.transport_transporters (division_id, code, name, contact_no, gstin, is_active)
select td.id, mt.code, mt.name, mt.contact_no, null, coalesce(mt.is_active, true)
from td, public.master_transporters mt
where mt.deleted_at is null
  and not exists (
    select 1 from public.transport_transporters tt
    where tt.division_id = td.id and tt.deleted_at is null and (tt.code = mt.code or lower(tt.name) = lower(mt.name))
  );

with td as (
  select id from public.divisions where code = 'TRANSPORT' limit 1
)
insert into public.transport_agents (division_id, code, name, contact_no, is_active)
select td.id, ma.code, ma.name, ma.contact_no, coalesce(ma.is_active, true)
from td, public.master_agents ma
where ma.deleted_at is null
  and not exists (
    select 1 from public.transport_agents ta
    where ta.division_id = td.id and ta.deleted_at is null and (ta.code = ma.code or lower(ta.name) = lower(ma.name))
  );

with td as (
  select id from public.divisions where code = 'TRANSPORT' limit 1
)
insert into public.transport_commodities (division_id, code, name, hsn_code, is_active)
select td.id, mc.code, mc.name, mc.hsn_code, coalesce(mc.is_active, true)
from td, public.master_commodities mc
where mc.deleted_at is null
  and not exists (
    select 1 from public.transport_commodities tc
    where tc.division_id = td.id and tc.deleted_at is null and (tc.code = mc.code or lower(tc.name) = lower(mc.name))
  );

-- 5) Add new nullable FK columns on transport transactional tables (non-destructive)
alter table public.transport_trips add column if not exists transport_client_id uuid references public.transport_clients(id);
alter table public.transport_trips add column if not exists transport_transporter_id uuid references public.transport_transporters(id);
alter table public.transport_trips add column if not exists transport_commodity_id uuid references public.transport_commodities(id);

alter table public.transport_rate_master add column if not exists transport_client_id uuid references public.transport_clients(id);
alter table public.transport_rate_master add column if not exists transport_transporter_id uuid references public.transport_transporters(id);
alter table public.transport_rate_master add column if not exists transport_commodity_id uuid references public.transport_commodities(id);
alter table public.transport_rate_master add column if not exists transport_agent_id uuid references public.transport_agents(id);

alter table public.transport_client_mapping add column if not exists transport_client_id uuid references public.transport_clients(id);
alter table public.transport_client_mapping add column if not exists transport_commodity_id uuid references public.transport_commodities(id);

alter table public.transport_transporter_mapping add column if not exists transport_transporter_id uuid references public.transport_transporters(id);
alter table public.transport_transporter_mapping add column if not exists transport_commodity_id uuid references public.transport_commodities(id);

alter table public.transport_truck_agent_commission_mapping add column if not exists transport_agent_id uuid references public.transport_agents(id);
alter table public.transport_trucks add column if not exists transport_transporter_id uuid references public.transport_transporters(id);
alter table public.transport_drivers add column if not exists transport_transporter_id uuid references public.transport_transporters(id);

-- 6) Safe best-effort backfill by code/name matching
with td as (select id from public.divisions where code = 'TRANSPORT' limit 1)
update public.transport_trips t
set transport_client_id = tc.id
from public.master_clients mc
join public.transport_clients tc on tc.division_id = (select id from td) and tc.deleted_at is null and (tc.code = mc.code or lower(tc.name)=lower(mc.name))
where t.client_id = mc.id and t.transport_client_id is null;

with td as (select id from public.divisions where code = 'TRANSPORT' limit 1)
update public.transport_trips t
set transport_transporter_id = tt.id
from public.master_transporters mt
join public.transport_transporters tt on tt.division_id = (select id from td) and tt.deleted_at is null and (tt.code = mt.code or lower(tt.name)=lower(mt.name))
where t.transporter_id = mt.id and t.transport_transporter_id is null;

with td as (select id from public.divisions where code = 'TRANSPORT' limit 1)
update public.transport_trips t
set transport_commodity_id = tc.id
from public.master_commodities mc
join public.transport_commodities tc on tc.division_id = (select id from td) and tc.deleted_at is null and (tc.code = mc.code or lower(tc.name)=lower(mc.name))
where t.commodity_id = mc.id and t.transport_commodity_id is null;

-- Division cleanup guidance (non-destructive by default):
-- Identify duplicate transportation divisions and inactivate only zero-reference duplicates manually after validation.
