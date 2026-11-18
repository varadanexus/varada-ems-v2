-- Workspace control for automatic WhatsApp marketing opt-outs.
-- Enabled by default so existing and newly-created tenants receive the safer behavior.

alter table public.whatsapp_platform_tenants
  add column if not exists stop_marketing_opt_out_enabled boolean not null default true;

comment on column public.whatsapp_platform_tenants.stop_marketing_opt_out_enabled is
  'When enabled, an inbound STOP message records a marketing opt-out and skips queued campaign deliveries.';
