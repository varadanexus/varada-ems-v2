-- Sprint 6E.10.5: make transport_agent_id canonical for truck-agent mapping

alter table public.transport_truck_agent_commission_mapping
  add column if not exists transport_agent_id uuid references public.transport_agents(id);

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
   or coalesce(ta.contact_no, '') = coalesce(ma.contact_no, '')
 )
where cm.agent_id = ma.id
  and cm.transport_agent_id is null;

alter table public.transport_truck_agent_commission_mapping
  alter column agent_id drop not null;