-- Sprint 6E.6: align Truck Master with module-owned transporter as operator/owner

alter table public.transport_trucks
  add column if not exists transport_transporter_id uuid references public.transport_transporters(id);

with td as (
  select id from public.divisions where code = 'TRANSPORT' limit 1
)
update public.transport_trucks trk
set transport_transporter_id = tt.id
from public.master_transporters mt
join public.transport_transporters tt
  on tt.division_id = (select id from td)
 and tt.deleted_at is null
 and (tt.code = mt.code or lower(tt.name) = lower(mt.name))
where trk.transporter_id = mt.id
  and trk.transport_transporter_id is null;

alter table public.transport_trucks
  alter column owner_id drop not null;
