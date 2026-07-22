-- Device-scoped Web Push subscriptions for the installed EMS PWA.
-- Subscription key material is server-only; clients manage it through narrow RPCs.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  app_user_id uuid not null references public.app_users(id) on delete cascade,
  endpoint text not null,
  p256dh_key text not null,
  auth_key text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique(endpoint)
);

create index if not exists idx_push_subscriptions_user
  on public.push_subscriptions(app_user_id, updated_at desc);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

create table if not exists public.push_deliveries (
  notification_id uuid not null references public.notification_events(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  delivered_at timestamptz not null default now(),
  primary key(notification_id, subscription_id)
);

alter table public.push_deliveries enable row level security;
revoke all on public.push_deliveries from anon, authenticated;

create or replace function public.get_my_push_identity()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_user_id();
$$;

create or replace function public.upsert_my_push_subscription(
  p_endpoint text,
  p_p256dh_key text,
  p_auth_key text,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := public.current_app_user_id();
  v_subscription_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if coalesce(length(p_endpoint), 0) < 20
    or coalesce(length(p_p256dh_key), 0) < 20
    or coalesce(length(p_auth_key), 0) < 8 then
    raise exception 'Invalid push subscription';
  end if;

  insert into public.push_subscriptions (
    app_user_id, endpoint, p256dh_key, auth_key, user_agent
  ) values (
    v_user_id, p_endpoint, p_p256dh_key, p_auth_key, left(p_user_agent, 500)
  )
  on conflict (endpoint) do update set
    app_user_id = excluded.app_user_id,
    p256dh_key = excluded.p256dh_key,
    auth_key = excluded.auth_key,
    user_agent = excluded.user_agent,
    updated_at = now(),
    last_seen_at = now()
  returning id into v_subscription_id;

  return v_subscription_id;
end;
$$;

create or replace function public.remove_my_push_subscription(p_endpoint text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := public.current_app_user_id();
  v_count integer;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  delete from public.push_subscriptions
  where app_user_id = v_user_id and endpoint = p_endpoint;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

create or replace function public.get_my_push_subscription_status(p_endpoint text default null)
returns table(enabled boolean, device_count integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    exists(
      select 1 from public.push_subscriptions ps
      where ps.app_user_id = public.current_app_user_id()
        and (p_endpoint is null or ps.endpoint = p_endpoint)
    ),
    count(*)::integer
  from public.push_subscriptions ps
  where ps.app_user_id = public.current_app_user_id();
$$;

revoke all on function public.get_my_push_identity() from public;
revoke all on function public.upsert_my_push_subscription(text, text, text, text) from public;
revoke all on function public.remove_my_push_subscription(text) from public;
revoke all on function public.get_my_push_subscription_status(text) from public;
grant execute on function public.get_my_push_identity() to authenticated;
grant execute on function public.upsert_my_push_subscription(text, text, text, text) to authenticated;
grant execute on function public.remove_my_push_subscription(text) to authenticated;
grant execute on function public.get_my_push_subscription_status(text) to authenticated;
