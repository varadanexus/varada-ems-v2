-- Hospital Projects: client/vendor delivery, centralized document numbering,
-- billing, credit notes and a participant-safe query desk.

create extension if not exists pgcrypto;

insert into public.divisions (code, name)
values ('HOSPITAL_PROJECTS', 'Hospital Projects')
on conflict (code) do update set name = excluded.name;

create table public.hospital_clients (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id) on delete restrict,
  client_code text not null unique,
  hospital_name text not null,
  legal_name text,
  contact_name text,
  email text,
  phone text,
  gstin text,
  billing_address text,
  site_address text,
  auth_user_id uuid unique,
  status text not null default 'active' check (status in ('lead','active','on_hold','closed')),
  created_by uuid references public.app_users(id) on delete set null default public.current_app_user_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.hospital_vendors (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id) on delete restrict,
  vendor_code text not null unique,
  legal_name text not null,
  trade_name text,
  contact_name text,
  email text,
  phone text,
  gstin text,
  specialty text,
  auth_user_id uuid unique,
  status text not null default 'active' check (status in ('active','on_hold','blocked')),
  created_by uuid references public.app_users(id) on delete set null default public.current_app_user_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.hospital_projects (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id) on delete restrict,
  client_id uuid not null references public.hospital_clients(id) on delete restrict,
  project_code text not null unique,
  title text not null,
  project_type text not null default 'new_hospital' check (project_type in ('new_hospital','expansion','renovation','medical_equipment','mep','consultancy','turnkey')),
  bed_capacity integer check (bed_capacity is null or bed_capacity >= 0),
  location text,
  scope_summary text,
  status text not null default 'planning' check (status in ('planning','design','procurement','execution','commissioning','completed','on_hold','cancelled')),
  priority text not null default 'normal' check (priority in ('low','normal','high','critical')),
  start_date date,
  target_date date,
  progress_percent numeric(5,2) not null default 0 check (progress_percent between 0 and 100),
  contract_value numeric(16,2) not null default 0 check (contract_value >= 0),
  created_by uuid references public.app_users(id) on delete set null default public.current_app_user_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.hospital_project_vendors (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.hospital_projects(id) on delete cascade,
  vendor_id uuid not null references public.hospital_vendors(id) on delete restrict,
  package_name text not null,
  scope_summary text,
  status text not null default 'invited' check (status in ('invited','accepted','mobilized','in_progress','completed','cancelled')),
  awarded_value numeric(16,2) not null default 0 check (awarded_value >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, vendor_id, package_name)
);

-- Commercial work packages represent both full-turnkey scopes and standalone
-- services. Vendor cost is deliberately private; client_price is the sell side.
create table public.hospital_work_packages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.hospital_projects(id) on delete cascade,
  vendor_id uuid references public.hospital_vendors(id) on delete restrict,
  package_code text not null,
  title text not null,
  service_type text not null check (service_type in ('planning_design','civil_construction','mep','healthcare_interiors','medical_equipment','licensing_compliance','commissioning','other')),
  delivery_model text not null default 'subcontract' check (delivery_model in ('in_house','subcontract','resale','consultancy')),
  scope_summary text,
  vendor_cost numeric(16,2) not null default 0 check (vendor_cost >= 0),
  additional_cost numeric(16,2) not null default 0 check (additional_cost >= 0),
  client_price numeric(16,2) not null default 0 check (client_price >= 0),
  margin_amount numeric(16,2) generated always as (client_price - vendor_cost - additional_cost) stored,
  status text not null default 'estimating' check (status in ('estimating','quoted','approved','awarded','in_progress','completed','cancelled')),
  created_by uuid references public.app_users(id) on delete set null default public.current_app_user_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, package_code)
);

create table public.hospital_procurement_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.hospital_projects(id) on delete cascade,
  work_package_id uuid references public.hospital_work_packages(id) on delete set null,
  vendor_id uuid references public.hospital_vendors(id) on delete restrict,
  item_code text,
  equipment_name text not null,
  make_model text,
  specification text,
  quantity numeric(12,3) not null default 1 check (quantity > 0),
  unit text not null default 'Nos',
  vendor_unit_cost numeric(16,2) not null default 0 check (vendor_unit_cost >= 0),
  landed_unit_cost numeric(16,2) not null default 0 check (landed_unit_cost >= 0),
  client_unit_price numeric(16,2) not null default 0 check (client_unit_price >= 0),
  total_vendor_cost numeric(16,2) generated always as (quantity * (vendor_unit_cost + landed_unit_cost)) stored,
  total_client_price numeric(16,2) generated always as (quantity * client_unit_price) stored,
  margin_amount numeric(16,2) generated always as (quantity * (client_unit_price - vendor_unit_cost - landed_unit_cost)) stored,
  status text not null default 'requirement' check (status in ('requirement','rfq','vendor_selected','client_quoted','ordered','in_transit','delivered','installed','commissioned','cancelled')),
  expected_delivery date,
  created_by uuid references public.app_users(id) on delete set null default public.current_app_user_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.hospital_license_requirements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.hospital_projects(id) on delete cascade,
  work_package_id uuid references public.hospital_work_packages(id) on delete set null,
  responsible_vendor_id uuid references public.hospital_vendors(id) on delete restrict,
  license_name text not null,
  authority_name text not null,
  jurisdiction text,
  application_reference text,
  statutory_fee numeric(16,2) not null default 0 check (statutory_fee >= 0),
  vendor_service_cost numeric(16,2) not null default 0 check (vendor_service_cost >= 0),
  client_price numeric(16,2) not null default 0 check (client_price >= 0),
  margin_amount numeric(16,2) generated always as (client_price - statutory_fee - vendor_service_cost) stored,
  status text not null default 'identified' check (status in ('identified','documents_pending','application_ready','submitted','inspection','clarification','approved','rejected','renewal_due','not_applicable')),
  target_date date,
  approved_date date,
  expiry_date date,
  notes text,
  created_by uuid references public.app_users(id) on delete set null default public.current_app_user_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One sequence ledger is authoritative for every hospital financial document.
-- The row-level upsert is atomic, so concurrent users cannot receive duplicates.
create table public.hospital_document_sequences (
  scope_code text not null default 'HOSPITAL_PROJECTS',
  document_type text not null check (document_type in ('PROJECT','INVOICE','CREDIT_NOTE','QUERY')),
  fiscal_year text not null,
  last_number bigint not null default 0 check (last_number >= 0),
  updated_at timestamptz not null default now(),
  primary key (scope_code, document_type, fiscal_year)
);

create table public.hospital_invoices (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id) on delete restrict,
  project_id uuid not null references public.hospital_projects(id) on delete restrict,
  client_id uuid not null references public.hospital_clients(id) on delete restrict,
  invoice_number text not null unique,
  invoice_type text not null default 'progress' check (invoice_type in ('advance','progress','retention','final','other')),
  issue_date date not null,
  due_date date,
  description text not null,
  taxable_amount numeric(16,2) not null check (taxable_amount >= 0),
  tax_rate numeric(6,3) not null default 18 check (tax_rate between 0 and 100),
  tax_amount numeric(16,2) not null check (tax_amount >= 0),
  total_amount numeric(16,2) not null check (total_amount >= 0),
  credited_amount numeric(16,2) not null default 0 check (credited_amount >= 0),
  paid_amount numeric(16,2) not null default 0 check (paid_amount >= 0),
  status text not null default 'draft' check (status in ('draft','issued','partially_paid','paid','overdue','cancelled')),
  accounts_status text not null default 'unposted' check (accounts_status in ('unposted','ready','posted','rejected')),
  created_by uuid references public.app_users(id) on delete set null default public.current_app_user_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.hospital_credit_notes (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id) on delete restrict,
  invoice_id uuid not null references public.hospital_invoices(id) on delete restrict,
  project_id uuid not null references public.hospital_projects(id) on delete restrict,
  client_id uuid not null references public.hospital_clients(id) on delete restrict,
  credit_note_number text not null unique,
  credit_note_date date not null,
  reason text not null,
  amount numeric(16,2) not null check (amount > 0),
  status text not null default 'draft' check (status in ('draft','approved','cancelled')),
  accounts_status text not null default 'unposted' check (accounts_status in ('unposted','ready','posted','rejected')),
  approved_by uuid references public.app_users(id) on delete set null,
  approved_at timestamptz,
  created_by uuid references public.app_users(id) on delete set null default public.current_app_user_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.hospital_queries (
  id uuid primary key default gen_random_uuid(),
  query_number text not null unique,
  project_id uuid not null references public.hospital_projects(id) on delete cascade,
  client_id uuid references public.hospital_clients(id) on delete restrict,
  vendor_id uuid references public.hospital_vendors(id) on delete restrict,
  audience text not null check (audience in ('client','vendor','internal')),
  subject text not null,
  category text not null default 'general' check (category in ('general','design','site','commercial','billing','approval','quality','safety','equipment','compliance')),
  priority text not null default 'normal' check (priority in ('low','normal','high','critical')),
  status text not null default 'open' check (status in ('open','awaiting_client','awaiting_vendor','awaiting_company','resolved','closed')),
  last_message_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_by uuid references public.app_users(id) on delete set null default public.current_app_user_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((audience = 'client' and client_id is not null and vendor_id is null)
      or (audience = 'vendor' and vendor_id is not null)
      or audience = 'internal')
);

create table public.hospital_query_messages (
  id uuid primary key default gen_random_uuid(),
  query_id uuid not null references public.hospital_queries(id) on delete cascade,
  sender_kind text not null check (sender_kind in ('staff','client','vendor')),
  sender_user_id uuid,
  sender_label text not null,
  body text not null check (length(btrim(body)) between 1 and 10000),
  created_at timestamptz not null default now()
);

create index idx_hospital_clients_division on public.hospital_clients(division_id, status);
create index idx_hospital_vendors_division on public.hospital_vendors(division_id, status);
create index idx_hospital_projects_client on public.hospital_projects(client_id, status);
create index idx_hospital_project_vendors_vendor on public.hospital_project_vendors(vendor_id, status);
create index idx_hospital_work_packages_project on public.hospital_work_packages(project_id,status);
create index idx_hospital_procurement_project on public.hospital_procurement_items(project_id,status);
create index idx_hospital_licenses_project on public.hospital_license_requirements(project_id,status);
create index idx_hospital_invoices_project on public.hospital_invoices(project_id, issue_date desc);
create index idx_hospital_invoices_client on public.hospital_invoices(client_id, status);
create index idx_hospital_credit_notes_invoice on public.hospital_credit_notes(invoice_id, credit_note_date desc);
create index idx_hospital_queries_project on public.hospital_queries(project_id, last_message_at desc);
create index idx_hospital_query_messages_query on public.hospital_query_messages(query_id, created_at);

do $$ declare t text; begin
  foreach t in array array['hospital_clients','hospital_vendors','hospital_projects','hospital_project_vendors','hospital_work_packages','hospital_procurement_items','hospital_license_requirements','hospital_invoices','hospital_credit_notes','hospital_queries'] loop
    execute format('drop trigger if exists trg_%I_touch on public.%I', t, t);
    execute format('create trigger trg_%I_touch before update on public.%I for each row execute function public.touch_interior_entity_updated_at()', t, t);
  end loop;
end $$;

-- Selecting a third-party supplier automatically grants the vendor a project/package
-- assignment. This is the only commercial value exposed to that vendor portal.
create or replace function public.sync_hospital_vendor_assignment()
returns trigger language plpgsql security invoker set search_path=public as $$
declare v_vendor uuid; v_project uuid; v_name text; v_scope text; v_value numeric;
begin
  if tg_table_name='hospital_work_packages' then
    v_vendor:=new.vendor_id; v_project:=new.project_id; v_name:=new.package_code||' · '||new.title; v_scope:=new.scope_summary; v_value:=new.vendor_cost+new.additional_cost;
  elsif tg_table_name='hospital_procurement_items' then
    v_vendor:=new.vendor_id; v_project:=new.project_id; v_name:='Equipment · '||new.equipment_name; v_scope:=coalesce(new.make_model||' · ','')||coalesce(new.specification,''); v_value:=new.total_vendor_cost;
  else
    v_vendor:=new.responsible_vendor_id; v_project:=new.project_id; v_name:='Licensing · '||new.license_name; v_scope:=new.authority_name; v_value:=new.vendor_service_cost;
  end if;
  if v_vendor is not null then
    insert into public.hospital_project_vendors(project_id,vendor_id,package_name,scope_summary,status,awarded_value)
    values(v_project,v_vendor,v_name,nullif(btrim(v_scope),''),'invited',coalesce(v_value,0))
    on conflict(project_id,vendor_id,package_name) do update set scope_summary=excluded.scope_summary,awarded_value=excluded.awarded_value,updated_at=now();
  end if;
  return new;
end $$;
create trigger trg_hospital_package_vendor_assignment after insert or update of vendor_id,vendor_cost,additional_cost,scope_summary on public.hospital_work_packages for each row execute function public.sync_hospital_vendor_assignment();
create trigger trg_hospital_equipment_vendor_assignment after insert or update of vendor_id,vendor_unit_cost,landed_unit_cost,quantity,specification on public.hospital_procurement_items for each row execute function public.sync_hospital_vendor_assignment();
create trigger trg_hospital_license_vendor_assignment after insert or update of responsible_vendor_id,vendor_service_cost,authority_name on public.hospital_license_requirements for each row execute function public.sync_hospital_vendor_assignment();

create or replace function public.hospital_fiscal_year(p_date date default current_date)
returns text language sql immutable security invoker set search_path = public as $$
  select case when extract(month from p_date) >= 4
    then to_char(p_date, 'YY') || '-' || to_char(p_date + interval '1 year', 'YY')
    else to_char(p_date - interval '1 year', 'YY') || '-' || to_char(p_date, 'YY') end
$$;

create or replace function public.hospital_actor_kind()
returns text language sql stable security invoker set search_path = public as $$
  select case
    when public.has_permission('hospital-projects','view') then 'staff'
    when exists (select 1 from public.hospital_clients c where c.auth_user_id = (select auth.uid()) and c.status in ('active','on_hold')) then 'client'
    when exists (select 1 from public.hospital_vendors v where v.auth_user_id = (select auth.uid()) and v.status = 'active') then 'vendor'
    else null end
$$;

create or replace function public.hospital_can_access_project(p_project_id uuid)
returns boolean language sql stable security invoker set search_path = public as $$
  select public.hospital_actor_kind() = 'staff'
    or exists (select 1 from public.hospital_projects p join public.hospital_clients c on c.id=p.client_id where p.id=p_project_id and c.auth_user_id=(select auth.uid()))
    or exists (select 1 from public.hospital_project_vendors a join public.hospital_vendors v on v.id=a.vendor_id where a.project_id=p_project_id and v.auth_user_id=(select auth.uid()) and a.status <> 'cancelled')
$$;

create or replace function public.hospital_next_document_number(p_document_type text, p_date date default current_date)
returns text language plpgsql security definer set search_path = public as $$
declare v_fy text := public.hospital_fiscal_year(p_date); v_no bigint; v_prefix text;
begin
  if public.hospital_actor_kind() <> 'staff' then raise exception 'Hospital staff access required'; end if;
  if p_document_type not in ('PROJECT','INVOICE','CREDIT_NOTE','QUERY') then raise exception 'Unsupported document type'; end if;
  insert into public.hospital_document_sequences(scope_code,document_type,fiscal_year,last_number)
  values ('HOSPITAL_PROJECTS',p_document_type,v_fy,1)
  on conflict (scope_code,document_type,fiscal_year) do update set last_number=public.hospital_document_sequences.last_number+1,updated_at=now()
  returning last_number into v_no;
  v_prefix := case p_document_type when 'PROJECT' then 'HSP/PRJ/' when 'INVOICE' then 'HSP/INV/' when 'CREDIT_NOTE' then 'HSP/CN/' else 'HSP/QRY/' end;
  return v_prefix || v_fy || '/' || lpad(v_no::text,5,'0');
end $$;

create or replace function public.hospital_create_invoice(
  p_project_id uuid, p_invoice_type text, p_issue_date date, p_due_date date,
  p_description text, p_taxable_amount numeric, p_tax_rate numeric default 18
) returns public.hospital_invoices language plpgsql security definer set search_path = public as $$
declare v_project public.hospital_projects; v_row public.hospital_invoices; v_tax numeric(16,2); v_number text;
begin
  if not public.has_permission('hospital-projects','create') then raise exception 'Hospital billing create permission required'; end if;
  select * into v_project from public.hospital_projects where id=p_project_id;
  if v_project.id is null then raise exception 'Hospital project not found'; end if;
  if coalesce(p_taxable_amount,0) < 0 then raise exception 'Taxable amount cannot be negative'; end if;
  v_number := public.hospital_next_document_number('INVOICE',coalesce(p_issue_date,current_date));
  v_tax := round(p_taxable_amount * coalesce(p_tax_rate,0) / 100,2);
  insert into public.hospital_invoices(division_id,project_id,client_id,invoice_number,invoice_type,issue_date,due_date,description,taxable_amount,tax_rate,tax_amount,total_amount)
  values(v_project.division_id,v_project.id,v_project.client_id,v_number,coalesce(p_invoice_type,'progress'),coalesce(p_issue_date,current_date),p_due_date,btrim(p_description),p_taxable_amount,coalesce(p_tax_rate,0),v_tax,p_taxable_amount+v_tax)
  returning * into v_row; return v_row;
end $$;

create or replace function public.hospital_create_credit_note(
  p_invoice_id uuid, p_credit_note_date date, p_reason text, p_amount numeric
) returns public.hospital_credit_notes language plpgsql security definer set search_path = public as $$
declare v_invoice public.hospital_invoices; v_row public.hospital_credit_notes; v_number text; v_available numeric;
begin
  if not public.has_permission('hospital-projects','create') then raise exception 'Hospital credit note create permission required'; end if;
  select * into v_invoice from public.hospital_invoices where id=p_invoice_id for update;
  if v_invoice.id is null then raise exception 'Invoice not found'; end if;
  v_available := v_invoice.total_amount-v_invoice.credited_amount;
  if coalesce(p_amount,0) <= 0 or p_amount > v_available then raise exception 'Credit amount exceeds available invoice value'; end if;
  v_number := public.hospital_next_document_number('CREDIT_NOTE',coalesce(p_credit_note_date,current_date));
  insert into public.hospital_credit_notes(division_id,invoice_id,project_id,client_id,credit_note_number,credit_note_date,reason,amount)
  values(v_invoice.division_id,v_invoice.id,v_invoice.project_id,v_invoice.client_id,v_number,coalesce(p_credit_note_date,current_date),btrim(p_reason),p_amount)
  returning * into v_row; return v_row;
end $$;

create or replace function public.hospital_approve_credit_note(p_credit_note_id uuid)
returns public.hospital_credit_notes language plpgsql security definer set search_path = public as $$
declare v_note public.hospital_credit_notes; v_invoice public.hospital_invoices; v_actor uuid:=public.current_app_user_id();
begin
  if not public.has_permission('hospital-projects','approve') then raise exception 'Hospital approval permission required'; end if;
  select * into v_note from public.hospital_credit_notes where id=p_credit_note_id for update;
  if v_note.id is null or v_note.status <> 'draft' then raise exception 'Only draft credit notes can be approved'; end if;
  select * into v_invoice from public.hospital_invoices where id=v_note.invoice_id for update;
  if v_invoice.total_amount-v_invoice.credited_amount < v_note.amount then raise exception 'Credit amount exceeds remaining invoice value'; end if;
  update public.hospital_credit_notes set status='approved',accounts_status='ready',approved_by=v_actor,approved_at=now() where id=v_note.id returning * into v_note;
  update public.hospital_invoices set credited_amount=credited_amount+v_note.amount,updated_at=now() where id=v_note.invoice_id;
  return v_note;
end $$;

create or replace function public.hospital_create_query(p_project_id uuid,p_subject text,p_category text,p_priority text,p_body text)
returns public.hospital_queries language plpgsql security definer set search_path = public as $$
declare v_kind text:=public.hospital_actor_kind(); v_project public.hospital_projects; v_client uuid; v_vendor uuid; v_query public.hospital_queries; v_no text; v_label text;
begin
  if v_kind not in ('client','vendor') then raise exception 'Client or vendor portal session required'; end if;
  if not public.hospital_can_access_project(p_project_id) then raise exception 'Project access denied'; end if;
  select * into v_project from public.hospital_projects where id=p_project_id;
  if v_kind='client' then select id into v_client from public.hospital_clients where auth_user_id=(select auth.uid()); v_label:='Client';
  else select id into v_vendor from public.hospital_vendors where auth_user_id=(select auth.uid()); v_label:='Vendor'; end if;
  -- Portal sequences use a transaction advisory lock because staff-only numbering RPC is intentionally restricted.
  perform pg_advisory_xact_lock(hashtextextended('HOSPITAL_PROJECTS:QUERY:'||public.hospital_fiscal_year(current_date),0));
  insert into public.hospital_document_sequences(scope_code,document_type,fiscal_year,last_number) values('HOSPITAL_PROJECTS','QUERY',public.hospital_fiscal_year(current_date),1)
  on conflict(scope_code,document_type,fiscal_year) do update set last_number=public.hospital_document_sequences.last_number+1,updated_at=now() returning last_number into v_no;
  insert into public.hospital_queries(query_number,project_id,client_id,vendor_id,audience,subject,category,priority)
  values('HSP/QRY/'||public.hospital_fiscal_year(current_date)||'/'||lpad(v_no,5,'0'),p_project_id,v_client,v_vendor,v_kind,btrim(p_subject),coalesce(p_category,'general'),coalesce(p_priority,'normal')) returning * into v_query;
  insert into public.hospital_query_messages(query_id,sender_kind,sender_user_id,sender_label,body) values(v_query.id,v_kind,(select auth.uid()),v_label,btrim(p_body));
  return v_query;
end $$;

create or replace function public.hospital_add_query_message(p_query_id uuid,p_body text)
returns public.hospital_query_messages language plpgsql security definer set search_path = public as $$
declare v_kind text:=public.hospital_actor_kind(); v_query public.hospital_queries; v_row public.hospital_query_messages; v_label text;
begin
  select * into v_query from public.hospital_queries where id=p_query_id;
  if v_query.id is null then raise exception 'Query not found'; end if;
  if v_kind='client' and not exists(select 1 from public.hospital_clients where id=v_query.client_id and auth_user_id=(select auth.uid())) then raise exception 'Query access denied'; end if;
  if v_kind='vendor' and not exists(select 1 from public.hospital_vendors where id=v_query.vendor_id and auth_user_id=(select auth.uid())) then raise exception 'Query access denied'; end if;
  if v_kind='staff' and not public.has_permission('hospital-projects','edit') then raise exception 'Hospital query edit permission required'; end if;
  if v_kind not in ('staff','client','vendor') then raise exception 'Query access denied'; end if;
  v_label:=case v_kind when 'staff' then 'Varada Nexus' when 'client' then 'Client' else 'Vendor' end;
  insert into public.hospital_query_messages(query_id,sender_kind,sender_user_id,sender_label,body) values(p_query_id,v_kind,coalesce(public.current_app_user_id(),(select auth.uid())),v_label,btrim(p_body)) returning * into v_row;
  update public.hospital_queries set last_message_at=now(),status=case when v_kind='staff' and audience='client' then 'awaiting_client' when v_kind='staff' and audience='vendor' then 'awaiting_vendor' else 'awaiting_company' end where id=p_query_id;
  return v_row;
end $$;

grant execute on function public.hospital_fiscal_year(date) to authenticated;
grant execute on function public.hospital_actor_kind() to authenticated;
grant execute on function public.hospital_can_access_project(uuid) to authenticated;
grant execute on function public.hospital_next_document_number(text,date) to authenticated;
grant execute on function public.hospital_create_invoice(uuid,text,date,date,text,numeric,numeric) to authenticated;
grant execute on function public.hospital_create_credit_note(uuid,date,text,numeric) to authenticated;
grant execute on function public.hospital_approve_credit_note(uuid) to authenticated;
grant execute on function public.hospital_create_query(uuid,text,text,text,text) to authenticated;
grant execute on function public.hospital_add_query_message(uuid,text) to authenticated;

do $$ declare t text; begin
  foreach t in array array['hospital_clients','hospital_vendors','hospital_projects','hospital_project_vendors','hospital_work_packages','hospital_procurement_items','hospital_license_requirements','hospital_document_sequences','hospital_invoices','hospital_credit_notes','hospital_queries','hospital_query_messages'] loop
    execute format('alter table public.%I enable row level security',t);
  end loop;
end $$;

-- Staff policies use the database permission matrix. Participant policies never expose
-- another client's/vendor's records, commercial assignments, or identity UUIDs.
create policy hospital_clients_staff_all on public.hospital_clients for all to authenticated using(public.has_permission('hospital-projects','view')) with check(public.has_permission('hospital-projects','create') or public.has_permission('hospital-projects','edit'));
create policy hospital_clients_self_select on public.hospital_clients for select to authenticated using(auth_user_id=(select auth.uid()));
create policy hospital_vendors_staff_all on public.hospital_vendors for all to authenticated using(public.has_permission('hospital-projects','view')) with check(public.has_permission('hospital-projects','create') or public.has_permission('hospital-projects','edit'));
create policy hospital_vendors_self_select on public.hospital_vendors for select to authenticated using(auth_user_id=(select auth.uid()));
create policy hospital_projects_staff_all on public.hospital_projects for all to authenticated using(public.has_permission('hospital-projects','view')) with check(public.has_permission('hospital-projects','create') or public.has_permission('hospital-projects','edit'));
create policy hospital_projects_participant_select on public.hospital_projects for select to authenticated using(public.hospital_can_access_project(id));
create policy hospital_project_vendors_staff_all on public.hospital_project_vendors for all to authenticated using(public.has_permission('hospital-projects','view')) with check(public.has_permission('hospital-projects','create') or public.has_permission('hospital-projects','edit'));
create policy hospital_project_vendors_vendor_select on public.hospital_project_vendors for select to authenticated using(exists(select 1 from public.hospital_vendors v where v.id=vendor_id and v.auth_user_id=(select auth.uid())));
create policy hospital_work_packages_staff_all on public.hospital_work_packages for all to authenticated using(public.has_permission('hospital-projects','view')) with check(public.has_permission('hospital-projects','create') or public.has_permission('hospital-projects','edit'));
create policy hospital_procurement_staff_all on public.hospital_procurement_items for all to authenticated using(public.has_permission('hospital-projects','view')) with check(public.has_permission('hospital-projects','create') or public.has_permission('hospital-projects','edit'));
create policy hospital_licenses_staff_all on public.hospital_license_requirements for all to authenticated using(public.has_permission('hospital-projects','view')) with check(public.has_permission('hospital-projects','create') or public.has_permission('hospital-projects','edit'));
create policy hospital_invoices_staff_all on public.hospital_invoices for all to authenticated using(public.has_permission('hospital-projects','view')) with check(public.has_permission('hospital-projects','create') or public.has_permission('hospital-projects','edit'));
create policy hospital_invoices_client_select on public.hospital_invoices for select to authenticated using(exists(select 1 from public.hospital_clients c where c.id=client_id and c.auth_user_id=(select auth.uid())));
create policy hospital_credit_notes_staff_all on public.hospital_credit_notes for all to authenticated using(public.has_permission('hospital-projects','view')) with check(public.has_permission('hospital-projects','create') or public.has_permission('hospital-projects','edit'));
create policy hospital_credit_notes_client_select on public.hospital_credit_notes for select to authenticated using(exists(select 1 from public.hospital_clients c where c.id=client_id and c.auth_user_id=(select auth.uid())));
create policy hospital_queries_staff_all on public.hospital_queries for all to authenticated using(public.has_permission('hospital-projects','view')) with check(public.has_permission('hospital-projects','create') or public.has_permission('hospital-projects','edit'));
create policy hospital_queries_participant_select on public.hospital_queries for select to authenticated using((client_id is not null and exists(select 1 from public.hospital_clients c where c.id=client_id and c.auth_user_id=(select auth.uid()))) or (vendor_id is not null and exists(select 1 from public.hospital_vendors v where v.id=vendor_id and v.auth_user_id=(select auth.uid()))));
create policy hospital_messages_staff_all on public.hospital_query_messages for all to authenticated using(public.has_permission('hospital-projects','view')) with check(public.has_permission('hospital-projects','create') or public.has_permission('hospital-projects','edit'));
create policy hospital_messages_participant_select on public.hospital_query_messages for select to authenticated using(exists(select 1 from public.hospital_queries q where q.id=query_id and ((q.client_id is not null and exists(select 1 from public.hospital_clients c where c.id=q.client_id and c.auth_user_id=(select auth.uid()))) or (q.vendor_id is not null and exists(select 1 from public.hospital_vendors v where v.id=q.vendor_id and v.auth_user_id=(select auth.uid()))))));

grant select,insert,update,delete on public.hospital_clients,public.hospital_vendors,public.hospital_projects,public.hospital_project_vendors,public.hospital_work_packages,public.hospital_procurement_items,public.hospital_license_requirements,public.hospital_invoices,public.hospital_credit_notes,public.hospital_queries,public.hospital_query_messages to authenticated;
grant select on public.hospital_document_sequences to authenticated;

insert into public.permissions(module_code,action_code,label,is_active)
select 'hospital-projects',a.code,'Hospital Projects - '||a.label,true
from (values ('view','View'),('create','Create'),('edit','Edit'),('delete','Delete'),('approve','Approve'),('export','Export'),('view_audit','View audit')) a(code,label)
on conflict(module_code,action_code) do update set label=excluded.label,is_active=true;

with role_actions(role_code,action_code) as (
  values ('super_admin','view'),('super_admin','create'),('super_admin','edit'),('super_admin','delete'),('super_admin','approve'),('super_admin','export'),('super_admin','view_audit'),
  ('admin','view'),('admin','create'),('admin','edit'),('admin','delete'),('admin','approve'),('admin','export'),('admin','view_audit'),
  ('manager','view'),('manager','create'),('manager','edit'),('manager','approve'),('manager','export'),
  ('operator','view'),('operator','create'),('operator','edit'),
  ('accounts','view'),('accounts','create'),('accounts','edit'),('accounts','approve'),('accounts','export'),
  ('accounts_manager','view'),('accounts_manager','create'),('accounts_manager','edit'),('accounts_manager','approve'),('accounts_manager','export'),('accounts_manager','view_audit'),
  ('accounts_executive','view'),('accounts_executive','create'),('accounts_executive','edit'),('accounts_executive','export'),
  ('cfo','view'),('cfo','approve'),('cfo','export'),('cfo','view_audit'),('coo','view'),('auditor','view'),('auditor','export'),('auditor','view_audit')
)
insert into public.role_permissions(role_id,permission_id,allow)
select r.id,p.id,true from role_actions ra join public.roles r on r.code=ra.role_code join public.permissions p on p.module_code='hospital-projects' and p.action_code=ra.action_code
on conflict(role_id,permission_id) do update set allow=true;

-- Client-safe consolidated register: RLS is inherited from the base table.
create view public.hospital_invoice_register with (security_invoker=true) as
select i.id,i.invoice_number,i.invoice_type,i.issue_date,i.due_date,i.description,i.taxable_amount,i.tax_amount,i.total_amount,i.credited_amount,i.paid_amount,
       greatest(i.total_amount-i.credited_amount-i.paid_amount,0) as balance_amount,i.status,i.accounts_status,i.project_id,i.client_id,p.project_code,p.title as project_title,c.client_code,c.hospital_name
from public.hospital_invoices i join public.hospital_projects p on p.id=i.project_id join public.hospital_clients c on c.id=i.client_id;
grant select on public.hospital_invoice_register to authenticated;

-- Hospital portals use the existing database-only Portal Users identity and
-- external_portal_access grants. Bearer tokens are accepted only by these narrow RPCs.
create or replace function public.hospital_portal_context(p_session_token text)
returns table(portal_user_id uuid,party_kind text,party_id uuid,display_name text)
language plpgsql security definer set search_path=public as $$
begin
  return query
  select u.id,
         case a.access_scope when 'hospital_client_portal' then 'client' else 'vendor' end,
         a.record_id,u.display_name
  from public.external_portal_sessions s
  join public.external_portal_users u on u.id=s.portal_user_id
  join public.external_portal_access a on a.portal_user_id=u.id
  where s.session_token=p_session_token and s.revoked_at is null and s.expires_at>now()
    and u.status='active' and not u.is_locked and a.is_active
    and (a.expires_at is null or a.expires_at>now())
    and a.source_module='hospital-projects'
    and a.access_scope in ('hospital_client_portal','hospital_vendor_portal')
  order by a.granted_at desc limit 1;
end $$;
revoke all on function public.hospital_portal_context(text) from public,anon,authenticated;

create or replace function public.hospital_portal_snapshot(p_session_token text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare x record; result jsonb;
begin
  select * into x from public.hospital_portal_context(p_session_token);
  if x.portal_user_id is null then raise exception 'Hospital portal session is invalid or has expired'; end if;
  if x.party_kind='client' and not exists(select 1 from public.hospital_clients where id=x.party_id) then raise exception 'Hospital client access is no longer available'; end if;
  if x.party_kind='vendor' and not exists(select 1 from public.hospital_vendors where id=x.party_id) then raise exception 'Hospital vendor access is no longer available'; end if;
  select jsonb_build_object(
    'kind',x.party_kind,'displayName',x.display_name,
    'profile',case when x.party_kind='client' then (select to_jsonb(c)-'auth_user_id'-'created_by' from public.hospital_clients c where c.id=x.party_id) else (select to_jsonb(v)-'auth_user_id'-'created_by' from public.hospital_vendors v where v.id=x.party_id) end,
    'projects',case when x.party_kind='client' then coalesce((select jsonb_agg(to_jsonb(p)-'contract_value'-'created_by' order by p.created_at desc) from public.hospital_projects p where p.client_id=x.party_id),'[]'::jsonb) else coalesce((select jsonb_agg(to_jsonb(p)-'contract_value'-'created_by' order by p.created_at desc) from public.hospital_projects p where exists(select 1 from public.hospital_project_vendors a where a.project_id=p.id and a.vendor_id=x.party_id and a.status<>'cancelled')),'[]'::jsonb) end,
    'assignments',case when x.party_kind='vendor' then coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'project_id',a.project_id,'package_name',a.package_name,'scope_summary',a.scope_summary,'status',a.status,'awarded_value',a.awarded_value,'updated_at',a.updated_at) order by a.created_at desc) from public.hospital_project_vendors a where a.vendor_id=x.party_id),'[]'::jsonb) else '[]'::jsonb end,
    'invoices',case when x.party_kind='client' then coalesce((select jsonb_agg(to_jsonb(r) order by r.issue_date desc) from public.hospital_invoice_register r where r.client_id=x.party_id and r.status<>'draft'),'[]'::jsonb) else '[]'::jsonb end,
    'creditNotes',case when x.party_kind='client' then coalesce((select jsonb_agg(to_jsonb(n)-'created_by'-'approved_by' order by n.credit_note_date desc) from public.hospital_credit_notes n where n.client_id=x.party_id and n.status='approved'),'[]'::jsonb) else '[]'::jsonb end,
    'queries',coalesce((select jsonb_agg(to_jsonb(q)-'created_by' order by q.last_message_at desc) from public.hospital_queries q where (x.party_kind='client' and q.client_id=x.party_id) or (x.party_kind='vendor' and q.vendor_id=x.party_id)),'[]'::jsonb),
    'messages',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'query_id',m.query_id,'sender_kind',m.sender_kind,'sender_label',m.sender_label,'body',m.body,'created_at',m.created_at) order by m.created_at) from public.hospital_query_messages m join public.hospital_queries q on q.id=m.query_id where (x.party_kind='client' and q.client_id=x.party_id) or (x.party_kind='vendor' and q.vendor_id=x.party_id)),'[]'::jsonb)
  ) into result;
  return result;
end $$;

create or replace function public.hospital_portal_create_query(p_session_token text,p_project_id uuid,p_subject text,p_category text,p_priority text,p_body text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare x record; q public.hospital_queries; seq bigint; fy text:=public.hospital_fiscal_year(current_date);
begin
  select * into x from public.hospital_portal_context(p_session_token);
  if x.portal_user_id is null then raise exception 'Hospital portal session is invalid or has expired'; end if;
  if x.party_kind='client' and not exists(select 1 from public.hospital_projects where id=p_project_id and client_id=x.party_id) then raise exception 'Project access denied'; end if;
  if x.party_kind='vendor' and not exists(select 1 from public.hospital_project_vendors where project_id=p_project_id and vendor_id=x.party_id and status<>'cancelled') then raise exception 'Project access denied'; end if;
  insert into public.hospital_document_sequences(scope_code,document_type,fiscal_year,last_number) values('HOSPITAL_PROJECTS','QUERY',fy,1)
  on conflict(scope_code,document_type,fiscal_year) do update set last_number=public.hospital_document_sequences.last_number+1,updated_at=now() returning last_number into seq;
  insert into public.hospital_queries(query_number,project_id,client_id,vendor_id,audience,subject,category,priority,status)
  values('HSP/QRY/'||fy||'/'||lpad(seq::text,5,'0'),p_project_id,case when x.party_kind='client' then x.party_id end,case when x.party_kind='vendor' then x.party_id end,x.party_kind,btrim(p_subject),coalesce(p_category,'general'),coalesce(p_priority,'normal'),'awaiting_company') returning * into q;
  insert into public.hospital_query_messages(query_id,sender_kind,sender_user_id,sender_label,body) values(q.id,x.party_kind,x.portal_user_id,case when x.party_kind='client' then 'Client' else 'Vendor' end,btrim(p_body));
  return to_jsonb(q)-'created_by';
end $$;

create or replace function public.hospital_portal_reply_query(p_session_token text,p_query_id uuid,p_body text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare x record; q public.hospital_queries; m public.hospital_query_messages;
begin
  select * into x from public.hospital_portal_context(p_session_token);
  if x.portal_user_id is null then raise exception 'Hospital portal session is invalid or has expired'; end if;
  select * into q from public.hospital_queries where id=p_query_id and ((x.party_kind='client' and client_id=x.party_id) or (x.party_kind='vendor' and vendor_id=x.party_id));
  if q.id is null then raise exception 'Query access denied'; end if;
  insert into public.hospital_query_messages(query_id,sender_kind,sender_user_id,sender_label,body) values(q.id,x.party_kind,x.portal_user_id,case when x.party_kind='client' then 'Client' else 'Vendor' end,btrim(p_body)) returning * into m;
  update public.hospital_queries set last_message_at=now(),status='awaiting_company' where id=q.id;
  return to_jsonb(m)-'sender_user_id';
end $$;

grant execute on function public.hospital_portal_snapshot(text) to anon,authenticated;
grant execute on function public.hospital_portal_create_query(text,uuid,text,text,text,text) to anon,authenticated;
grant execute on function public.hospital_portal_reply_query(text,uuid,text) to anon,authenticated;
