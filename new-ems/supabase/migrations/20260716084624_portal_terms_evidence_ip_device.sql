-- Capture server-observed IP and a privacy-safe EMS browser identifier during
-- Terms acceptance, and expose the evidence only through the authorised Portal
-- Access management RPC. The browser identifier is not a hardware fingerprint.

alter table public.legal_terms_acceptances
  add column if not exists accepted_ip inet,
  add column if not exists device_id text,
  add column if not exists device_fingerprint_version text;

comment on column public.legal_terms_acceptances.accepted_ip is
  'Server-observed source IP at the time the Terms acceptance RPC was received.';
comment on column public.legal_terms_acceptances.device_id is
  'Random EMS browser-installation identifier supplied by the accepting client; not a hardware serial.';

create or replace function public.accept_current_terms(
  p_terms_version text,
  p_user_agent text,
  p_evidence_mime_type text,
  p_evidence_base64 text,
  p_photo_consent boolean,
  p_face_detected boolean,
  p_face_confidence numeric,
  p_device_id text,
  p_transport_session_token text default null,
  p_external_session_token text default null
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor record;
  v_active_version text;
  v_acceptance_id uuid;
  v_accepted_at timestamptz;
  v_image bytea;
  v_policy jsonb;
  v_identity_required boolean;
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  v_ip_text text;
  v_ip inet;
  v_device_id text;
begin
  select * into v_actor
  from public.chat_current_actor(p_transport_session_token, p_external_session_token);

  select version into v_active_version
  from public.legal_terms_versions where is_active limit 1;
  if v_active_version is null or p_terms_version is distinct from v_active_version then
    raise exception 'The Terms and Conditions version has changed. Reload and review the current version.';
  end if;

  select value into v_policy from public.system_settings where key = 'terms.policy';
  v_identity_required := coalesce((v_policy->>'identity_capture_enabled')::boolean, false);

  v_device_id := left(nullif(trim(coalesce(p_device_id, '')), ''), 120);
  if v_device_id is not null and v_device_id !~ '^ems-device-v1:[0-9a-fA-F-]{36}$' then
    raise exception 'The EMS device identifier is invalid';
  end if;

  v_ip_text := nullif(trim(split_part(coalesce(
    v_headers->>'cf-connecting-ip',
    v_headers->>'x-real-ip',
    v_headers->>'x-forwarded-for',
    ''
  ), ',', 1)), '');
  begin
    v_ip := v_ip_text::inet;
  exception when others then
    v_ip := null;
  end;

  if v_identity_required then
    if p_photo_consent is distinct from true then raise exception 'Explicit identity-image consent is required'; end if;
    if p_face_detected is distinct from true or coalesce(p_face_confidence, 0) < 0.70 or p_face_confidence > 1 then
      raise exception 'A clear live face detection result is required';
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
  end if;

  insert into public.legal_terms_acceptances(
    actor_type, actor_id, terms_version, accepted_at, user_agent,
    identity_image_consent_at, privacy_notice_version, acceptance_metadata,
    accepted_ip, device_id, device_fingerprint_version
  ) values (
    v_actor.actor_type, v_actor.actor_id, v_active_version, clock_timestamp(),
    left(nullif(trim(coalesce(p_user_agent, '')), ''), 1000),
    case when v_identity_required then clock_timestamp() else null end,
    case when v_identity_required then 'identity-evidence-live-face-v2' else 'terms-acceptance-no-image-v1' end,
    jsonb_build_object(
      'method', case when v_identity_required then 'first_login_modal_live_camera_face_detection' else 'first_login_modal_electronic_acceptance' end,
      'identity_capture_required', v_identity_required,
      'recorded_by', v_actor.actor_type,
      'server_observed_ip', case when v_ip is null then null else host(v_ip) end,
      'device_id', v_device_id,
      'device_identifier_type', 'random_browser_installation_id',
      'jurisdiction', 'Rajamahendravaram, East Godavari District, Andhra Pradesh, India'
    ),
    v_ip, v_device_id, case when v_device_id is null then null else 'ems-random-browser-id-v1' end
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
  returning id, accepted_at into v_acceptance_id, v_accepted_at;

  if v_identity_required then
    insert into public.legal_terms_acceptance_evidence(
      acceptance_id, mime_type, image_data, image_size_bytes, image_sha256,
      captured_at, face_detected, face_detection_confidence, face_detector
    ) values (
      v_acceptance_id, p_evidence_mime_type, v_image, octet_length(v_image),
      encode(extensions.digest(v_image, 'sha256'), 'hex'), clock_timestamp(),
      true, p_face_confidence, 'MediaPipe FaceDetector blaze_face_short_range 0.10.35'
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
  end if;
  return v_accepted_at;
end;
$$;

-- Compatibility wrapper for a browser that still has the previous JavaScript
-- cached. It records the server IP while leaving device_id empty.
create or replace function public.accept_current_terms(
  p_terms_version text,
  p_user_agent text,
  p_evidence_mime_type text,
  p_evidence_base64 text,
  p_photo_consent boolean,
  p_face_detected boolean,
  p_face_confidence numeric,
  p_transport_session_token text default null,
  p_external_session_token text default null
)
returns timestamptz
language sql
security definer
set search_path = public
as $$
  select public.accept_current_terms(
    p_terms_version, p_user_agent, p_evidence_mime_type, p_evidence_base64,
    p_photo_consent, p_face_detected, p_face_confidence, null,
    p_transport_session_token, p_external_session_token
  );
$$;

create or replace function public.admin_get_portal_terms_consent_status(p_portal_system text, p_portal_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_type text;
  v_identity text;
  v_terms record;
  v_acceptance record;
  v_evidence record;
  v_archive record;
begin
  if not public.has_permission('portal-management', 'view') then
    raise exception 'Not authorized to view portal consent evidence';
  end if;

  if p_portal_system = 'transport' then
    v_actor_type := 'transport_portal';
    select coalesce(nullif(display_name, ''), nullif(email, ''), username) into v_identity
    from public.transport_portal_users where id = p_portal_user_id;
  elsif p_portal_system = 'external' then
    v_actor_type := 'external_portal';
    select coalesce(nullif(display_name, ''), nullif(email, ''), username) into v_identity
    from public.external_portal_users where id = p_portal_user_id;
  else
    raise exception 'Unsupported portal system';
  end if;
  if v_identity is null then raise exception 'Portal user not found'; end if;

  select version, title, effective_at into v_terms
  from public.legal_terms_versions where is_active limit 1;
  if v_terms.version is null then raise exception 'No active Terms and Conditions version is configured'; end if;

  select id, accepted_at, acceptance_metadata, user_agent, accepted_ip, device_id, device_fingerprint_version
  into v_acceptance
  from public.legal_terms_acceptances
  where actor_type = v_actor_type and actor_id = p_portal_user_id and terms_version = v_terms.version;

  if v_acceptance.id is not null then
    select mime_type, image_data, image_size_bytes, image_sha256, captured_at,
      face_detected, face_detection_confidence, face_detector
    into v_evidence
    from public.legal_terms_acceptance_evidence where acceptance_id = v_acceptance.id;
    select status, request_ip, folder_path, live_photo_web_view_link, terms_pdf_web_view_link,
      metadata_web_view_link, archived_at
    into v_archive
    from public.legal_terms_drive_archives where acceptance_id = v_acceptance.id;
  end if;

  return jsonb_build_object(
    'portal_system', p_portal_system,
    'portal_user_id', p_portal_user_id,
    'identity', v_identity,
    'terms_version', v_terms.version,
    'terms_title', v_terms.title,
    'effective_at', v_terms.effective_at,
    'accepted', v_acceptance.id is not null,
    'accepted_at', v_acceptance.accepted_at,
    'acceptance_source', case
      when v_acceptance.id is null then null
      when v_evidence.image_data is not null then 'user_live_camera'
      when v_acceptance.acceptance_metadata->>'method' = 'admin_recorded_individual_consent' then 'admin_recorded'
      else 'user_electronic'
    end,
    'consent_given_by', v_acceptance.acceptance_metadata->>'consent_given_by',
    'consent_basis', v_acceptance.acceptance_metadata->>'consent_basis',
    'recorded_by_name', v_acceptance.acceptance_metadata->>'recorded_by_name',
    'recorded_by_email', v_acceptance.acceptance_metadata->>'recorded_by_email',
    'notes', v_acceptance.acceptance_metadata->>'notes',
    'accepted_ip', coalesce(case when v_acceptance.accepted_ip is null then null else host(v_acceptance.accepted_ip) end, v_archive.request_ip),
    'device_id', v_acceptance.device_id,
    'device_identifier_type', v_acceptance.device_fingerprint_version,
    'user_agent', v_acceptance.user_agent,
    'evidence_available', v_evidence.image_data is not null,
    'evidence_image_data_url', case when v_evidence.image_data is null then null else
      'data:' || v_evidence.mime_type || ';base64,' || replace(encode(v_evidence.image_data, 'base64'), E'\n', '') end,
    'evidence_mime_type', v_evidence.mime_type,
    'evidence_size_bytes', v_evidence.image_size_bytes,
    'evidence_sha256', v_evidence.image_sha256,
    'evidence_captured_at', v_evidence.captured_at,
    'face_detected', v_evidence.face_detected,
    'face_confidence', v_evidence.face_detection_confidence,
    'face_detector', v_evidence.face_detector,
    'drive_archive_status', v_archive.status,
    'drive_archived_at', v_archive.archived_at,
    'drive_folder_path', v_archive.folder_path,
    'drive_live_photo_url', v_archive.live_photo_web_view_link,
    'drive_terms_pdf_url', v_archive.terms_pdf_web_view_link,
    'drive_audit_url', v_archive.metadata_web_view_link
  );
end;
$$;

revoke all on function public.accept_current_terms(text,text,text,text,boolean,boolean,numeric,text,text,text) from public, anon, authenticated;
revoke all on function public.accept_current_terms(text,text,text,text,boolean,boolean,numeric,text,text) from public, anon, authenticated;
grant execute on function public.accept_current_terms(text,text,text,text,boolean,boolean,numeric,text,text,text) to anon, authenticated, service_role;
grant execute on function public.accept_current_terms(text,text,text,text,boolean,boolean,numeric,text,text) to anon, authenticated, service_role;
revoke all on function public.admin_get_portal_terms_consent_status(text,uuid) from public, anon, authenticated;
grant execute on function public.admin_get_portal_terms_consent_status(text,uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
