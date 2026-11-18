-- Securely link WhatsApp customer billing requests to the central EMS support desk.
alter table public.support_tickets
  add column if not exists whatsapp_platform_user_id uuid
  references public.whatsapp_platform_users(id) on delete restrict;

alter table public.support_tickets
  drop constraint if exists support_ticket_requester_identity_check;

alter table public.support_tickets
  add constraint support_ticket_requester_identity_check check (
    (requester_kind = 'staff' and requester_user_id is not null and external_portal_user_id is null and transport_portal_user_id is null and whatsapp_platform_user_id is null)
    or (requester_kind = 'external_portal' and requester_user_id is null and external_portal_user_id is not null and transport_portal_user_id is null and whatsapp_platform_user_id is null)
    or (requester_kind = 'transport_portal' and requester_user_id is null and external_portal_user_id is null and transport_portal_user_id is not null and whatsapp_platform_user_id is null)
    or (requester_kind = 'whatsapp_customer' and requester_user_id is null and external_portal_user_id is null and transport_portal_user_id is null and whatsapp_platform_user_id is not null)
  );

create index if not exists idx_support_tickets_whatsapp_requester
  on public.support_tickets(whatsapp_platform_user_id, last_activity_at desc)
  where whatsapp_platform_user_id is not null;

comment on column public.support_tickets.whatsapp_platform_user_id is
  'Authenticated WhatsApp customer portal user who submitted this support ticket.';
