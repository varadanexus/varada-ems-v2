-- Idempotent customer notifications for the WhatsApp onboarding lifecycle.

create table if not exists public.whatsapp_platform_milestone_emails (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.whatsapp_platform_tenants(id) on delete cascade,
  milestone_code text not null,
  recipient_email text not null,
  recipient_name text,
  status text not null default 'sending' check (status in ('sending','sent','failed')),
  attempts integer not null default 1 check (attempts > 0),
  provider_message_id text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, milestone_code)
);

alter table public.whatsapp_platform_milestone_emails enable row level security;
revoke all on public.whatsapp_platform_milestone_emails from public, anon, authenticated;
grant all on public.whatsapp_platform_milestone_emails to service_role;

create index if not exists whatsapp_platform_milestone_emails_status_idx
  on public.whatsapp_platform_milestone_emails(status, updated_at);

create or replace function public.whatsapp_platform_claim_milestone_email(
  p_tenant_id uuid,
  p_milestone_code text,
  p_recipient_email text,
  p_recipient_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.whatsapp_platform_milestone_emails (
    tenant_id, milestone_code, recipient_email, recipient_name, status
  ) values (
    p_tenant_id, p_milestone_code, lower(trim(p_recipient_email)), nullif(trim(coalesce(p_recipient_name, '')), ''), 'sending'
  )
  on conflict (tenant_id, milestone_code) do update
    set recipient_email = excluded.recipient_email,
        recipient_name = excluded.recipient_name,
        status = 'sending',
        attempts = public.whatsapp_platform_milestone_emails.attempts + 1,
        last_error = null,
        updated_at = now()
    where public.whatsapp_platform_milestone_emails.status = 'failed'
       or (
         public.whatsapp_platform_milestone_emails.status = 'sending'
         and public.whatsapp_platform_milestone_emails.updated_at < now() - interval '15 minutes'
       )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.whatsapp_platform_claim_milestone_email(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.whatsapp_platform_claim_milestone_email(uuid,text,text,text) to service_role;

notify pgrst, 'reload schema';
