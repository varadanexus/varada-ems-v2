-- Require a high-confidence single live face for new Terms evidence and provide
-- a short-lived, single-use phone handoff when the desktop has no usable camera.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'legal_terms_evidence_minimum_face_confidence'
      and conrelid = 'public.legal_terms_acceptance_evidence'::regclass
  ) then
    alter table public.legal_terms_acceptance_evidence
      add constraint legal_terms_evidence_minimum_face_confidence
      check (face_detected is not true or coalesce(face_detection_confidence, 0) >= 0.90) not valid;
  end if;
end;
$$;

create table if not exists public.legal_terms_mobile_handoffs (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  actor_type text not null check (actor_type in ('transport_portal','external_portal')),
  actor_id uuid not null,
  terms_version text not null references public.legal_terms_versions(version),
  requested_device_id text,
  requested_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','completed','expired','cancelled')),
  completed_at timestamptz,
  acceptance_id uuid references public.legal_terms_acceptances(id) on delete set null,
  completed_ip inet,
  completed_device_id text,
  completed_user_agent text,
  created_at timestamptz not null default now(),
  constraint legal_terms_mobile_handoff_expiry check (expires_at > requested_at)
);

create index if not exists idx_legal_terms_mobile_handoff_actor
  on public.legal_terms_mobile_handoffs(actor_type, actor_id, status, expires_at desc);

alter table public.legal_terms_mobile_handoffs enable row level security;
revoke all on table public.legal_terms_mobile_handoffs from public, anon, authenticated;
grant all on table public.legal_terms_mobile_handoffs to service_role;

comment on table public.legal_terms_mobile_handoffs is
  'Hashed, ten-minute, single-use handoffs for completing Terms live-face evidence on a phone.';

create or replace function public.create_terms_mobile_handoff(
  p_device_id text default null,
  p_transport_session_token text default null,
  p_external_session_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor record;
  v_terms record;
  v_policy jsonb;
  v_raw_token text;
  v_expires_at timestamptz := clock_timestamp() + interval '10 minutes';
  v_device_id text;
begin
  select * into v_actor
  from public.chat_current_actor(p_transport_session_token, p_external_session_token);

  select version, title into v_terms
  from public.legal_terms_versions where is_active limit 1;
  if v_terms.version is null then raise exception 'No active Terms and Conditions version is configured'; end if;

  select value into v_policy from public.system_settings where key = 'terms.policy';
  if not coalesce((v_policy->>'identity_capture_enabled')::boolean, false) then
    raise exception 'Live identity evidence is not enabled';
  end if;

  v_device_id := left(nullif(trim(coalesce(p_device_id, '')), ''), 120);
  if v_device_id is not null and v_device_id !~ '^ems-device-v1:[0-9a-fA-F-]{36}$' then
    raise exception 'The EMS device identifier is invalid';
  end if;

  update public.legal_terms_mobile_handoffs
  set status = 'cancelled'
  where actor_type = v_actor.actor_type and actor_id = v_actor.actor_id
    and status = 'pending';

  v_raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.legal_terms_mobile_handoffs(
    token_hash, actor_type, actor_id, terms_version, requested_device_id, expires_at
  ) values (
    encode(extensions.digest(convert_to(v_raw_token, 'UTF8'), 'sha256'), 'hex'),
    v_actor.actor_type, v_actor.actor_id, v_terms.version, v_device_id, v_expires_at
  );

  return jsonb_build_object(
    'handoff_token', v_raw_token,
    'terms_version', v_terms.version,
    'terms_title', v_terms.title,
    'expires_at', v_expires_at,
    'expires_in_seconds', 600
  );
end;
$$;

create or replace function public.get_terms_mobile_handoff(p_handoff_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_handoff record;
  v_terms record;
begin
  if nullif(trim(coalesce(p_handoff_token, '')), '') is null then
    raise exception 'The mobile handoff token is required';
  end if;

  select * into v_handoff
  from public.legal_terms_mobile_handoffs
  where token_hash = encode(extensions.digest(convert_to(trim(p_handoff_token), 'UTF8'), 'sha256'), 'hex');
  if v_handoff.id is null then raise exception 'This mobile capture link is invalid'; end if;

  if v_handoff.status = 'pending' and v_handoff.expires_at <= clock_timestamp() then
    update public.legal_terms_mobile_handoffs set status = 'expired' where id = v_handoff.id;
    v_handoff.status := 'expired';
  end if;

  select title, effective_at into v_terms
  from public.legal_terms_versions where version = v_handoff.terms_version;

  return jsonb_build_object(
    'status', v_handoff.status,
    'terms_version', v_handoff.terms_version,
    'terms_title', v_terms.title,
    'effective_at', v_terms.effective_at,
    'expires_at', v_handoff.expires_at,
    'completed_at', v_handoff.completed_at
  );
end;
$$;

create or replace function public.complete_terms_mobile_handoff(
  p_handoff_token text,
  p_evidence_mime_type text,
  p_evidence_base64 text,
  p_photo_consent boolean,
  p_terms_accepted boolean,
  p_face_detected boolean,
  p_face_confidence numeric,
  p_device_id text,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_handoff record;
  v_active_version text;
  v_acceptance_id uuid;
  v_accepted_at timestamptz := clock_timestamp();
  v_image bytea;
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  v_ip_text text;
  v_ip inet;
  v_device_id text;
begin
  if nullif(trim(coalesce(p_handoff_token, '')), '') is null then
    raise exception 'The mobile handoff token is required';
  end if;

  select * into v_handoff
  from public.legal_terms_mobile_handoffs
  where token_hash = encode(extensions.digest(convert_to(trim(p_handoff_token), 'UTF8'), 'sha256'), 'hex')
  for update;
  if v_handoff.id is null then raise exception 'This mobile capture link is invalid'; end if;
  if v_handoff.status <> 'pending' then raise exception 'This mobile capture link is no longer available'; end if;
  if v_handoff.expires_at <= clock_timestamp() then
    update public.legal_terms_mobile_handoffs set status = 'expired' where id = v_handoff.id;
    raise exception 'This mobile capture link has expired. Generate a new QR code on the computer.';
  end if;

  select version into v_active_version from public.legal_terms_versions where is_active limit 1;
  if v_active_version is distinct from v_handoff.terms_version then
    raise exception 'The Terms and Conditions version has changed. Generate a new QR code.';
  end if;
  if p_terms_accepted is distinct from true then raise exception 'Terms acceptance is required'; end if;
  if p_photo_consent is distinct from true then raise exception 'Explicit identity-image consent is required'; end if;
  if p_face_detected is distinct from true or coalesce(p_face_confidence, 0) < 0.90 or p_face_confidence > 1 then
    raise exception 'Recapture is required with at least 90 percent face detection confidence';
  end if;
  if p_evidence_mime_type <> 'image/jpeg' then raise exception 'Live identity evidence must be a JPEG camera capture'; end if;
  if nullif(p_evidence_base64, '') is null or length(p_evidence_base64) > 2100000 then
    raise exception 'Identity image is missing or too large';
  end if;
  begin
    v_image := decode(p_evidence_base64, 'base64');
  exception when others then
    raise exception 'Identity image data is invalid';
  end;
  if octet_length(v_image) < 1000 or octet_length(v_image) > 1500000 then
    raise exception 'Identity image must be between 1 KB and 1.5 MB';
  end if;

  v_device_id := left(nullif(trim(coalesce(p_device_id, '')), ''), 120);
  if v_device_id is null or v_device_id !~ '^ems-device-v1:[0-9a-fA-F-]{36}$' then
    raise exception 'A valid EMS mobile device identifier is required';
  end if;

  v_ip_text := nullif(trim(split_part(coalesce(
    v_headers->>'cf-connecting-ip', v_headers->>'x-real-ip', v_headers->>'x-forwarded-for', ''
  ), ',', 1)), '');
  begin v_ip := v_ip_text::inet; exception when others then v_ip := null; end;

  insert into public.legal_terms_acceptances(
    actor_type, actor_id, terms_version, accepted_at, user_agent,
    identity_image_consent_at, privacy_notice_version, acceptance_metadata,
    accepted_ip, device_id, device_fingerprint_version
  ) values (
    v_handoff.actor_type, v_handoff.actor_id, v_handoff.terms_version, v_accepted_at,
    left(nullif(trim(coalesce(p_user_agent, '')), ''), 1000), v_accepted_at,
    'identity-evidence-live-face-v3-mobile-handoff',
    jsonb_build_object(
      'method', 'mobile_qr_handoff_live_camera_face_detection',
      'identity_capture_required', true,
      'minimum_face_confidence', 0.90,
      'server_observed_ip', case when v_ip is null then null else host(v_ip) end,
      'device_id', v_device_id,
      'device_identifier_type', 'random_browser_installation_id',
      'handoff_id', v_handoff.id,
      'jurisdiction', 'Rajamahendravaram, East Godavari District, Andhra Pradesh, India'
    ),
    v_ip, v_device_id, 'ems-random-browser-id-v1'
  )
  on conflict (actor_type, actor_id, terms_version) do update
  set accepted_at = excluded.accepted_at,
      user_agent = excluded.user_agent,
      identity_image_consent_at = excluded.identity_image_consent_at,
      privacy_notice_version = excluded.privacy_notice_version,
      acceptance_metadata = excluded.acceptance_metadata,
      accepted_ip = excluded.accepted_ip,
      device_id = excluded.device_id,
      device_fingerprint_version = excluded.device_fingerprint_version
  returning id into v_acceptance_id;

  insert into public.legal_terms_acceptance_evidence(
    acceptance_id, mime_type, image_data, image_size_bytes, image_sha256,
    captured_at, face_detected, face_detection_confidence, face_detector
  ) values (
    v_acceptance_id, p_evidence_mime_type, v_image, octet_length(v_image),
    encode(extensions.digest(v_image, 'sha256'), 'hex'), v_accepted_at,
    true, p_face_confidence, 'MediaPipe FaceDetector blaze_face_short_range 0.10.35 mobile'
  )
  on conflict (acceptance_id) do update
  set mime_type = excluded.mime_type,
      image_data = excluded.image_data,
      image_size_bytes = excluded.image_size_bytes,
      image_sha256 = excluded.image_sha256,
      captured_at = excluded.captured_at,
      face_detected = excluded.face_detected,
      face_detection_confidence = excluded.face_detection_confidence,
      face_detector = excluded.face_detector;

  update public.legal_terms_mobile_handoffs
  set status = 'completed', completed_at = v_accepted_at, acceptance_id = v_acceptance_id,
      completed_ip = v_ip, completed_device_id = v_device_id,
      completed_user_agent = left(nullif(trim(coalesce(p_user_agent, '')), ''), 1000)
  where id = v_handoff.id and status = 'pending';

  return jsonb_build_object('completed', true, 'accepted_at', v_accepted_at);
end;
$$;

create or replace function public.get_terms_mobile_handoff_status(p_handoff_token text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.get_terms_mobile_handoff(p_handoff_token);
$$;

revoke all on function public.create_terms_mobile_handoff(text,text,text) from public, anon, authenticated;
grant execute on function public.create_terms_mobile_handoff(text,text,text) to anon, authenticated, service_role;
revoke all on function public.get_terms_mobile_handoff(text) from public, anon, authenticated;
grant execute on function public.get_terms_mobile_handoff(text) to anon, authenticated, service_role;
revoke all on function public.complete_terms_mobile_handoff(text,text,text,boolean,boolean,boolean,numeric,text,text) from public, anon, authenticated;
grant execute on function public.complete_terms_mobile_handoff(text,text,text,boolean,boolean,boolean,numeric,text,text) to anon, authenticated, service_role;
revoke all on function public.get_terms_mobile_handoff_status(text) from public, anon, authenticated;
grant execute on function public.get_terms_mobile_handoff_status(text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
