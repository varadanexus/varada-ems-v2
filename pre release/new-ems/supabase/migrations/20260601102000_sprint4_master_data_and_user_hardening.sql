-- Sprint 4: Master Data module and user management enhancements
-- Non-destructive, uses existing Sprint 3 master tables.

alter table if exists public.app_users add column if not exists last_login_at timestamptz;
alter table if exists public.app_users add column if not exists is_locked boolean not null default false;
alter table if exists public.app_users add column if not exists deleted_at timestamptz;

-- Add soft-delete + status fields to existing master tables if missing
alter table if exists public.master_clients add column if not exists deleted_at timestamptz;
alter table if exists public.master_contractors add column if not exists deleted_at timestamptz;
alter table if exists public.master_transporters add column if not exists deleted_at timestamptz;
alter table if exists public.master_agents add column if not exists deleted_at timestamptz;
alter table if exists public.master_commodities add column if not exists deleted_at timestamptz;
alter table if exists public.master_routes add column if not exists deleted_at timestamptz;
alter table if exists public.master_units add column if not exists deleted_at timestamptz;
alter table if exists public.master_tax_codes add column if not exists deleted_at timestamptz;
alter table if exists public.master_document_types add column if not exists deleted_at timestamptz;
alter table if exists public.divisions add column if not exists deleted_at timestamptz;

create index if not exists idx_app_users_deleted_at on public.app_users(deleted_at);
create index if not exists idx_master_clients_deleted_at on public.master_clients(deleted_at);
create index if not exists idx_master_contractors_deleted_at on public.master_contractors(deleted_at);
create index if not exists idx_master_transporters_deleted_at on public.master_transporters(deleted_at);
create index if not exists idx_master_agents_deleted_at on public.master_agents(deleted_at);
create index if not exists idx_master_commodities_deleted_at on public.master_commodities(deleted_at);
create index if not exists idx_master_routes_deleted_at on public.master_routes(deleted_at);
create index if not exists idx_master_units_deleted_at on public.master_units(deleted_at);
create index if not exists idx_master_tax_codes_deleted_at on public.master_tax_codes(deleted_at);
create index if not exists idx_master_document_types_deleted_at on public.master_document_types(deleted_at);
create index if not exists idx_divisions_deleted_at on public.divisions(deleted_at);
