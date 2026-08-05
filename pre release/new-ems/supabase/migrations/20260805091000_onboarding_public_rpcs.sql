-- Centralised Onboarding — public RPCs (SECURITY DEFINER, service_role only).
--
-- The `onboarding-integrations` edge function (service_role) is the ONLY caller.
-- Every function is validated by the request public_token and, after OTP, a
-- short-lived session_token. Nothing here is granted to anon/authenticated, so the
-- customer's browser can never call these directly — it always goes via the function.

begin;

-- ─── Issue an OTP for a request ──────────────────────────────────────────────
-- Returns the plaintext OTP to the edge function, which sends it over the request's
-- channel (WhatsApp via the approved OTP template, or email).
create or replace function public.issue_onboarding_otp(
  p_public_token uuid,
  p_ttl_minutes integer default 10,
  p_resend_seconds integer default 30
)
returns table (
  challenge_token uuid,
  otp text,
  expires_at timestamptz,
  channel text,
  destination text,
  masked_destination text,
  contact_name text,
  entity_name text,
  division_code text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_req public.onboarding_requests%rowtype;
  v_last_sent timestamptz;
  v_dest text;
  v_channel text;
  v_otp text;
  v_expires_at timestamptz;
  v_challenge uuid;
  v_masked text;
begin
  select * into v_req from public.onboarding_requests
  where public_token = p_public_token
  for update;

  if v_req.id is null then
    raise exception using errcode = 'P0002', message = 'This onboarding link is invalid.';
  end if;
  if v_req.status in ('submitted','approved','cancelled') then
    raise exception using errcode = 'P0001', message = 'This onboarding has already been completed.';
  end if;

  -- OTP channel: WhatsApp if we have a phone, else email.
  if coalesce(nullif(trim(v_req.contact_phone), ''), '') <> '' then
    v_channel := 'whatsapp';
    v_dest := v_req.contact_phone;
    v_masked := '+' || left(regexp_replace(v_dest, '[^0-9]', '', 'g'), 2) || ' ******'
                || right(regexp_replace(v_dest, '[^0-9]', '', 'g'), 4);
  elsif coalesce(nullif(trim(v_req.contact_email), ''), '') <> '' then
    v_channel := 'email';
    v_dest := v_req.contact_email;
    v_masked := regexp_replace(v_dest, '(^.).*(@.*$)', '\1****\2');
  else
    raise exception using errcode = '22023', message = 'No contact phone or email on this onboarding request.';
  end if;

  select ch.sent_at into v_last_sent
  from public.onboarding_otp_challenges ch
  where ch.request_id = v_req.id
  order by ch.sent_at desc
  limit 1;

  if v_last_sent is not null
     and v_last_sent > clock_timestamp() - make_interval(secs => greatest(10, least(coalesce(p_resend_seconds, 30), 300))) then
    raise exception using errcode = 'P0001', message = 'Please wait before requesting another code.';
  end if;

  -- Invalidate any live challenge for this request.
  update public.onboarding_otp_challenges
  set consumed_at = clock_timestamp()
  where request_id = v_req.id and consumed_at is null;

  v_otp := lpad((((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000))::text, 6, '0');
  v_expires_at := clock_timestamp() + make_interval(mins => greatest(5, least(coalesce(p_ttl_minutes, 10), 30)));

  insert into public.onboarding_otp_challenges (request_id, channel, destination, otp_hash, expires_at)
  values (v_req.id, v_channel, v_dest, encode(extensions.digest(v_otp, 'sha256'), 'hex'), v_expires_at)
  returning onboarding_otp_challenges.challenge_token into v_challenge;

  update public.onboarding_requests
  set status = case when status = 'draft' then 'sent' else status end
  where id = v_req.id;

  return query select
    v_challenge, v_otp, v_expires_at, v_channel, v_dest, v_masked,
    v_req.contact_name, v_req.entity_name, v_req.division_code;
end;
$function$;

-- ─── Verify OTP and open a submission session ────────────────────────────────
create or replace function public.verify_onboarding_otp(
  p_public_token uuid,
  p_otp text,
  p_ip text default null,
  p_user_agent text default null,
  p_session_hours integer default 6
)
returns table (
  session_token uuid,
  session_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_req public.onboarding_requests%rowtype;
  v_ch public.onboarding_otp_challenges%rowtype;
  v_session uuid;
  v_expires timestamptz;
begin
  select * into v_req from public.onboarding_requests
  where public_token = p_public_token
  for update;
  if v_req.id is null then
    raise exception using errcode = 'P0002', message = 'This onboarding link is invalid.';
  end if;

  select * into v_ch from public.onboarding_otp_challenges
  where request_id = v_req.id and consumed_at is null
  order by sent_at desc
  limit 1
  for update;

  if v_ch.id is null then
    raise exception using errcode = 'P0002', message = 'No active code. Please request a new one.';
  end if;
  if v_ch.expires_at < clock_timestamp() then
    update public.onboarding_otp_challenges set consumed_at = clock_timestamp() where id = v_ch.id;
    raise exception using errcode = 'P0001', message = 'The code has expired. Request a new one.';
  end if;
  if v_ch.attempt_count >= v_ch.max_attempts then
    update public.onboarding_otp_challenges set consumed_at = clock_timestamp() where id = v_ch.id;
    raise exception using errcode = 'P0001', message = 'Too many attempts. Request a new code.';
  end if;

  if encode(extensions.digest(coalesce(p_otp, ''), 'sha256'), 'hex') <> v_ch.otp_hash then
    update public.onboarding_otp_challenges
    set attempt_count = attempt_count + 1,
        consumed_at = case when attempt_count + 1 >= max_attempts then clock_timestamp() else consumed_at end
    where id = v_ch.id;
    raise exception using errcode = '22023', message = 'Incorrect code.';
  end if;

  update public.onboarding_otp_challenges
  set verified_at = clock_timestamp(), consumed_at = clock_timestamp()
  where id = v_ch.id;

  v_session := gen_random_uuid();
  v_expires := clock_timestamp() + make_interval(hours => greatest(1, least(coalesce(p_session_hours, 6), 24)));

  update public.onboarding_requests
  set session_token = v_session,
      session_expires_at = v_expires,
      status = case when status in ('draft','sent') then 'verified' else status end,
      verified_at = coalesce(verified_at, clock_timestamp())
  where id = v_req.id;

  return query select v_session, v_expires;
end;
$function$;

-- ─── Resolve a live session to a request id (internal helper) ────────────────
create or replace function public.onboarding_session_request(p_session_token uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
begin
  select id into v_id from public.onboarding_requests
  where session_token = p_session_token
    and session_expires_at > clock_timestamp()
    and status not in ('cancelled');
  if v_id is null then
    raise exception using errcode = 'P0001', message = 'Your session has expired. Please verify again.';
  end if;
  return v_id;
end;
$function$;

-- ─── Fetch the page context (checklist + active T&C) for a token ─────────────
create or replace function public.get_onboarding_context(p_public_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_req public.onboarding_requests%rowtype;
  v_terms public.onboarding_terms%rowtype;
  v_checklist jsonb;
begin
  select * into v_req from public.onboarding_requests where public_token = p_public_token;
  if v_req.id is null then
    raise exception using errcode = 'P0002', message = 'This onboarding link is invalid.';
  end if;

  select * into v_terms from public.onboarding_terms
  where division_code = v_req.division_code and is_active limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
           'document_key', c.document_key,
           'label', c.label,
           'description', c.description,
           'is_required', c.is_required
         ) order by c.sort_order), '[]'::jsonb)
  into v_checklist
  from public.onboarding_document_checklists c
  where c.division_code = v_req.division_code and c.is_active;

  return jsonb_build_object(
    'entity_name', v_req.entity_name,
    'entity_type', v_req.entity_type,
    'contact_name', v_req.contact_name,
    'division_code', v_req.division_code,
    'status', v_req.status,
    'checklist', v_checklist,
    'terms', case when v_terms.id is null then null else jsonb_build_object(
       'version', v_terms.version, 'title', v_terms.title, 'body', v_terms.body
    ) end
  );
end;
$function$;

-- ─── Save entity detail payload ──────────────────────────────────────────────
create or replace function public.save_onboarding_submission(
  p_session_token uuid,
  p_details jsonb,
  p_ip text default null,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_req_id uuid;
begin
  v_req_id := public.onboarding_session_request(p_session_token);
  insert into public.onboarding_submissions (request_id, details, submitted_ip, user_agent)
  values (v_req_id, coalesce(p_details, '{}'::jsonb), p_ip, p_user_agent)
  on conflict (request_id) do update
  set details = excluded.details,
      submitted_ip = coalesce(excluded.submitted_ip, public.onboarding_submissions.submitted_ip),
      user_agent = coalesce(excluded.user_agent, public.onboarding_submissions.user_agent),
      updated_at = now();

  update public.onboarding_requests
  set status = case when status in ('verified','sent','draft') then 'in_progress' else status end
  where id = v_req_id;
end;
$function$;

-- ─── Record an uploaded document (after the edge function stores it in Drive) ─
create or replace function public.record_onboarding_document(
  p_session_token uuid,
  p_document_key text,
  p_document_label text,
  p_file_name text,
  p_mime_type text,
  p_drive_file_id text,
  p_drive_folder_id text,
  p_web_view_link text,
  p_file_size bigint default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_req_id uuid;
  v_doc_id uuid;
begin
  v_req_id := public.onboarding_session_request(p_session_token);
  insert into public.onboarding_documents (
    request_id, document_key, document_label, file_name, mime_type,
    file_size, drive_file_id, drive_folder_id, web_view_link
  ) values (
    v_req_id, p_document_key, p_document_label, p_file_name, coalesce(p_mime_type, 'application/octet-stream'),
    p_file_size, p_drive_file_id, p_drive_folder_id, p_web_view_link
  )
  returning id into v_doc_id;
  return v_doc_id;
end;
$function$;

-- ─── Record live image + T&C acceptance and finalise ─────────────────────────
create or replace function public.accept_onboarding_terms(
  p_session_token uuid,
  p_terms_version text,
  p_live_image_drive_id text default null,
  p_live_image_link text default null,
  p_ip text default null,
  p_user_agent text default null
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_req public.onboarding_requests%rowtype;
  v_active text;
  v_at timestamptz;
begin
  select * into v_req from public.onboarding_requests
  where id = public.onboarding_session_request(p_session_token)
  for update;

  select version into v_active from public.onboarding_terms
  where division_code = v_req.division_code and is_active limit 1;

  if v_active is null or p_terms_version is distinct from v_active then
    raise exception using errcode = 'P0001',
      message = 'The Terms & Conditions have changed. Please reload and review the current version.';
  end if;

  insert into public.onboarding_terms_acceptances (
    request_id, division_code, terms_version, live_image_drive_id, accepted_ip, user_agent, acceptance_metadata
  ) values (
    v_req.id, v_req.division_code, v_active, p_live_image_drive_id, p_ip,
    left(coalesce(p_user_agent, ''), 1000),
    jsonb_build_object('live_image_link', p_live_image_link)
  )
  on conflict (request_id, terms_version) do update
  set live_image_drive_id = coalesce(excluded.live_image_drive_id, public.onboarding_terms_acceptances.live_image_drive_id),
      accepted_ip = coalesce(excluded.accepted_ip, public.onboarding_terms_acceptances.accepted_ip)
  returning accepted_at into v_at;

  update public.onboarding_submissions
  set live_image_drive_id = coalesce(p_live_image_drive_id, live_image_drive_id),
      live_image_link = coalesce(p_live_image_link, live_image_link),
      updated_at = now()
  where request_id = v_req.id;

  update public.onboarding_requests
  set terms_version = v_active,
      status = 'submitted',
      submitted_at = coalesce(submitted_at, clock_timestamp()),
      session_token = null,
      session_expires_at = null
  where id = v_req.id;

  return v_at;
end;
$function$;

-- Only the edge function (service_role) may execute these.
revoke all on function public.issue_onboarding_otp(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.verify_onboarding_otp(uuid, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.onboarding_session_request(uuid) from public, anon, authenticated;
revoke all on function public.get_onboarding_context(uuid) from public, anon, authenticated;
revoke all on function public.save_onboarding_submission(uuid, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.record_onboarding_document(uuid, text, text, text, text, text, text, text, bigint) from public, anon, authenticated;
revoke all on function public.accept_onboarding_terms(uuid, text, text, text, text, text) from public, anon, authenticated;

grant execute on function public.issue_onboarding_otp(uuid, integer, integer) to service_role;
grant execute on function public.verify_onboarding_otp(uuid, text, text, text, integer) to service_role;
grant execute on function public.onboarding_session_request(uuid) to service_role;
grant execute on function public.get_onboarding_context(uuid) to service_role;
grant execute on function public.save_onboarding_submission(uuid, jsonb, text, text) to service_role;
grant execute on function public.record_onboarding_document(uuid, text, text, text, text, text, text, text, bigint) to service_role;
grant execute on function public.accept_onboarding_terms(uuid, text, text, text, text, text) to service_role;

commit;

notify pgrst, 'reload schema';
