-- Route each customer-created developer webhook to one WhatsApp number and
-- identify the external software consuming that number's events. Existing
-- endpoints remain readable; all newly created endpoints are number-scoped by
-- the Edge Function.

alter table public.whatsapp_platform_webhook_endpoints
  add column if not exists connection_id uuid,
  add column if not exists software_name text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'whatsapp_platform_webhook_endpoints_connection_id_fkey'
      and conrelid = 'public.whatsapp_platform_webhook_endpoints'::regclass
  ) then
    alter table public.whatsapp_platform_webhook_endpoints
      add constraint whatsapp_platform_webhook_endpoints_connection_id_fkey
      foreign key (connection_id)
      references public.whatsapp_platform_connections(id)
      on delete set null;
  end if;
end $$;

update public.whatsapp_platform_webhook_endpoints
set software_name = name
where software_name is null or btrim(software_name) = '';

alter table public.whatsapp_platform_webhook_endpoints
  alter column software_name set default 'Custom integration';

alter table public.whatsapp_platform_webhook_endpoints
  drop constraint if exists whatsapp_platform_webhook_endpoints_software_name_check,
  add constraint whatsapp_platform_webhook_endpoints_software_name_check
    check (char_length(trim(software_name)) between 2 and 80);

alter table public.whatsapp_platform_webhook_endpoints
  drop constraint if exists whatsapp_platform_webhook_endpoints_tenant_id_endpoint_url_key;

create unique index if not exists whatsapp_platform_webhook_endpoint_number_url_unique
  on public.whatsapp_platform_webhook_endpoints (tenant_id, connection_id, endpoint_url)
  where connection_id is not null;

create index if not exists whatsapp_platform_webhook_endpoint_connection_idx
  on public.whatsapp_platform_webhook_endpoints (tenant_id, connection_id, status, created_at desc);

comment on column public.whatsapp_platform_webhook_endpoints.connection_id is
  'Connected WhatsApp number whose events are routed to this customer-created endpoint.';
comment on column public.whatsapp_platform_webhook_endpoints.software_name is
  'Customer-facing name of the external CRM, ERP, automation, or other consuming software.';
