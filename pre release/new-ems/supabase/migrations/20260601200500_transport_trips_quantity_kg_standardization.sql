-- Transportation quantity standardization: user input in KG, system calc in MT

alter table public.transport_trips
  add column if not exists quantity_kg numeric;

update public.transport_trips
set quantity_kg = quantity_mt * 1000
where quantity_kg is null
  and quantity_mt is not null;
