-- Session-scoped OTP protection for Legal Advocate document previews.
-- A successful OTP unlock remains attached to the active external portal
-- session and therefore expires when that session is logged out or revoked.

alter table public.external_portal_sessions
  add column if not exists last_activity_at timestamptz not null default clock_timestamp(),
  add column if not exists legal_preview_otp_hash text,
  add column if not exists legal_preview_otp_expires_at timestamptz,
  add column if not exists legal_preview_otp_sent_at timestamptz,
  add column if not exists legal_preview_otp_verified_at timestamptz,
  add column if not exists legal_preview_otp_attempt_count integer not null default 0;

create index if not exists idx_external_portal_sessions_legal_preview_otp
  on public.external_portal_sessions (legal_preview_otp_expires_at)
  where revoked_at is null and legal_preview_otp_hash is not null;

-- Enforce the 30-minute inactivity limit at the database boundary as well as
-- in the browser. Any advocate RPC refreshes this timestamp; a request after
-- 30 inactive minutes revokes the session before any portal data is returned.
create or replace function public.legal_advocate_portal_resolve(p_session_token text)
returns table(portal_user_id uuid,advocate_id uuid)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user record;
  v_session public.external_portal_sessions%rowtype;
begin
  select s.* into v_session
  from public.external_portal_sessions s
  where s.session_token=p_session_token and s.revoked_at is null and s.expires_at>clock_timestamp()
  for update;
  if v_session.id is null then raise exception 'Advocate portal session is not valid'; end if;
  if v_session.last_activity_at < clock_timestamp() - interval '30 minutes' then
    raise exception 'Portal session expired after 30 minutes of inactivity';
  end if;
  update public.external_portal_sessions set last_activity_at=clock_timestamp() where id=v_session.id;

  select * into v_user from public.external_portal_validate_session(p_session_token) limit 1;
  if v_user.portal_user_id is null then raise exception 'Advocate portal session is not valid'; end if;
  return query select v_user.portal_user_id,a.record_id from public.external_portal_access a
  join public.legal_advocates v on v.id=a.record_id
  where a.portal_user_id=v_user.portal_user_id and a.source_module='legal' and a.access_scope='legal_advocate_portal'
    and a.record_type='legal_advocates' and a.is_active and (a.expires_at is null or a.expires_at>now()) and v.status='active'
  order by a.granted_at desc limit 1;
end $$;

revoke all on function public.legal_advocate_portal_resolve(text) from public;

create or replace function public.legal_advocate_preview_otp_issue(
  p_session_token text,
  p_ttl_minutes integer default 10,
  p_resend_seconds integer default 45
)
returns table (
  otp text,
  otp_expires_at timestamptz,
  masked_phone text,
  advocate_name text,
  delivery_phone text,
  already_unlocked boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_access record;
  v_session public.external_portal_sessions%rowtype;
  v_name text;
  v_phone text;
  v_normalized_phone text;
  v_otp text;
  v_expires_at timestamptz;
begin
  select * into v_access
  from public.legal_advocate_portal_resolve(p_session_token)
  limit 1;
  if v_access.portal_user_id is null or v_access.advocate_id is null then
    raise exception 'Advocate portal session is not valid';
  end if;

  select s.* into v_session
  from public.external_portal_sessions s
  where s.session_token = p_session_token
    and s.portal_user_id = v_access.portal_user_id
    and s.revoked_at is null
    and s.expires_at > clock_timestamp()
  for update;
  if v_session.id is null then raise exception 'Advocate portal session is not valid'; end if;

  select
    coalesce(nullif(v.full_name, ''), nullif(u.display_name, ''), nullif(u.username, ''), 'Advocate'),
    coalesce(nullif(v.phone, ''), nullif(u.phone, ''))
  into v_name, v_phone
  from public.legal_advocates v
  join public.external_portal_users u on u.id = v_access.portal_user_id
  where v.id = v_access.advocate_id;

  v_normalized_phone := regexp_replace(coalesce(v_phone, ''), '[^0-9]', '', 'g');
  v_normalized_phone := regexp_replace(v_normalized_phone, '^0+', '');
  if length(v_normalized_phone) = 10 then v_normalized_phone := '91' || v_normalized_phone; end if;
  if length(v_normalized_phone) < 10 then
    raise exception 'A registered WhatsApp mobile number is required for secure preview access';
  end if;

  if v_session.legal_preview_otp_verified_at is not null then
    return query select
      null::text,
      null::timestamptz,
      ('+' || left(v_normalized_phone, 2) || ' ******' || right(v_normalized_phone, 4)),
      v_name,
      v_normalized_phone,
      true;
    return;
  end if;

  if v_session.legal_preview_otp_sent_at is not null
     and v_session.legal_preview_otp_sent_at > clock_timestamp() - make_interval(secs => greatest(15, least(coalesce(p_resend_seconds, 45), 300))) then
    raise exception 'Please wait before requesting another OTP';
  end if;

  v_otp := lpad((((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000))::text, 6, '0');
  v_expires_at := clock_timestamp() + make_interval(mins => greatest(5, least(coalesce(p_ttl_minutes, 10), 30)));

  update public.external_portal_sessions
  set legal_preview_otp_hash = encode(extensions.digest(v_otp, 'sha256'), 'hex'),
      legal_preview_otp_expires_at = v_expires_at,
      legal_preview_otp_sent_at = clock_timestamp(),
      legal_preview_otp_verified_at = null,
      legal_preview_otp_attempt_count = 0
  where id = v_session.id;

  perform public.log_external_portal_audit_event(
    v_access.portal_user_id,
    'legal_preview_otp_requested',
    jsonb_build_object('session_id', v_session.id, 'otp_redacted', true, 'expires_at', v_expires_at)
  );

  return query select
    v_otp,
    v_expires_at,
    ('+' || left(v_normalized_phone, 2) || ' ******' || right(v_normalized_phone, 4)),
    v_name,
    v_normalized_phone,
    false;
end;
$function$;

create or replace function public.legal_advocate_preview_otp_verify(
  p_session_token text,
  p_otp text
)
returns table (unlocked boolean, verified_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_access record;
  v_session public.external_portal_sessions%rowtype;
  v_verified_at timestamptz;
  v_next_attempts integer;
begin
  select * into v_access
  from public.legal_advocate_portal_resolve(p_session_token)
  limit 1;
  if v_access.portal_user_id is null then raise exception 'Advocate portal session is not valid'; end if;

  select s.* into v_session
  from public.external_portal_sessions s
  where s.session_token = p_session_token
    and s.portal_user_id = v_access.portal_user_id
    and s.revoked_at is null
    and s.expires_at > clock_timestamp()
  for update;
  if v_session.id is null then raise exception 'Advocate portal session is not valid'; end if;

  if v_session.legal_preview_otp_verified_at is not null then
    return query select true, v_session.legal_preview_otp_verified_at;
    return;
  end if;
  if v_session.legal_preview_otp_hash is null or v_session.legal_preview_otp_expires_at is null then
    raise exception 'Request a preview OTP first';
  end if;
  if v_session.legal_preview_otp_expires_at < clock_timestamp() then
    update public.external_portal_sessions
    set legal_preview_otp_hash = null,
        legal_preview_otp_expires_at = null
    where id = v_session.id;
    raise exception 'OTP has expired. Request a new OTP';
  end if;
  if v_session.legal_preview_otp_attempt_count >= 5 then
    raise exception 'Too many attempts. Request a new OTP';
  end if;

  if encode(extensions.digest(coalesce(p_otp, ''), 'sha256'), 'hex') <> v_session.legal_preview_otp_hash then
    v_next_attempts := v_session.legal_preview_otp_attempt_count + 1;
    update public.external_portal_sessions
    set legal_preview_otp_attempt_count = v_next_attempts,
        legal_preview_otp_hash = case when v_next_attempts >= 5 then null else legal_preview_otp_hash end,
        legal_preview_otp_expires_at = case when v_next_attempts >= 5 then null else legal_preview_otp_expires_at end
    where id = v_session.id;
    raise exception 'Incorrect OTP';
  end if;

  v_verified_at := clock_timestamp();
  update public.external_portal_sessions
  set legal_preview_otp_verified_at = v_verified_at,
      legal_preview_otp_hash = null,
      legal_preview_otp_expires_at = null,
      legal_preview_otp_attempt_count = 0
  where id = v_session.id;

  perform public.log_external_portal_audit_event(
    v_access.portal_user_id,
    'legal_preview_otp_verified',
    jsonb_build_object('session_id', v_session.id, 'verified_at', v_verified_at)
  );

  return query select true, v_verified_at;
end;
$function$;

create or replace function public.legal_advocate_preview_otp_status(p_session_token text)
returns table (unlocked boolean, verified_at timestamptz, masked_phone text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_access record;
  v_session public.external_portal_sessions%rowtype;
  v_phone text;
begin
  select * into v_access
  from public.legal_advocate_portal_resolve(p_session_token)
  limit 1;
  if v_access.portal_user_id is null then raise exception 'Advocate portal session is not valid'; end if;

  select s.* into v_session
  from public.external_portal_sessions s
  where s.session_token = p_session_token
    and s.portal_user_id = v_access.portal_user_id
    and s.revoked_at is null
    and s.expires_at > clock_timestamp();
  if v_session.id is null then raise exception 'Advocate portal session is not valid'; end if;

  select regexp_replace(coalesce(v.phone, u.phone, ''), '[^0-9]', '', 'g')
  into v_phone
  from public.legal_advocates v
  join public.external_portal_users u on u.id = v_access.portal_user_id
  where v.id = v_access.advocate_id;
  v_phone := regexp_replace(v_phone, '^0+', '');
  if length(v_phone) = 10 then v_phone := '91' || v_phone; end if;

  return query select
    v_session.legal_preview_otp_verified_at is not null,
    v_session.legal_preview_otp_verified_at,
    case when length(v_phone) >= 10 then ('+' || left(v_phone, 2) || ' ******' || right(v_phone, 4)) else null end;
end;
$function$;

create or replace function public.legal_advocate_portal_file_access(p_session_token text,p_share_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_access record; v_result jsonb;
begin
  select * into v_access from public.legal_advocate_portal_resolve(p_session_token) limit 1;
  if not exists(
    select 1 from public.external_portal_sessions s
    where s.session_token=p_session_token and s.portal_user_id=v_access.portal_user_id
      and s.revoked_at is null and s.expires_at>now() and s.legal_preview_otp_verified_at is not null
  ) then raise exception 'Preview OTP verification required'; end if;
  select jsonb_build_object('drive_file_id',coalesce(af.drive_file_id,dd.drive_file_id),'file_name',coalesce(af.file_name,dd.file_name),'mime_type',coalesce(af.mime_type,dd.mime_type),'permission_level',s.permission_level)
  into v_result from public.legal_advocate_shares s
  left join public.legal_archive_files af on af.id=s.archive_file_id
  left join public.drive_documents dd on dd.id=s.drive_document_id
  where s.id=p_share_id and s.advocate_id=v_access.advocate_id and s.is_active and (s.expires_at is null or s.expires_at>now());
  if v_result is null or nullif(v_result->>'drive_file_id','') is null then raise exception 'Shared document is unavailable'; end if;
  update public.legal_advocate_shares set last_opened_at=now(),access_count=access_count+1,review_status=case when review_status='shared' then 'opened' else review_status end,updated_at=now() where id=p_share_id;
  perform public.log_external_portal_audit_event(v_access.portal_user_id,'legal_advocate_file_opened',jsonb_build_object('share_id',p_share_id,'otp_session_unlocked',true));
  return v_result;
end $$;

revoke all on function public.legal_advocate_preview_otp_issue(text,integer,integer) from public,anon,authenticated;
revoke all on function public.legal_advocate_preview_otp_verify(text,text) from public,anon,authenticated;
revoke all on function public.legal_advocate_preview_otp_status(text) from public,anon,authenticated;
grant execute on function public.legal_advocate_preview_otp_issue(text,integer,integer) to service_role;
grant execute on function public.legal_advocate_preview_otp_verify(text,text) to service_role;
grant execute on function public.legal_advocate_preview_otp_status(text) to service_role;

notify pgrst, 'reload schema';
