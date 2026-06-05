-- Sprint 6E.5: Transport Clients master enhancement

alter table public.transport_clients
  add column if not exists company_name text,
  add column if not exists contact_person_name text,
  add column if not exists phone_number text,
  add column if not exists address text,
  add column if not exists email text,
  add column if not exists gst_number text,
  add column if not exists pan_number text,
  add column if not exists aadhaar_number text;

update public.transport_clients
set company_name = coalesce(company_name, name)
where company_name is null;

update public.transport_clients
set phone_number = coalesce(phone_number, contact_no)
where phone_number is null;

update public.transport_clients
set gst_number = coalesce(gst_number, gstin)
where gst_number is null;
