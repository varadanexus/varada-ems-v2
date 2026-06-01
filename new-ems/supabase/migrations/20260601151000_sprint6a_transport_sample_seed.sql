-- Sprint 6A optional sample seed for transportation and trips

insert into public.divisions (code, name, is_active)
values
  ('TRANSPORT', 'Transportation', true),
  ('CONSTR', 'Construction', true),
  ('INTER', 'Interiors', true)
on conflict (code) do update set name = excluded.name, is_active = true;

with d as (
  select id from public.divisions where code = 'TRANSPORT' limit 1
)
insert into public.transport_truck_owners (division_id, code, name, phone, is_active)
select d.id, x.code, x.name, x.phone, true
from d cross join (values
  ('TWO-001','Naidu Transport','9876543210'),
  ('TWO-002','Bhanu Logistics','9876501234')
) as x(code,name,phone)
on conflict do nothing;

with d as (
  select id from public.divisions where code = 'TRANSPORT' limit 1
)
insert into public.transport_trucks (division_id, code, name, registration_no, is_active)
select d.id, x.code, x.name, x.reg, true
from d cross join (values
  ('TRK-001','Ashok Leyland 1','AP39XX1234'),
  ('TRK-002','Ashok Leyland 2','AP39XX5678')
) as x(code,name,reg)
on conflict do nothing;

with d as (
  select id from public.divisions where code = 'TRANSPORT' limit 1
)
insert into public.transport_drivers (division_id, code, name, phone, is_active)
select d.id, x.code, x.name, x.phone, true
from d cross join (values
  ('DRV-001','Raju','9876500001'),
  ('DRV-002','Kumar','9876500002')
) as x(code,name,phone)
on conflict do nothing;

with d as (
  select id from public.divisions where code = 'TRANSPORT' limit 1
)
insert into public.transport_route_master (division_id, code, name, from_location, to_location, distance_km, is_active)
select d.id, x.code, x.name, x.f, x.t, x.km, true
from d cross join (values
  ('RT-001','Katheru to Rambilli','Katheru','Rambilli',120),
  ('RT-002','Hindujha to Kakinada','Hindujha','Kakinada',95)
) as x(code,name,f,t,km)
on conflict do nothing;