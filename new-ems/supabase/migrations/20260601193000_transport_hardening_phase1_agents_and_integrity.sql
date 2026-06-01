-- Transportation Hardening Phase 1
-- Non-destructive: keep legacy columns/FKs, add transport-owned agent path + integrity indexes/view.

-- 1) transport_rate_master: ensure transport_agent_id exists + indexed
alter table public.transport_rate_master
  add column if not exists transport_agent_id uuid references public.transport_agents(id);

create index if not exists idx_transport_rate_master_transport_agent_id
  on public.transport_rate_master(transport_agent_id);

-- Best-effort backfill: legacy agent_id(master_agents) -> transport_agent_id(transport_agents)
-- Match by code first, then case-insensitive name, scoped to canonical TRANSPORT division.
with td as (
  select id from public.divisions where code = 'TRANSPORT' limit 1
)
update public.transport_rate_master rm
set transport_agent_id = ta.id
from public.master_agents ma
join public.transport_agents ta
  on ta.division_id = (select id from td)
 and ta.deleted_at is null
 and (
   (ta.code is not null and ma.code is not null and ta.code = ma.code)
   or lower(ta.name) = lower(ma.name)
 )
where rm.agent_id = ma.id
  and rm.transport_agent_id is null;

-- 2) transport_truck_agent_commission_mapping: ensure transport_agent_id indexed + backfilled
alter table public.transport_truck_agent_commission_mapping
  add column if not exists transport_agent_id uuid references public.transport_agents(id);

create index if not exists idx_transport_truck_agent_commission_transport_agent_id
  on public.transport_truck_agent_commission_mapping(transport_agent_id);

with td as (
  select id from public.divisions where code = 'TRANSPORT' limit 1
)
update public.transport_truck_agent_commission_mapping cm
set transport_agent_id = ta.id
from public.master_agents ma
join public.transport_agents ta
  on ta.division_id = (select id from td)
 and ta.deleted_at is null
 and (
   (ta.code is not null and ma.code is not null and ta.code = ma.code)
   or lower(ta.name) = lower(ma.name)
 )
where cm.agent_id = ma.id
  and cm.transport_agent_id is null;

-- 3) Mapping uniqueness hardening (active rows only)
create unique index if not exists uq_transport_client_mapping_active_business
  on public.transport_client_mapping(division_id, transport_client_id, route_id, transport_commodity_id)
  where deleted_at is null;

create unique index if not exists uq_transport_transporter_mapping_active_business
  on public.transport_transporter_mapping(division_id, transport_transporter_id, truck_id, route_id, transport_commodity_id)
  where deleted_at is null;

create unique index if not exists uq_transport_truck_agent_commission_active_business
  on public.transport_truck_agent_commission_mapping(division_id, truck_id, transport_agent_id, commission_type, effective_from)
  where deleted_at is null;

-- 4) Diagnostic integrity view: legacy/new agent usage state per table
create or replace view public.transport_integrity_report as
select
  'transport_rate_master'::text as table_name,
  count(*) filter (where agent_id is not null and transport_agent_id is null) as legacy_only,
  count(*) filter (where agent_id is null and transport_agent_id is not null) as transport_only,
  count(*) filter (where agent_id is not null and transport_agent_id is not null) as both,
  count(*) filter (where agent_id is null and transport_agent_id is null) as neither,
  count(*) as total_rows
from public.transport_rate_master
where deleted_at is null

union all

select
  'transport_truck_agent_commission_mapping'::text as table_name,
  count(*) filter (where agent_id is not null and transport_agent_id is null) as legacy_only,
  count(*) filter (where agent_id is null and transport_agent_id is not null) as transport_only,
  count(*) filter (where agent_id is not null and transport_agent_id is not null) as both,
  count(*) filter (where agent_id is null and transport_agent_id is null) as neither,
  count(*) as total_rows
from public.transport_truck_agent_commission_mapping
where deleted_at is null;
