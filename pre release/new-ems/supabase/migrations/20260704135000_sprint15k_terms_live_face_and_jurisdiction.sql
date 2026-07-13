-- Varada Nexus EMS terms v3: live face evidence and Rajamahendravaram jurisdiction.

update public.legal_terms_versions set is_active = false where is_active;

insert into public.legal_terms_versions(version, title, effective_at, content_hash, is_active)
values ('2026-07-04-v3', 'Varada Nexus EMS Terms, Confidentiality, Acceptable Use and Jurisdiction', '2026-07-04 00:00:00+05:30', 'varada-nexus-ems-terms-v3-live-face-rajamahendravaram', true)
on conflict (version) do update
set title = excluded.title,
    effective_at = excluded.effective_at,
    content_hash = excluded.content_hash,
    is_active = true;

alter table public.legal_terms_acceptance_evidence
  add column if not exists face_detected boolean not null default false,
  add column if not exists face_detection_confidence numeric(6,5),
  add column if not exists face_detector text;

revoke execute on function public.accept_current_terms(text, text, text, text, boolean, text, text) from public, anon, authenticated;

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
begin
  select * into v_actor from public.chat_current_actor(p_transport_session_token, p_external_session_token);
  select version into v_active_version from public.legal_terms_versions where is_active limit 1;
  if v_active_version is null or p_terms_version is distinct from v_active_version then
    raise exception 'The Terms and Conditions version has changed. Reload and review the current version.';
  end if;
  if p_photo_consent is distinct from true then raise exception 'Explicit identity-image consent is required'; end if;
  if p_face_detected is distinct from true or coalesce(p_face_confidence, 0) < 0.70 or p_face_confidence > 1 then
    raise exception 'A clear live face detection result is required';
  end if;
  if p_evidence_mime_type <> 'image/jpeg' then raise exception 'Live identity evidence must be a JPEG camera capture'; end if;
  if nullif(p_evidence_base64, '') is null or length(p_evidence_base64) > 2100000 then raise exception 'Identity image is missing or too large'; end if;

  begin
    v_image := decode(p_evidence_base64, 'base64');
  exception when others then
    raise exception 'Identity image data is invalid';
  end;
  if octet_length(v_image) < 1000 or octet_length(v_image) > 1500000 then raise exception 'Identity image must be between 1 KB and 1.5 MB'; end if;

  insert into public.legal_terms_acceptances(
    actor_type, actor_id, terms_version, accepted_at, user_agent, identity_image_consent_at,
    privacy_notice_version, acceptance_metadata
  )
  values (
    v_actor.actor_type, v_actor.actor_id, v_active_version, clock_timestamp(),
    left(nullif(trim(coalesce(p_user_agent, '')), ''), 1000), clock_timestamp(),
    'identity-evidence-live-face-v2',
    jsonb_build_object(
      'method', 'first_login_modal_live_camera_face_detection',
      'recorded_by', v_actor.actor_type,
      'jurisdiction', 'Rajamahendravaram, East Godavari District, Andhra Pradesh, India'
    )
  )
  on conflict (actor_type, actor_id, terms_version) do update
  set user_agent = excluded.user_agent,
      identity_image_consent_at = excluded.identity_image_consent_at,
      privacy_notice_version = excluded.privacy_notice_version,
      acceptance_metadata = excluded.acceptance_metadata
  returning id, accepted_at into v_acceptance_id, v_accepted_at;

  insert into public.legal_terms_acceptance_evidence(
    acceptance_id, mime_type, image_data, image_size_bytes, image_sha256, captured_at,
    face_detected, face_detection_confidence, face_detector
  )
  values (
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

  return v_accepted_at;
end;
$$;

grant execute on function public.accept_current_terms(text, text, text, text, boolean, boolean, numeric, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
