-- Tenant-scoped in-app notifications for WhatsApp Solutions customers.
-- Product events are converted to per-user recipients in Postgres so delivery
-- does not depend on a browser being open or an Edge Function reaching the UI.

create table if not exists public.whatsapp_platform_notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.whatsapp_platform_tenants(id) on delete cascade,
  recipient_user_id uuid not null references public.whatsapp_platform_users(id) on delete cascade,
  category text not null default 'workspace',
  event_code text not null,
  title text not null,
  message text not null,
  severity text not null default 'info' check (severity in ('info','success','warning','error')),
  action_label text,
  action_url text,
  entity_type text,
  entity_id text,
  dedupe_key text not null,
  context jsonb not null default '{}'::jsonb check (jsonb_typeof(context) = 'object'),
  read_at timestamptz,
  dismissed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (recipient_user_id, dedupe_key),
  check (char_length(title) between 1 and 180),
  check (char_length(message) between 1 and 1200),
  check (action_url is null or action_url ~ '^/whatsapp-platform/workspace(?:/|$)')
);

create index if not exists idx_wp_notifications_user_feed
  on public.whatsapp_platform_notifications(recipient_user_id, created_at desc)
  where dismissed_at is null;
create index if not exists idx_wp_notifications_user_unread
  on public.whatsapp_platform_notifications(recipient_user_id, created_at desc)
  where read_at is null and dismissed_at is null;

alter table public.whatsapp_platform_notifications enable row level security;
revoke all on public.whatsapp_platform_notifications from public, anon, authenticated;
grant all on public.whatsapp_platform_notifications to service_role;

create or replace function public.whatsapp_platform_dispatch_notification(
  p_tenant_id uuid,
  p_event_code text,
  p_title text,
  p_message text,
  p_severity text default 'info',
  p_category text default 'workspace',
  p_action_label text default null,
  p_action_url text default null,
  p_entity_type text default null,
  p_entity_id text default null,
  p_dedupe_key text default null,
  p_role_codes text[] default null,
  p_context jsonb default '{}'::jsonb
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_key text := coalesce(nullif(btrim(p_dedupe_key), ''),
    concat_ws(':', p_event_code, coalesce(p_entity_type, 'workspace'), coalesce(p_entity_id, p_tenant_id::text)));
begin
  if p_tenant_id is null or coalesce(btrim(p_event_code), '') = '' then
    raise exception 'A tenant and event code are required';
  end if;
  if coalesce(btrim(p_title), '') = '' or coalesce(btrim(p_message), '') = '' then
    raise exception 'A notification title and message are required';
  end if;

  insert into public.whatsapp_platform_notifications (
    tenant_id, recipient_user_id, category, event_code, title, message, severity,
    action_label, action_url, entity_type, entity_id, dedupe_key, context
  )
  select
    p_tenant_id, u.id, coalesce(nullif(btrim(p_category), ''), 'workspace'), btrim(p_event_code),
    btrim(p_title), btrim(p_message),
    case when p_severity in ('info','success','warning','error') then p_severity else 'info' end,
    nullif(btrim(coalesce(p_action_label, '')), ''), nullif(btrim(coalesce(p_action_url, '')), ''),
    nullif(btrim(coalesce(p_entity_type, '')), ''), nullif(btrim(coalesce(p_entity_id, '')), ''),
    v_key, coalesce(p_context, '{}'::jsonb)
  from public.whatsapp_platform_users u
  where u.tenant_id = p_tenant_id
    and u.status = 'active'
    and (p_role_codes is null or u.role_code = any(p_role_codes))
  on conflict (recipient_user_id, dedupe_key) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.whatsapp_platform_dispatch_notification(uuid,text,text,text,text,text,text,text,text,text,text,text[],jsonb) from public, anon, authenticated;
grant execute on function public.whatsapp_platform_dispatch_notification(uuid,text,text,text,text,text,text,text,text,text,text,text[],jsonb) to service_role;

create or replace function public.whatsapp_platform_notify_verification_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return new; end if;
  if new.status in ('submitted','in_review','changes_requested','verified','rejected') then
    perform public.whatsapp_platform_dispatch_notification(
      new.tenant_id, 'verification_' || new.status,
      case new.status when 'verified' then 'Business verification approved' when 'changes_requested' then 'Verification changes required' when 'rejected' then 'Business verification was not approved' else 'Verification status updated' end,
      case new.status when 'verified' then 'Your business verification is complete.' when 'changes_requested' then coalesce(nullif(new.review_notes,''), 'Review the requested changes and replace the affected evidence.') when 'rejected' then coalesce(nullif(new.review_notes,''), 'Open the verification centre to review the decision.') else 'Your business verification is now ' || replace(new.status, '_', ' ') || '.' end,
      case when new.status = 'verified' then 'success' when new.status in ('changes_requested','rejected') then 'warning' else 'info' end,
      'verification', 'Open verification', '/whatsapp-platform/workspace/verification/',
      'business_verification', new.id::text, 'verification:' || new.id::text || ':' || new.status,
      null, jsonb_build_object('status', new.status)
    );
  end if;
  return new;
end $$;

drop trigger if exists wp_notification_verification_change on public.whatsapp_platform_business_verifications;
create trigger wp_notification_verification_change after insert or update of status
on public.whatsapp_platform_business_verifications for each row execute function public.whatsapp_platform_notify_verification_change();

create or replace function public.whatsapp_platform_notify_connection_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return new; end if;
  if new.status in ('connected','restricted','disconnected') then
    perform public.whatsapp_platform_dispatch_notification(
      new.tenant_id, 'connection_' || new.status,
      case new.status when 'connected' then 'WhatsApp number connected' when 'restricted' then 'WhatsApp connection needs attention' else 'WhatsApp number disconnected' end,
      coalesce(nullif(new.verified_name,''), nullif(new.display_phone_number,''), 'A WhatsApp business number') ||
        case new.status when 'connected' then ' is ready to use.' when 'restricted' then ' has been restricted. Review the connection before sending messages.' else ' is no longer connected to this workspace.' end,
      case when new.status = 'connected' then 'success' when new.status = 'restricted' then 'warning' else 'error' end,
      'connections', 'View business numbers', '/whatsapp-platform/workspace/accounts/',
      'connection', new.id::text, 'connection:' || new.id::text || ':' || new.status,
      null, jsonb_build_object('status', new.status, 'phoneNumber', new.display_phone_number)
    );
  end if;
  return new;
end $$;

drop trigger if exists wp_notification_connection_change on public.whatsapp_platform_connections;
create trigger wp_notification_connection_change after insert or update of status
on public.whatsapp_platform_connections for each row execute function public.whatsapp_platform_notify_connection_change();

create or replace function public.whatsapp_platform_notify_subscription_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_label text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status and new.cancel_at_cycle_end is not distinct from old.cancel_at_cycle_end then return new; end if;
  v_label := case when coalesce(new.subscription_kind, 'package') = 'addon' then coalesce(new.addon_code, 'Add-on') else initcap(new.package_code) || ' plan' end;
  if new.status in ('active','authenticated','pending','halted','paused','cancelled','completed','expired') or new.cancel_at_cycle_end then
    perform public.whatsapp_platform_dispatch_notification(
      new.tenant_id,
      case when new.cancel_at_cycle_end then 'subscription_cancellation_scheduled' else 'subscription_' || new.status end,
      case when new.cancel_at_cycle_end then 'Subscription cancellation scheduled' when new.status in ('active','authenticated') then v_label || ' activated' when new.status in ('halted','paused','pending') then 'Billing action required' when new.status = 'cancelled' then v_label || ' cancelled' else v_label || ' updated' end,
      case when new.cancel_at_cycle_end then 'The subscription will end at the close of the current billing period.' when new.status in ('active','authenticated') then 'Recurring billing is active for ' || v_label || '.' when new.status in ('halted','paused','pending') then 'Payment could not be confirmed. Open billing to restore or verify access.' else 'The subscription status is now ' || new.status || '.' end,
      case when new.status in ('active','authenticated') and not new.cancel_at_cycle_end then 'success' when new.status in ('halted','paused','pending') then 'error' else 'warning' end,
      'billing', 'Open billing', '/whatsapp-platform/workspace/billing/',
      'billing_subscription', new.id::text,
      'subscription:' || new.id::text || ':' || new.status || ':' || new.cancel_at_cycle_end::text,
      array['owner','admin'], jsonb_build_object('status',new.status,'billingInterval',new.billing_interval,'cancelAtCycleEnd',new.cancel_at_cycle_end)
    );
  end if;
  return new;
end $$;

drop trigger if exists wp_notification_subscription_change on public.whatsapp_platform_billing_subscriptions;
create trigger wp_notification_subscription_change after insert or update of status, cancel_at_cycle_end
on public.whatsapp_platform_billing_subscriptions for each row execute function public.whatsapp_platform_notify_subscription_change();

create or replace function public.whatsapp_platform_notify_payment_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status and new.captured is not distinct from old.captured then return new; end if;
  if new.captured or new.status in ('captured','paid','failed') then
    perform public.whatsapp_platform_dispatch_notification(
      new.tenant_id, 'payment_' || case when new.captured then 'captured' else new.status end,
      case when new.captured or new.status in ('captured','paid') then 'Payment received' else 'Payment failed' end,
      case when new.captured or new.status in ('captured','paid') then 'We received your payment of ₹' else 'A payment of ₹' end || to_char(new.amount_paise / 100.0, 'FM99,99,99,990.00') || case when new.captured or new.status in ('captured','paid') then '.' else ' could not be completed. Open billing to try again.' end,
      case when new.captured or new.status in ('captured','paid') then 'success' else 'error' end,
      'billing', 'View payment ledger', '/whatsapp-platform/workspace/billing/ledger/',
      'billing_payment', new.id::text, 'payment:' || new.provider_payment_id || ':' || case when new.captured then 'captured' else new.status end,
      array['owner','admin'], jsonb_build_object('status',new.status,'amountPaise',new.amount_paise,'currency',new.currency)
    );
  end if;
  return new;
end $$;

drop trigger if exists wp_notification_payment_change on public.whatsapp_platform_billing_payments;
create trigger wp_notification_payment_change after insert or update of status, captured
on public.whatsapp_platform_billing_payments for each row execute function public.whatsapp_platform_notify_payment_change();

create or replace function public.whatsapp_platform_notify_campaign_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return new; end if;
  if new.status in ('approved','rejected','scheduled','completed','failed','cancelled') then
    perform public.whatsapp_platform_dispatch_notification(
      new.tenant_id, 'campaign_' || new.status,
      case new.status when 'completed' then 'Campaign completed' when 'failed' then 'Campaign failed' when 'approved' then 'Campaign approved' when 'rejected' then 'Campaign changes required' when 'scheduled' then 'Campaign scheduled' else 'Campaign cancelled' end,
      new.name || case new.status when 'completed' then ' completed with ' || new.delivered_count::text || ' delivered message(s).' when 'failed' then ' could not be completed. Review its delivery results.' else ' is now ' || new.status || '.' end,
      case when new.status in ('completed','approved') then 'success' when new.status in ('failed','rejected') then 'error' else 'info' end,
      'campaigns', 'Open campaigns', '/whatsapp-platform/workspace/campaigns/',
      'campaign', new.id::text, 'campaign:' || new.id::text || ':' || new.status,
      null, jsonb_build_object('status',new.status,'deliveredCount',new.delivered_count,'failedCount',new.failed_count)
    );
  end if;
  return new;
end $$;

drop trigger if exists wp_notification_campaign_change on public.whatsapp_platform_campaigns;
create trigger wp_notification_campaign_change after insert or update of status
on public.whatsapp_platform_campaigns for each row execute function public.whatsapp_platform_notify_campaign_change();

create or replace function public.whatsapp_platform_notify_consent_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.whatsapp_platform_dispatch_notification(
    new.tenant_id, 'marketing_' || new.event_type,
    case when new.event_type = 'opt_out' then 'Customer opted out of marketing' else 'Customer opted back in to marketing' end,
    case when new.event_type = 'opt_out' then 'A customer sent a recognised opt-out keyword and will be excluded from marketing campaigns.' else 'A customer sent a recognised opt-in keyword and can receive marketing messages again.' end,
    case when new.event_type = 'opt_out' then 'warning' else 'success' end,
    'consent', 'Review contacts', '/whatsapp-platform/workspace/contacts/',
    'marketing_consent_event', new.id::text, 'consent:' || new.id::text,
    array['owner','admin'], jsonb_build_object('eventType',new.event_type,'contactId',new.contact_id,'keyword',new.keyword)
  );
  return new;
end $$;

drop trigger if exists wp_notification_consent_event on public.whatsapp_platform_marketing_consent_events;
create trigger wp_notification_consent_event after insert
on public.whatsapp_platform_marketing_consent_events for each row execute function public.whatsapp_platform_notify_consent_event();

create or replace function public.whatsapp_platform_notify_team_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.role_code = 'owner' then return new; end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status and new.role_code is not distinct from old.role_code then return new; end if;
  perform public.whatsapp_platform_dispatch_notification(
    new.tenant_id, 'team_member_' || new.status,
    case new.status when 'invited' then 'Team invitation created' when 'active' then 'Team member joined' else 'Team member access disabled' end,
    new.display_name || ' (' || new.email || ') is now ' || new.status || ' as ' || new.role_code || '.',
    case when new.status = 'active' then 'success' when new.status = 'disabled' then 'warning' else 'info' end,
    'team', 'Manage team', '/whatsapp-platform/workspace/team/',
    'workspace_user', new.id::text, 'team:' || new.id::text || ':' || new.status || ':' || new.role_code,
    array['owner','admin'], jsonb_build_object('status',new.status,'roleCode',new.role_code)
  );
  return new;
end $$;

drop trigger if exists wp_notification_team_change on public.whatsapp_platform_users;
create trigger wp_notification_team_change after insert or update of status, role_code
on public.whatsapp_platform_users for each row execute function public.whatsapp_platform_notify_team_change();

-- Seed one non-sensitive announcement so every existing user can discover the centre.
insert into public.whatsapp_platform_notifications (
  tenant_id, recipient_user_id, category, event_code, title, message, severity,
  action_label, action_url, entity_type, entity_id, dedupe_key
)
select u.tenant_id, u.id, 'workspace', 'notification_centre_ready',
  'Notification centre is ready',
  'Important billing, verification, connection, campaign, consent and team updates will appear here.',
  'success', 'Open workspace', '/whatsapp-platform/workspace/', 'workspace', u.tenant_id::text,
  'notification-centre-ready-v1'
from public.whatsapp_platform_users u
where u.status = 'active'
on conflict (recipient_user_id, dedupe_key) do nothing;

comment on table public.whatsapp_platform_notifications is
  'Per-user, tenant-isolated in-app notifications produced from trusted WhatsApp Platform events.';

notify pgrst, 'reload schema';
