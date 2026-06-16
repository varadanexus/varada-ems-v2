-- Sprint 9B.6: Transportation RLS hardening phase 1
-- Scope limited to:
--   transport_clients
--   transport_transporters
--   transport_drivers
--   transport_trucks
--   transport_rate_master
--   transport_truck_agent_commission_mapping

create or replace function public.has_division_access_by_id(p_division_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.divisions d
    where d.id = p_division_id
      and public.has_division_access(d.code)
  );
$$;

grant execute on function public.has_division_access_by_id(uuid) to authenticated;

alter table public.transport_clients enable row level security;
alter table public.transport_transporters enable row level security;
alter table public.transport_drivers enable row level security;
alter table public.transport_trucks enable row level security;
alter table public.transport_rate_master enable row level security;
alter table public.transport_truck_agent_commission_mapping enable row level security;

drop policy if exists "auth rw transport_drivers" on public.transport_drivers;
drop policy if exists "auth rw transport_trucks" on public.transport_trucks;
drop policy if exists "auth rw transport_rate_master" on public.transport_rate_master;

drop policy if exists "transport_clients_select_hardened" on public.transport_clients;
drop policy if exists "transport_clients_write_hardened" on public.transport_clients;
create policy "transport_clients_select_hardened" on public.transport_clients
for select to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-clients', 'view')
    and public.has_division_access_by_id(division_id)
  )
);

create policy "transport_clients_write_hardened" on public.transport_clients
for all to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-clients', 'edit')
    and public.has_division_access_by_id(division_id)
  )
)
with check (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-clients', 'edit')
    and public.has_division_access_by_id(division_id)
  )
);

drop policy if exists "transport_transporters_select_hardened" on public.transport_transporters;
drop policy if exists "transport_transporters_write_hardened" on public.transport_transporters;
create policy "transport_transporters_select_hardened" on public.transport_transporters
for select to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-transporters', 'view')
    and public.has_division_access_by_id(division_id)
  )
);

create policy "transport_transporters_write_hardened" on public.transport_transporters
for all to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-transporters', 'edit')
    and public.has_division_access_by_id(division_id)
  )
)
with check (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-transporters', 'edit')
    and public.has_division_access_by_id(division_id)
  )
);

drop policy if exists "transport_drivers_select_hardened" on public.transport_drivers;
drop policy if exists "transport_drivers_write_hardened" on public.transport_drivers;
create policy "transport_drivers_select_hardened" on public.transport_drivers
for select to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-drivers', 'view')
    and public.has_division_access_by_id(division_id)
  )
);

create policy "transport_drivers_write_hardened" on public.transport_drivers
for all to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-drivers', 'edit')
    and public.has_division_access_by_id(division_id)
  )
)
with check (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-drivers', 'edit')
    and public.has_division_access_by_id(division_id)
  )
);

drop policy if exists "transport_trucks_select_hardened" on public.transport_trucks;
drop policy if exists "transport_trucks_write_hardened" on public.transport_trucks;
create policy "transport_trucks_select_hardened" on public.transport_trucks
for select to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-trucks', 'view')
    and public.has_division_access_by_id(division_id)
  )
);

create policy "transport_trucks_write_hardened" on public.transport_trucks
for all to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-trucks', 'edit')
    and public.has_division_access_by_id(division_id)
  )
)
with check (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-trucks', 'edit')
    and public.has_division_access_by_id(division_id)
  )
);

drop policy if exists "transport_rate_master_select_hardened" on public.transport_rate_master;
drop policy if exists "transport_rate_master_write_hardened" on public.transport_rate_master;
create policy "transport_rate_master_select_hardened" on public.transport_rate_master
for select to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-rate-master', 'view')
    and public.has_division_access_by_id(division_id)
  )
);

create policy "transport_rate_master_write_hardened" on public.transport_rate_master
for all to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-rate-master', 'edit')
    and public.has_division_access_by_id(division_id)
  )
)
with check (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-rate-master', 'edit')
    and public.has_division_access_by_id(division_id)
  )
);

drop policy if exists "transport_truck_agent_commission_mapping_select_hardened" on public.transport_truck_agent_commission_mapping;
drop policy if exists "transport_truck_agent_commission_mapping_write_hardened" on public.transport_truck_agent_commission_mapping;
create policy "transport_truck_agent_commission_mapping_select_hardened" on public.transport_truck_agent_commission_mapping
for select to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-truck-agent-commission-mapping', 'view')
    and public.has_division_access_by_id(division_id)
  )
);

create policy "transport_truck_agent_commission_mapping_write_hardened" on public.transport_truck_agent_commission_mapping
for all to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-truck-agent-commission-mapping', 'edit')
    and public.has_division_access_by_id(division_id)
  )
)
with check (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-truck-agent-commission-mapping', 'edit')
    and public.has_division_access_by_id(division_id)
  )
);