-- Strengthen Digital Marketing & Services disclaimer acknowledgements with
-- live identity evidence, server-captured network evidence, and authorised
-- representative details for organisational accounts.

alter table public.marketing_portal_disclaimer_acceptances
  add column if not exists authorized_person_name text,
  add column if not exists acceptance_ip inet,
  add column if not exists evidence_mime_type text,
  add column if not exists evidence_image bytea,
  add column if not exists evidence_size_bytes integer,
  add column if not exists evidence_sha256 text,
  add column if not exists photo_consent_at timestamptz,
  add column if not exists face_detected boolean,
  add column if not exists face_detection_confidence numeric(6,5),
  add column if not exists face_detector text,
  add column if not exists acceptance_metadata jsonb not null default '{}'::jsonb;

create or replace function public.marketing_portal_disclaimer_status(
  p_session_token text,
  p_portal_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_type text := lower(trim(coalesce(p_portal_type, '')));
  v_version text;
  v_hash text;
  v_accepted_at timestamptz;
  v_requires_authorized_person boolean := false;
  v_entity_name text;
  v_suggested_person text;
begin
  if v_type not in ('client', 'vendor') then
    raise exception 'Invalid portal type' using errcode = '22023';
  end if;

  select * into v_ctx from public.marketing_portal_resolve(p_session_token);
  if v_ctx.portal_user_id is null or v_ctx.actor_kind is distinct from v_type then
    raise exception 'The portal session is invalid or does not match this disclaimer'
      using errcode = '42501';
  end if;

  if v_type = 'client' then
    v_version := '2026-07-13-client-v2';
    v_hash := 'marketing-client-disclaimer-live-evidence-20260713-v2';
    v_requires_authorized_person := true;
    select c.company_name, c.contact_name
      into v_entity_name, v_suggested_person
    from public.marketing_clients c
    where c.id = v_ctx.profile_id;
  else
    v_version := '2026-07-13-vendor-v2';
    v_hash := 'marketing-vendor-disclaimer-live-evidence-20260713-v2';
    select v.legal_name, v.contact_name, (v.vendor_type <> 'freelancer')
      into v_entity_name, v_suggested_person, v_requires_authorized_person
    from public.marketing_vendors v
    where v.id = v_ctx.profile_id;
  end if;

  if v_entity_name is null then
    raise exception 'The portal profile could not be resolved' using errcode = '42501';
  end if;

  select a.accepted_at into v_accepted_at
  from public.marketing_portal_disclaimer_acceptances a
  where a.portal_user_id = v_ctx.portal_user_id
    and a.portal_type = v_type
    and a.disclaimer_version = v_version
    and a.content_hash = v_hash
    and a.acceptance_ip is not null
    and a.evidence_image is not null
    and a.face_detected is true
    and (not v_requires_authorized_person or nullif(trim(a.authorized_person_name), '') is not null);

  return jsonb_build_object(
    'accepted', v_accepted_at is not null,
    'accepted_at', v_accepted_at,
    'portal_type', v_type,
    'disclaimer_version', v_version,
    'content_hash', v_hash,
    'requires_authorized_person', v_requires_authorized_person,
    'entity_name', v_entity_name,
    'suggested_authorized_person', v_suggested_person,
    'identity_capture_required', true,
    'ip_capture_required', true
  );
end;
$$;

drop function if exists public.accept_marketing_portal_disclaimer(text, text, text, text);

create function public.accept_marketing_portal_disclaimer(
  p_session_token text,
  p_portal_type text,
  p_disclaimer_version text,
  p_authorized_person_name text,
  p_evidence_mime_type text,
  p_evidence_base64 text,
  p_photo_consent boolean,
  p_face_detected boolean,
  p_face_confidence numeric,
  p_user_agent text default null
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_type text := lower(trim(coalesce(p_portal_type, '')));
  v_expected_version text;
  v_hash text;
  v_accepted_at timestamptz;
  v_image bytea;
  v_headers jsonb := '{}'::jsonb;
  v_ip_text text;
  v_ip inet;
  v_server_user_agent text;
  v_requires_authorized_person boolean := false;
  v_entity_name text;
  v_person_name text := nullif(trim(coalesce(p_authorized_person_name, '')), '');
begin
  if v_type not in ('client', 'vendor') then
    raise exception 'Invalid portal type' using errcode = '22023';
  end if;

  select * into v_ctx from public.marketing_portal_resolve(p_session_token);
  if v_ctx.portal_user_id is null or v_ctx.actor_kind is distinct from v_type then
    raise exception 'The portal session is invalid or does not match this disclaimer'
      using errcode = '42501';
  end if;

  if v_type = 'client' then
    v_expected_version := '2026-07-13-client-v2';
    v_hash := 'marketing-client-disclaimer-live-evidence-20260713-v2';
    v_requires_authorized_person := true;
    select c.company_name into v_entity_name
    from public.marketing_clients c where c.id = v_ctx.profile_id;
  else
    v_expected_version := '2026-07-13-vendor-v2';
    v_hash := 'marketing-vendor-disclaimer-live-evidence-20260713-v2';
    select v.legal_name, (v.vendor_type <> 'freelancer')
      into v_entity_name, v_requires_authorized_person
    from public.marketing_vendors v where v.id = v_ctx.profile_id;
  end if;

  if v_entity_name is null then
    raise exception 'The portal profile could not be resolved' using errcode = '42501';
  end if;
  if p_disclaimer_version is distinct from v_expected_version then
    raise exception 'This disclaimer has changed. Refresh the page and review the current version.'
      using errcode = '22023';
  end if;

  if v_requires_authorized_person then
    if v_person_name is null or length(v_person_name) < 2 or length(v_person_name) > 160
      or v_person_name !~ '[[:alpha:]]' then
      raise exception 'Enter the full name of the authorised person accepting for this organisation';
    end if;
  elsif v_person_name is not null and length(v_person_name) > 160 then
    raise exception 'The accepting person name is too long';
  end if;

  if p_photo_consent is distinct from true then
    raise exception 'Explicit consent to capture and retain the live identity image is required';
  end if;
  if p_face_detected is distinct from true
    or coalesce(p_face_confidence, 0) < 0.70 or p_face_confidence > 1 then
    raise exception 'A clear live face detection result is required';
  end if;
  if p_evidence_mime_type <> 'image/jpeg' then
    raise exception 'Live identity evidence must be a JPEG camera capture';
  end if;
  if nullif(p_evidence_base64, '') is null or length(p_evidence_base64) > 2100000 then
    raise exception 'The live identity image is missing or too large';
  end if;
  begin
    v_image := decode(p_evidence_base64, 'base64');
  exception when others then
    raise exception 'The live identity image data is invalid';
  end;
  if octet_length(v_image) < 1000 or octet_length(v_image) > 1500000 then
    raise exception 'The live identity image must be between 1 KB and 1.5 MB';
  end if;

  begin
    v_headers := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  exception when others then
    v_headers := '{}'::jsonb;
  end;
  v_ip_text := trim(split_part(coalesce(
    v_headers->>'x-forwarded-for',
    v_headers->>'cf-connecting-ip',
    v_headers->>'x-real-ip',
    ''
  ), ',', 1));
  begin
    v_ip := nullif(v_ip_text, '')::inet;
  exception when others then
    raise exception 'The network address supplied with this acceptance is invalid';
  end;
  if v_ip is null then
    raise exception 'The network address could not be captured. Please reconnect and try again.';
  end if;
  v_server_user_agent := left(coalesce(nullif(v_headers->>'user-agent', ''), nullif(trim(coalesce(p_user_agent, '')), '')), 1000);

  insert into public.marketing_portal_disclaimer_acceptances (
    portal_user_id, profile_id, portal_type, disclaimer_version, content_hash,
    accepted_at, user_agent, authorized_person_name, acceptance_ip,
    evidence_mime_type, evidence_image, evidence_size_bytes, evidence_sha256,
    photo_consent_at, face_detected, face_detection_confidence, face_detector,
    acceptance_metadata
  ) values (
    v_ctx.portal_user_id, v_ctx.profile_id, v_type, v_expected_version, v_hash,
    clock_timestamp(), v_server_user_agent, v_person_name, v_ip,
    p_evidence_mime_type, v_image, octet_length(v_image),
    encode(extensions.digest(v_image, 'sha256'), 'hex'),
    clock_timestamp(), true, p_face_confidence,
    'MediaPipe FaceDetector blaze_face_short_range 0.10.35',
    jsonb_build_object(
      'method', 'first_login_disclaimer_live_camera_face_detection',
      'entity_name', v_entity_name,
      'requires_authorized_person', v_requires_authorized_person,
      'ip_source', case
        when v_headers ? 'x-forwarded-for' then 'x-forwarded-for'
        when v_headers ? 'cf-connecting-ip' then 'cf-connecting-ip'
        else 'x-real-ip'
      end,
      'jurisdiction', 'Rajamahendravaram, East Godavari District, Andhra Pradesh, India'
    )
  )
  on conflict (portal_user_id, portal_type, disclaimer_version) do nothing;

  select a.accepted_at into v_accepted_at
  from public.marketing_portal_disclaimer_acceptances a
  where a.portal_user_id = v_ctx.portal_user_id
    and a.portal_type = v_type
    and a.disclaimer_version = v_expected_version
    and a.content_hash = v_hash
    and a.acceptance_ip is not null
    and a.evidence_image is not null
    and a.face_detected is true
    and (not v_requires_authorized_person or nullif(trim(a.authorized_person_name), '') is not null);

  if v_accepted_at is null then
    raise exception 'The disclaimer acceptance evidence could not be recorded';
  end if;
  return v_accepted_at;
end;
$$;

revoke all on function public.marketing_portal_disclaimer_status(text, text) from public, anon, authenticated;
revoke all on function public.accept_marketing_portal_disclaimer(text, text, text, text, text, text, boolean, boolean, numeric, text) from public, anon, authenticated;
grant execute on function public.marketing_portal_disclaimer_status(text, text) to anon, authenticated;
grant execute on function public.accept_marketing_portal_disclaimer(text, text, text, text, text, text, boolean, boolean, numeric, text) to anon, authenticated;

comment on column public.marketing_portal_disclaimer_acceptances.acceptance_ip is
  'Client network address captured server-side from the trusted Data API request context.';
comment on column public.marketing_portal_disclaimer_acceptances.evidence_image is
  'Restricted live JPEG identity evidence; never directly exposed to portal roles.';

notify pgrst, 'reload schema';
