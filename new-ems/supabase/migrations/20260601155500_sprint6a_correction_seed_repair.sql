-- Sprint 6A correction seed repair: idempotent usable transportation flow

-- Ensure single canonical transportation division by code
insert into public.divisions (code, name, is_active)
values ('TRANSPORT', 'Transportation', true)
on conflict (code) do update set name = excluded.name, is_active = true;

insert into public.transport_clients (division_id, code, name, gstin, contact_no, is_active)
select d.id, x.code, x.name, x.gstin, x.contact_no, true
from (select id from public.divisions where code = 'TRANSPORT' limit 1) d
cross join (values
  ('TCL-NAIDU','Naidu Infra','37ABCDE1234F1Z1','9876543210'),
  ('TCL-BHANU','Bhanu Minerals','37BCDEA2345G1Z2','9876501234')
) x(code,name,gstin,contact_no)
where not exists (
  select 1 from public.transport_clients c
  where c.division_id = d.id and c.code = x.code and c.deleted_at is null
);

insert into public.transport_transporters (division_id, code, name, contact_no, gstin, is_active)
select d.id, x.code, x.name, x.contact_no, x.gstin, true
from (select id from public.divisions where code = 'TRANSPORT' limit 1) d
cross join (values
  ('TPR-NAIDU','Naidu Transport','9876543210','37ABCDE1234F1Z1'),
  ('TPR-BHANU','Bhanu Logistics','9876501234','37BCDEA2345G1Z2')
) x(code,name,contact_no,gstin)
where not exists (
  select 1 from public.transport_transporters t
  where t.division_id = d.id and t.code = x.code and t.deleted_at is null
);

insert into public.transport_agents (division_id, code, name, contact_no, is_active)
select d.id, x.code, x.name, x.contact_no, true
from (select id from public.divisions where code = 'TRANSPORT' limit 1) d
cross join (values
  ('TAG-001','Suresh Agency','9123456789'),
  ('TAG-002','Mohan Agency','9234567890')
) x(code,name,contact_no)
where not exists (
  select 1 from public.transport_agents a
  where a.division_id = d.id and a.code = x.code and a.deleted_at is null
);

insert into public.transport_commodities (division_id, code, name, hsn_code, is_active)
select d.id, x.code, x.name, x.hsn_code, true
from (select id from public.divisions where code = 'TRANSPORT' limit 1) d
cross join (values
  ('TCO-IRON','Iron Ore','26011100'),
  ('TCO-AGG','Aggregates','25171010')
) x(code,name,hsn_code)
where not exists (
  select 1 from public.transport_commodities m
  where m.division_id = d.id and m.code = x.code and m.deleted_at is null
);

-- Create base mappings and rates from seeded entities
with d as (select id from public.divisions where code = 'TRANSPORT' limit 1),
cli as (select id, name from public.transport_clients where deleted_at is null and is_active = true limit 1),
trn as (select id, name from public.transport_transporters where deleted_at is null and is_active = true limit 1),
rt as (select id, name from public.transport_route_master where deleted_at is null and is_active = true limit 1),
com as (select id, name from public.transport_commodities where deleted_at is null and is_active = true limit 1)
insert into public.transport_client_mapping (division_id, code, name, client_id, route_id, commodity_id, is_active)
select d.id, 'TCM-001', 'Default Client Mapping', cli.id, rt.id, com.id, true
from d, cli, rt, com
where not exists (
  select 1 from public.transport_client_mapping m where m.deleted_at is null and m.client_id = cli.id and m.route_id = rt.id and m.commodity_id = com.id
);

with d as (select id from public.divisions where code = 'TRANSPORT' limit 1),
trn as (select id from public.transport_transporters where deleted_at is null and is_active = true limit 1),
trk as (select id from public.transport_trucks where deleted_at is null and is_active = true limit 1),
rt as (select id from public.transport_route_master where deleted_at is null and is_active = true limit 1),
com as (select id from public.transport_commodities where deleted_at is null and is_active = true limit 1)
insert into public.transport_transporter_mapping (division_id, code, name, transporter_id, truck_id, route_id, commodity_id, is_active)
select d.id, 'TTM-001', 'Default Transporter Mapping', trn.id, trk.id, rt.id, com.id, true
from d, trn, trk, rt, com
where not exists (
  select 1 from public.transport_transporter_mapping m where m.deleted_at is null and m.transporter_id = trn.id and m.truck_id = trk.id and m.route_id = rt.id and m.commodity_id = com.id
);

with d as (select id from public.divisions where code = 'TRANSPORT' limit 1),
cli as (select id from public.transport_clients where deleted_at is null and is_active = true limit 1),
trn as (select id from public.transport_transporters where deleted_at is null and is_active = true limit 1),
rt as (select id from public.transport_route_master where deleted_at is null and is_active = true limit 1),
com as (select id from public.transport_commodities where deleted_at is null and is_active = true limit 1),
two as (select id from public.transport_truck_owners where deleted_at is null and is_active = true limit 1),
trk as (select id from public.transport_trucks where deleted_at is null and is_active = true limit 1)
insert into public.transport_rate_master (division_id, code, name, rate_type, client_id, transporter_id, route_id, commodity_id, truck_owner_id, truck_id, effective_from, rate_per_mt, is_active)
select d.id, 'TRM-001', 'Default Transport Rate', 'company', cli.id, trn.id, rt.id, com.id, two.id, trk.id, current_date, 950, true
from d, cli, trn, rt, com, two, trk
where not exists (
  select 1 from public.transport_rate_master r where r.deleted_at is null and r.client_id = cli.id and r.transporter_id = trn.id and r.route_id = rt.id and r.commodity_id = com.id and r.effective_from = current_date
);