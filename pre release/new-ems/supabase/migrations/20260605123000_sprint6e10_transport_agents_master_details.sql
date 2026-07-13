-- Sprint 6E.10: enrich transport_agents for Agent Master details

alter table public.transport_agents
  add column if not exists phone_number text,
  add column if not exists email text,
  add column if not exists address text,
  add column if not exists pan_number text,
  add column if not exists aadhaar_number text,
  add column if not exists bank_name text,
  add column if not exists account_number text,
  add column if not exists ifsc_code text,
  add column if not exists remarks text;

update public.transport_agents
set phone_number = coalesce(phone_number, contact_no)
where phone_number is null;