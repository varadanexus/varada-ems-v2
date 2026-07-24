-- Native mobile push registration for the signed Capacitor application.
-- Tokens remain server-readable only and are managed by narrow user-scoped RPCs.

create table if not exists public.native_push_tokens (
  id uuid primary key default gen_random_uuid(),
  app_user_id uuid not null references public.app_users(id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('android', 'ios')),
  device_id text not null,
  user_agent text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique(app_user_id, device_id)
);

create index if not exists idx_native_push_tokens_user
  on public.native_push_tokens(app_user_id, updated_at desc)
  where enabled = true;

alter table public.native_push_tokens enable row level security;
revoke all on public.native_push_tokens from anon, authenticated;

create table if not exists public.native_push_deliveries (
  notification_id uuid not null references public.notification_events(id) on delete cascade,
  native_token_id uuid not null references public.native_push_tokens(id) on delete cascade,
  delivered_at timestamptz not null default now(),
  primary key(notification_id, native_token_id)
);

alter table public.native_push_deliveries enable row level security;
revoke all on public.native_push_deliveries from anon, authenticated;

create or replace function public.upsert_my_native_push_token(
  p_token text,
  p_platform text,
  p_device_id text,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := public.current_app_user_id();
  v_token_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if coalesce(length(trim(p_token)), 0) < 20 then raise exception 'Invalid native push token'; end if;
  if lower(coalesce(p_platform, '')) not in ('android', 'ios') then raise exception 'Invalid native push platform'; end if;
  if coalesce(length(trim(p_device_id)), 0) < 8 then raise exception 'Invalid device identifier'; end if;

  -- A refreshed FCM token replaces the previous token for this user's device.
  delete from public.native_push_tokens
  where app_user_id = v_user_id
    and device_id = left(trim(p_device_id), 160)
    and token <> trim(p_token);

  insert into public.native_push_tokens (
    app_user_id, token, platform, device_id, user_agent, enabled
  ) values (
    v_user_id,
    trim(p_token),
    lower(p_platform),
    left(trim(p_device_id), 160),
    left(p_user_agent, 500),
    true
  )
  on conflict (token) do update set
    app_user_id = excluded.app_user_id,
    platform = excluded.platform,
    device_id = excluded.device_id,
    user_agent = excluded.user_agent,
    enabled = true,
    updated_at = now(),
    last_seen_at = now()
  returning id into v_token_id;

  return v_token_id;
end;
$$;

create or replace function public.remove_my_native_push_token(p_device_id text)
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
  delete from public.native_push_tokens
  where app_user_id = v_user_id and device_id = left(trim(p_device_id), 160);
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

create or replace function public.get_my_native_push_token_status(p_device_id text default null)
returns table(enabled boolean, device_count integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    exists(
      select 1 from public.native_push_tokens nt
      where nt.app_user_id = public.current_app_user_id()
        and nt.enabled = true
        and (p_device_id is null or nt.device_id = left(trim(p_device_id), 160))
    ),
    count(*)::integer
  from public.native_push_tokens nt
  where nt.app_user_id = public.current_app_user_id() and nt.enabled = true;
$$;

revoke all on function public.upsert_my_native_push_token(text, text, text, text) from public;
revoke all on function public.remove_my_native_push_token(text) from public;
revoke all on function public.get_my_native_push_token_status(text) from public;
grant execute on function public.upsert_my_native_push_token(text, text, text, text) to authenticated;
grant execute on function public.remove_my_native_push_token(text) to authenticated;
grant execute on function public.get_my_native_push_token_status(text) to authenticated;
