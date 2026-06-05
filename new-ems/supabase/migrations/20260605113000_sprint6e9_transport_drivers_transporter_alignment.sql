-- Sprint 6E.9: align drivers with module-owned transport transporters

alter table public.transport_drivers
  add column if not exists transport_transporter_id uuid references public.transport_transporters(id);

with td as (
  select id from public.divisions where code = 'TRANSPORT' limit 1
)
update public.transport_drivers drv
set transport_transporter_id = tt.id
from public.master_transporters mt
join public.transport_transporters tt
  on tt.division_id = (select id from td)
 and tt.deleted_at is null
 and (
      tt.code = mt.code
   or lower(tt.name) = lower(mt.name)
   or coalesce(tt.contact_no, '') = coalesce(mt.contact_no, '')
 )
where drv.transporter_id = mt.id
  and drv.transport_transporter_id is null;