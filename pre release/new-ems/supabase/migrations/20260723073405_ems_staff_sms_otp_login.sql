-- EMS staff passwordless SMS login. OTP material is server-only and every
-- successful verification becomes the same 12-hour opaque EMS session used by
-- the existing local staff login flow.

create table if not exists public.ems_login_otp_challenges (
  id uuid primary key default gen_random_uuid(),
  app_user_id uuid not null references public.app_users(id) on delete cascade,
  code_hash text not null,
  phone_last4 text not null,
  app_hash text,
  client_ip_hash text,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  sent_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint ems_login_otp_attempts_valid check (attempts >= 0 and max_attempts between 1 and 10)
);

create index if not exists idx_ems_login_otp_user_created
  on public.ems_login_otp_challenges (app_user_id, created_at desc);
create index if not exists idx_ems_login_otp_expiry
  on public.ems_login_otp_challenges (expires_at);
create index if not exists idx_ems_login_otp_ip_created
  on public.ems_login_otp_challenges (client_ip_hash, created_at desc)
  where client_ip_hash is not null;

alter table public.ems_login_otp_challenges enable row level security;
revoke all on public.ems_login_otp_challenges from public, anon, authenticated;
grant all on public.ems_login_otp_challenges to service_role;

-- Resolve an existing active staff record without exposing staff mobile data
-- through the public Data API. Only the service-role edge function can call it.
create or replace function public.resolve_ems_otp_login_user(p_identifier text)
returns table (
  app_user_id uuid,
  auth_user_id uuid,
  display_name text,
  email text,
  phone text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with input as (
    select
      lower(btrim(coalesce(p_identifier, ''))) as value,
      regexp_replace(coalesce(p_identifier, ''), '[^0-9]', '', 'g') as digits
  )
  select u.id, u.auth_user_id, u.display_name, u.email, u.phone
  from public.app_users u
  cross join input i
  where u.deleted_at is null
    and u.status = 'active'
    and coalesce(u.is_locked, false) = false
    and u.auth_user_id is not null
    and nullif(btrim(u.phone), '') is not null
    and (
      lower(coalesce(u.email, '')) = i.value
      or lower(coalesce(u.username, '')) = i.value
      or (
        i.digits <> ''
        and right(regexp_replace(coalesce(u.phone, ''), '[^0-9]', '', 'g'), 10) = right(i.digits, 10)
      )
    )
  order by case when lower(coalesce(u.email, '')) = i.value then 0 else 1 end, u.created_at
  limit 1;
$$;

revoke all on function public.resolve_ems_otp_login_user(text) from public, anon, authenticated;
grant execute on function public.resolve_ems_otp_login_user(text) to service_role;

comment on table public.ems_login_otp_challenges is
  'Short-lived, one-use EMS staff SMS login challenges. No client role has direct access.';
