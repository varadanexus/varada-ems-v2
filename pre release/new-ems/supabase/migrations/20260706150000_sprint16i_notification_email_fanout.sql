-- Sprint 16i: EMS notification email fanout helpers
-- Adds an idempotency marker on notification_events and two SECURITY DEFINER
-- helpers used by the email-integrations edge function to deliver notification
-- emails to recipients who have opted in (email_enabled = true) when the
-- notification channel_plan includes email. In-app behaviour is untouched.

alter table public.notification_events
  add column if not exists email_dispatched_at timestamptz;

-- Returns the recipients of a notification who are eligible for an email copy:
-- active users with a usable email address who have opted into email delivery.
-- Recipient rows are produced by dispatch_ems_notification (already respecting
-- in-app preferences, mutes, and audience), so this only layers email opt-in.
create or replace function public.notification_email_recipients(p_notification_id uuid)
returns table(
  app_user_id uuid,
  email text,
  display_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    nr.app_user_id,
    au.email,
    coalesce(nullif(btrim(au.display_name), ''), au.email) as display_name
  from public.notification_recipients nr
  join public.app_users au on au.id = nr.app_user_id
  left join public.notification_preferences np on np.app_user_id = nr.app_user_id
  where nr.notification_id = p_notification_id
    and coalesce(np.email_enabled, false) = true
    and coalesce(nullif(btrim(au.email), ''), '') <> ''
    and coalesce(au.status, 'inactive') = 'active';
$$;

grant execute on function public.notification_email_recipients(uuid) to authenticated, service_role;

-- Atomically claims a notification for email delivery. Returns true only for the
-- first caller (email_dispatched_at was null); subsequent calls return false so
-- the edge function can avoid duplicate sends.
create or replace function public.mark_notification_email_dispatched(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  update public.notification_events
  set email_dispatched_at = now()
  where id = p_notification_id
    and email_dispatched_at is null;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

grant execute on function public.mark_notification_email_dispatched(uuid) to authenticated, service_role;
