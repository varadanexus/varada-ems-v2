create table if not exists public.meeting_join_otp_challenges (
  id uuid primary key default gen_random_uuid(),
  challenge_token uuid not null unique default gen_random_uuid(),
  credential_id uuid not null references public.credentials(id) on delete cascade,
  otp_hash text not null,
  expires_at timestamptz not null,
  sent_at timestamptz not null default clock_timestamp(),
  verified_at timestamptz,
  consumed_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 10),
  created_at timestamptz not null default clock_timestamp()
);

alter table public.meeting_join_otp_challenges enable row level security;

revoke all on table public.meeting_join_otp_challenges from public, anon, authenticated;
grant all on table public.meeting_join_otp_challenges to service_role;

create index if not exists meeting_join_otp_challenges_credential_sent_idx
  on public.meeting_join_otp_challenges (credential_id, sent_at desc);

create index if not exists meeting_join_otp_challenges_expiry_idx
  on public.meeting_join_otp_challenges (expires_at)
  where consumed_at is null;

create or replace function public.issue_meeting_phone_otp(
  p_phone text,
  p_ttl_minutes integer default 15,
  p_resend_seconds integer default 30
)
returns table (
  challenge_token uuid,
  otp text,
  expires_at timestamptz,
  masked_phone text,
  participant_name text,
  credential_id uuid
)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_phone text;
  v_credential public.credentials%rowtype;
  v_last_sent timestamptz;
  v_otp text;
  v_expires_at timestamptz;
  v_challenge uuid;
begin
  v_phone := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_phone := regexp_replace(v_phone, '^0+', '');
  if length(v_phone) = 10 then
    v_phone := '91' || v_phone;
  end if;

  if length(v_phone) < 10 then
    raise exception using errcode = '22023', message = 'A valid registered mobile number is required.';
  end if;

  select c.*
    into v_credential
  from public.credentials c
  join public.meetings m on m.id = c.meeting_id
  where c.is_active is true
    and lower(coalesce(m.status, '')) <> 'ended'
    and (
      case
        when length(regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g')) = 10
          then '91' || regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g')
        else regexp_replace(regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g'), '^0+', '')
      end
    ) = v_phone
  order by
    case lower(coalesce(m.status, '')) when 'live' then 0 when 'scheduled' then 1 else 2 end,
    coalesce(m.scheduled_at, m.created_at) desc,
    c.created_at desc
  limit 1;

  if v_credential.id is null then
    raise exception using errcode = 'P0002', message = 'No active meeting invitation was found for this mobile number.';
  end if;

  select ch.sent_at
    into v_last_sent
  from public.meeting_join_otp_challenges ch
  where ch.credential_id = v_credential.id
  order by ch.sent_at desc
  limit 1;

  if v_last_sent is not null
     and v_last_sent > clock_timestamp() - make_interval(secs => greatest(10, least(coalesce(p_resend_seconds, 30), 300))) then
    raise exception using errcode = 'P0001', message = 'Please wait before requesting another OTP.';
  end if;

  update public.meeting_join_otp_challenges
  set consumed_at = clock_timestamp()
  where credential_id = v_credential.id
    and consumed_at is null;

  v_otp := lpad((((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000))::text, 6, '0');
  v_expires_at := clock_timestamp() + make_interval(mins => greatest(5, least(coalesce(p_ttl_minutes, 15), 30)));

  insert into public.meeting_join_otp_challenges (credential_id, otp_hash, expires_at)
  values (v_credential.id, encode(extensions.digest(v_otp, 'sha256'), 'hex'), v_expires_at)
  returning meeting_join_otp_challenges.challenge_token into v_challenge;

  update public.credentials
  set otp_hash = encode(extensions.digest(v_otp, 'sha256'), 'hex'),
      otp_expires_at = v_expires_at,
      otp_last_sent_at = clock_timestamp(),
      otp_verified_at = null,
      otp_attempt_count = 0
  where id = v_credential.id;

  return query select
    v_challenge,
    v_otp,
    v_expires_at,
    ('+' || left(v_phone, 2) || ' ******' || right(v_phone, 4)),
    coalesce(nullif(v_credential.name, ''), 'Guest'),
    v_credential.id;
end;
$function$;

revoke all on function public.issue_meeting_phone_otp(text, integer, integer) from public, anon, authenticated;
grant execute on function public.issue_meeting_phone_otp(text, integer, integer) to service_role;

create or replace function public.verify_meeting_phone_otp(
  p_challenge_token uuid,
  p_otp text
)
returns table (
  invite_token uuid,
  verified_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_challenge public.meeting_join_otp_challenges%rowtype;
  v_verified_at timestamptz;
  v_invite_token uuid;
begin
  select * into v_challenge
  from public.meeting_join_otp_challenges
  where challenge_token = p_challenge_token
  for update;

  if v_challenge.id is null or v_challenge.consumed_at is not null then
    raise exception using errcode = 'P0002', message = 'OTP challenge is invalid. Request a new OTP.';
  end if;
  if v_challenge.expires_at < clock_timestamp() then
    update public.meeting_join_otp_challenges set consumed_at = clock_timestamp() where id = v_challenge.id;
    raise exception using errcode = 'P0001', message = 'OTP has expired. Request a new OTP.';
  end if;
  if v_challenge.attempt_count >= v_challenge.max_attempts then
    update public.meeting_join_otp_challenges set consumed_at = clock_timestamp() where id = v_challenge.id;
    raise exception using errcode = 'P0001', message = 'Too many attempts. Request a new OTP.';
  end if;

  if encode(extensions.digest(coalesce(p_otp, ''), 'sha256'), 'hex') <> v_challenge.otp_hash then
    update public.meeting_join_otp_challenges
    set attempt_count = attempt_count + 1,
        consumed_at = case when attempt_count + 1 >= max_attempts then clock_timestamp() else consumed_at end
    where id = v_challenge.id;
    raise exception using errcode = '22023', message = 'Incorrect OTP.';
  end if;

  v_verified_at := clock_timestamp();
  update public.meeting_join_otp_challenges
  set verified_at = v_verified_at,
      consumed_at = v_verified_at
  where id = v_challenge.id;

  update public.credentials
  set otp_verified_at = v_verified_at,
      otp_attempt_count = 0
  where id = v_challenge.credential_id
  returning credentials.invite_token into v_invite_token;

  return query select v_invite_token, v_verified_at;
end;
$function$;

revoke all on function public.verify_meeting_phone_otp(uuid, text) from public, anon, authenticated;
grant execute on function public.verify_meeting_phone_otp(uuid, text) to service_role;

;
