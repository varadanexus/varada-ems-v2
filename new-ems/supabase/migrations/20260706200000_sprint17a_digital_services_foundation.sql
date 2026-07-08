-- Sprint 17a: Digital Services module foundation
-- Client-delivery workspace for web development, SEO, social media, and PR, with
-- a full pipeline (lead -> proposal -> won -> project -> deliverables -> invoice
-- -> payment) and all billing types (one-off, milestone, retainer/subscription).
-- Invoices post into Central Accounts via the same financial_documents +
-- posting_queue bridge used by Interiors and Transport.

create extension if not exists pgcrypto;

-- Reference: service lines offered.
create table if not exists public.ds_service_types (
  code text primary key,
  label text not null,
  is_active boolean not null default true,
  sort_order integer not null default 100
);

insert into public.ds_service_types (code, label, sort_order) values
  ('web_development', 'Web Development', 10),
  ('seo', 'SEO', 20),
  ('social_media', 'Social Media Marketing', 30),
  ('pr', 'PR / Communications', 40),
  ('branding', 'Branding & Creative', 50),
  ('other', 'Other', 90)
on conflict (code) do nothing;

-- Clients (won accounts).
create table if not exists public.ds_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company_name text,
  email text,
  phone text,
  whatsapp text,
  gstin text,
  address text,
  city text,
  status text not null default 'active' check (status in ('active','inactive','prospect')),
  owner_id uuid references public.app_users(id) on delete set null,
  notes text,
  created_by uuid references public.app_users(id) on delete set null default public.current_app_user_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Leads / CRM pipeline.
create table if not exists public.ds_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company_name text,
  email text,
  phone text,
  source text,
  service_type text references public.ds_service_types(code),
  stage text not null default 'new' check (stage in ('new','contacted','proposal','won','lost')),
  estimated_value numeric(14,2) not null default 0,
  owner_id uuid references public.app_users(id) on delete set null,
  notes text,
  converted_client_id uuid references public.ds_clients(id) on delete set null,
  created_by uuid references public.app_users(id) on delete set null default public.current_app_user_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Projects / engagements.
create table if not exists public.ds_projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.ds_clients(id) on delete cascade,
  code text unique,
  title text not null,
  service_type text references public.ds_service_types(code),
  engagement_type text not null default 'one_off' check (engagement_type in ('one_off','milestone','retainer','subscription')),
  status text not null default 'planning' check (status in ('planning','active','on_hold','completed','cancelled')),
  start_date date,
  end_date date,
  budget_amount numeric(14,2) not null default 0,
  currency text not null default 'INR',
  owner_id uuid references public.app_users(id) on delete set null,
  description text,
  created_by uuid references public.app_users(id) on delete set null default public.current_app_user_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Deliverables / tasks per project.
create table if not exists public.ds_deliverables (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.ds_projects(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'todo' check (status in ('todo','in_progress','review','done')),
  due_date date,
  assignee_id uuid references public.app_users(id) on delete set null,
  sort_order integer not null default 0,
  created_by uuid references public.app_users(id) on delete set null default public.current_app_user_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Recurring plans (retainers / subscriptions).
create table if not exists public.ds_subscriptions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.ds_clients(id) on delete cascade,
  project_id uuid references public.ds_projects(id) on delete set null,
  service_type text references public.ds_service_types(code),
  plan_name text not null,
  amount numeric(14,2) not null default 0,
  tax_rate numeric(6,2) not null default 18,
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly','quarterly','annual')),
  start_date date not null default current_date,
  next_invoice_date date,
  status text not null default 'active' check (status in ('active','paused','cancelled')),
  created_by uuid references public.app_users(id) on delete set null default public.current_app_user_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Invoices (all types).
create table if not exists public.ds_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  client_id uuid not null references public.ds_clients(id) on delete restrict,
  project_id uuid references public.ds_projects(id) on delete set null,
  subscription_id uuid references public.ds_subscriptions(id) on delete set null,
  invoice_type text not null default 'one_off' check (invoice_type in ('one_off','milestone','retainer','subscription')),
  issue_date date not null default current_date,
  due_date date,
  currency text not null default 'INR',
  subtotal numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null default 0,
  amount_paid numeric(14,2) not null default 0,
  status text not null default 'draft' check (status in ('draft','sent','partially_paid','paid','void')),
  notes text,
  posted_to_ca boolean not null default false,
  ca_financial_document_id uuid,
  created_by uuid references public.app_users(id) on delete set null default public.current_app_user_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ds_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.ds_invoices(id) on delete cascade,
  description text not null,
  quantity numeric(12,2) not null default 1,
  unit_price numeric(14,2) not null default 0,
  tax_rate numeric(6,2) not null default 18,
  line_total numeric(14,2) not null default 0,
  sort_order integer not null default 0
);

create table if not exists public.ds_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.ds_invoices(id) on delete cascade,
  client_id uuid references public.ds_clients(id) on delete set null,
  amount numeric(14,2) not null,
  method text,
  reference text,
  paid_at timestamptz not null default now(),
  notes text,
  created_by uuid references public.app_users(id) on delete set null default public.current_app_user_id(),
  created_at timestamptz not null default now()
);

create index if not exists idx_ds_projects_client on public.ds_projects(client_id);
create index if not exists idx_ds_deliverables_project on public.ds_deliverables(project_id, sort_order);
create index if not exists idx_ds_invoices_client on public.ds_invoices(client_id, issue_date desc);
create index if not exists idx_ds_invoices_status on public.ds_invoices(status);
create index if not exists idx_ds_invoice_items_invoice on public.ds_invoice_items(invoice_id);
create index if not exists idx_ds_payments_invoice on public.ds_payments(invoice_id);
create index if not exists idx_ds_leads_stage on public.ds_leads(stage);

-- Ensure a Digital Services division exists for Central Accounts dimensions.
insert into public.divisions (code, name) values ('DIGITAL_SERVICES', 'Digital Services')
on conflict (code) do nothing;

-- Next invoice number: DS-YYYY-#### (per calendar year).
create or replace function public.ds_next_invoice_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year text := to_char(now(), 'YYYY');
  v_seq integer;
begin
  select coalesce(max((regexp_replace(invoice_number, '^DS-\d{4}-', ''))::int), 0) + 1
  into v_seq
  from public.ds_invoices
  where invoice_number like 'DS-' || v_year || '-%';
  return 'DS-' || v_year || '-' || lpad(v_seq::text, 4, '0');
end;
$$;

grant execute on function public.ds_next_invoice_number() to authenticated;

-- Next project code: DSP-####.
create or replace function public.ds_next_project_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq integer;
begin
  select coalesce(max((regexp_replace(code, '^DSP-', ''))::int), 0) + 1
  into v_seq
  from public.ds_projects
  where code ~ '^DSP-\d+$';
  return 'DSP-' || lpad(v_seq::text, 4, '0');
end;
$$;

grant execute on function public.ds_next_project_code() to authenticated;

-- Central Accounts bridge: stage a Digital Services invoice into financial_documents
-- + posting_queue, mirroring the Interiors bridge. Posts only non-draft/non-void invoices.
create or replace function public.bridge_ds_invoice_to_central_accounts(p_invoice_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv record;
  v_division_id uuid;
  v_counterparty_dim uuid;
  v_project_dim uuid;
  v_profit_center_dim uuid;
  v_financial_document_id uuid;
  v_queue_id uuid;
  v_actor uuid := public.current_app_user_id();
begin
  if p_invoice_id is null then
    raise exception 'invoice id is required';
  end if;

  select
    i.id, i.invoice_number, i.invoice_type, i.issue_date, i.status,
    i.subtotal, i.tax_amount, i.total_amount, i.created_by,
    c.id as client_id, coalesce(c.company_name, c.name) as client_name,
    p.id as project_id, p.code as project_code, p.title as project_title
  into v_inv
  from public.ds_invoices i
  join public.ds_clients c on c.id = i.client_id
  left join public.ds_projects p on p.id = i.project_id
  where i.id = p_invoice_id;

  if v_inv.id is null then
    raise exception 'Digital Services invoice % not found', p_invoice_id;
  end if;
  if v_inv.status in ('draft', 'void') then
    return null;
  end if;

  select id into v_division_id from public.divisions where code = 'DIGITAL_SERVICES' limit 1;

  v_counterparty_dim := public.ensure_reporting_dimension(
    'counterparty', 'DS_CLIENT:' || coalesce(v_inv.client_id::text, 'UNASSIGNED'), coalesce(v_inv.client_name, 'Digital Services Client'));
  v_project_dim := public.ensure_reporting_dimension(
    'project', coalesce(nullif(v_inv.project_code, ''), 'DS_INVOICE:' || v_inv.id::text), coalesce(v_inv.project_title, v_inv.invoice_number, 'Digital Services'));
  v_profit_center_dim := public.ensure_reporting_dimension('profit_center', 'DIGITAL_SERVICES_CORE', 'Digital Services Core');

  insert into public.financial_documents (
    document_family, source_module, source_table, source_document_id, source_document_no,
    division_id, counterparty_dimension_id, project_dimension_id, profit_center_dimension_id,
    status, document_date, effective_date, gross_amount, taxable_amount, tax_amount, net_amount,
    finance_approved_by, finance_approved_at
  ) values (
    'DIGITAL_SERVICES_INVOICE', 'digital-services', 'ds_invoices', v_inv.id, v_inv.invoice_number,
    v_division_id, v_counterparty_dim, v_project_dim, v_profit_center_dim,
    'ready_for_posting', v_inv.issue_date, v_inv.issue_date,
    coalesce(v_inv.total_amount, 0), coalesce(v_inv.subtotal, 0), coalesce(v_inv.tax_amount, 0), coalesce(v_inv.total_amount, 0),
    coalesce(v_inv.created_by, v_actor), now()
  )
  on conflict (source_module, source_table, source_document_id, document_family)
  do update set
    source_document_no = excluded.source_document_no,
    division_id = excluded.division_id,
    counterparty_dimension_id = excluded.counterparty_dimension_id,
    project_dimension_id = excluded.project_dimension_id,
    profit_center_dimension_id = excluded.profit_center_dimension_id,
    status = case when public.financial_documents.status = 'posted' then public.financial_documents.status else 'ready_for_posting' end,
    document_date = excluded.document_date,
    effective_date = excluded.effective_date,
    gross_amount = excluded.gross_amount,
    taxable_amount = excluded.taxable_amount,
    tax_amount = excluded.tax_amount,
    net_amount = excluded.net_amount,
    updated_at = now()
  returning id into v_financial_document_id;

  insert into public.posting_queue (financial_document_id, queue_status, requested_by)
  values (v_financial_document_id, 'ready_to_post', coalesce(v_actor, v_inv.created_by))
  on conflict (financial_document_id)
  do update set
    queue_status = case when public.posting_queue.queue_status = 'posted' then public.posting_queue.queue_status else 'ready_to_post' end,
    requested_by = excluded.requested_by,
    last_error = null,
    updated_at = now()
  returning id into v_queue_id;

  update public.ds_invoices
  set posted_to_ca = true, ca_financial_document_id = v_financial_document_id, updated_at = now()
  where id = v_inv.id;

  return v_financial_document_id;
end;
$$;

grant execute on function public.bridge_ds_invoice_to_central_accounts(uuid) to authenticated;

-- RLS: enable and allow staff roles full access (route-level guards enforce module access).
do $$
declare t text;
begin
  foreach t in array array['ds_service_types','ds_clients','ds_leads','ds_projects','ds_deliverables','ds_subscriptions','ds_invoices','ds_invoice_items','ds_payments']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_all on public.%I', t, t);
    execute format($p$create policy %I_all on public.%I for all to authenticated
      using (public.current_user_has_any_role(array['super_admin','admin','manager','operator','coo','cfo','accounts','accounts_manager','accounts_executive']))
      with check (public.current_user_has_any_role(array['super_admin','admin','manager','operator','coo','cfo','accounts','accounts_manager','accounts_executive']))$p$, t, t);
  end loop;
end $$;

-- Permissions + role seed.
insert into public.permissions(module_code, action_code, label, is_active) values
  ('digital-services', 'view', 'Digital Services - Workspace', true),
  ('digital-services-dashboard', 'view', 'Digital Services - Dashboard', true),
  ('digital-services-leads', 'view', 'Digital Services - Leads', true),
  ('digital-services-leads', 'create', 'Digital Services - Manage Leads', true),
  ('digital-services-leads', 'edit', 'Digital Services - Edit Leads', true),
  ('digital-services-clients', 'view', 'Digital Services - Clients', true),
  ('digital-services-clients', 'create', 'Digital Services - Manage Clients', true),
  ('digital-services-clients', 'edit', 'Digital Services - Edit Clients', true),
  ('digital-services-projects', 'view', 'Digital Services - Projects', true),
  ('digital-services-projects', 'create', 'Digital Services - Manage Projects', true),
  ('digital-services-projects', 'edit', 'Digital Services - Edit Projects', true),
  ('digital-services-billing', 'view', 'Digital Services - Billing', true),
  ('digital-services-billing', 'create', 'Digital Services - Create Invoices', true),
  ('digital-services-billing', 'edit', 'Digital Services - Manage Billing', true),
  ('digital-services-billing', 'post', 'Digital Services - Post to Accounts', true),
  ('digital-services-settings', 'view', 'Digital Services - Settings', true)
on conflict (module_code, action_code) do update set label = excluded.label, is_active = true;

with ds_modules(module_code) as (
  values ('digital-services'),('digital-services-dashboard'),('digital-services-leads'),
         ('digital-services-clients'),('digital-services-projects'),('digital-services-billing'),
         ('digital-services-settings')
), ds_roles(role_code) as (
  values ('super_admin'),('admin'),('manager')
)
insert into public.role_permissions(role_id, permission_id, allow)
select r.id, p.id, true
from ds_roles rc
join public.roles r on r.code = rc.role_code
join ds_modules dm on true
join public.permissions p on p.module_code = dm.module_code
where not exists (
  select 1 from public.role_permissions rp where rp.role_id = r.id and rp.permission_id = p.id
);
