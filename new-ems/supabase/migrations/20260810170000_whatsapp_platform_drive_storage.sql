-- Dedicated, tenant-scoped Google Drive storage registry for the sellable
-- WhatsApp Business Platform. File bytes remain in the configured Drive root;
-- the database stores only controlled metadata and ownership references.

alter table public.whatsapp_platform_tenants
  add column if not exists drive_root_folder_id text,
  add column if not exists drive_root_folder_path text,
  add column if not exists logo_drive_file_id text,
  add column if not exists logo_file_name text,
  add column if not exists logo_mime_type text,
  add column if not exists logo_updated_at timestamptz;

create table if not exists public.whatsapp_platform_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.whatsapp_platform_tenants(id) on delete cascade,
  uploaded_by_user_id uuid references public.whatsapp_platform_users(id) on delete set null,
  category text not null check (category in ('logo','invoice','customer_document','export','other')),
  entity_type text,
  entity_id uuid,
  original_file_name text not null,
  stored_file_name text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0),
  drive_file_id text not null,
  drive_folder_id text not null,
  drive_folder_path text not null,
  status text not null default 'active' check (status in ('active','replaced','archived','deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_whatsapp_platform_documents_tenant_created
  on public.whatsapp_platform_documents(tenant_id, created_at desc);
create index if not exists idx_whatsapp_platform_documents_category
  on public.whatsapp_platform_documents(tenant_id, category, status);
create unique index if not exists uq_whatsapp_platform_documents_drive_file
  on public.whatsapp_platform_documents(drive_file_id);

alter table public.whatsapp_platform_documents enable row level security;
revoke all on public.whatsapp_platform_documents from anon, authenticated;

comment on table public.whatsapp_platform_documents is
  'Tenant-owned WhatsApp Platform file metadata. Bytes are stored below the dedicated Google Drive root and accessed only through the customer storage Edge Function.';
comment on column public.whatsapp_platform_tenants.drive_root_folder_id is
  'Tenant subfolder below the dedicated WhatsApp Business Platform Google Drive root.';
