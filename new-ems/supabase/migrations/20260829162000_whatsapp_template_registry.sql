create table if not exists public.whatsapp_platform_template_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.whatsapp_platform_tenants(id) on delete cascade,
  connection_id uuid not null references public.whatsapp_platform_connections(id) on delete cascade,
  meta_template_id text,
  name text not null,
  language text not null default 'en_US',
  category text not null default 'UTILITY',
  status text not null default 'DRAFT',
  source text not null default 'custom',
  content_type text not null default 'TEXT',
  components jsonb not null default '[]'::jsonb,
  library_template_name text,
  rejection_reason text,
  created_by uuid,
  submitted_at timestamptz,
  status_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_template_record_name check (name ~ '^[a-z0-9_]{1,512}$'),
  constraint whatsapp_template_record_source check (source in ('custom','meta_library','meta')),
  unique (connection_id, name, language)
);

create unique index if not exists whatsapp_template_records_meta_id_unique
  on public.whatsapp_platform_template_records(connection_id, meta_template_id)
  where meta_template_id is not null;
create index if not exists whatsapp_template_records_tenant_status_idx
  on public.whatsapp_platform_template_records(tenant_id, connection_id, status, updated_at desc);

alter table public.whatsapp_platform_template_records enable row level security;
revoke all on public.whatsapp_platform_template_records from anon, authenticated;
grant all on public.whatsapp_platform_template_records to service_role;

comment on table public.whatsapp_platform_template_records is
  'Tenant-owned template registry retaining drafts and Meta submissions while live review statuses synchronize.';
