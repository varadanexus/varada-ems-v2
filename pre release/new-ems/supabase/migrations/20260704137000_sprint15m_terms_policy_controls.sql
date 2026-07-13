-- Configurable Terms and Conditions policy and optional live identity evidence.

alter table public.system_settings
  drop constraint if exists system_settings_single_row;

create sequence if not exists public.system_settings_id_seq;

select setval(
  'public.system_settings_id_seq',
  greatest(coalesce((select max(id) from public.system_settings), 0), 1),
  true
);

alter sequence public.system_settings_id_seq owned by public.system_settings.id;

alter table public.system_settings
  alter column id set default nextval('public.system_settings_id_seq'::regclass);

update public.system_settings
set key = 'legacy.maintenance'
where key is null;

delete from public.system_settings kept
using public.system_settings duplicate
where kept.key = duplicate.key
  and kept.ctid < duplicate.ctid;

alter table public.system_settings
  drop constraint if exists system_settings_key_key;

alter table public.system_settings
  add constraint system_settings_key_key unique (key);

insert into public.system_settings(key, value, updated_at)
values (
  'terms.policy',
  jsonb_build_object(
    'popup_enabled', true,
    'identity_capture_enabled', false,
    'require_full_scroll', true,
    'allow_decline', true,
    'version', '2026-07-04-v4',
    'title', 'Varada Nexus EMS Terms and Conditions',
    'acceptance_label', 'I have read, understood and agree to the complete Terms and Conditions, Confidentiality Undertaking and Acceptable Use Rules.',
    'sections', '[]'::jsonb
  ),
  now()
)
on conflict (key) do update
set value = coalesce(public.system_settings.value, '{}'::jsonb)
  || jsonb_build_object('identity_capture_enabled', false),
    updated_at = now();

drop function if exists public.get_my_terms_acceptance_status(text, text);

create function public.get_my_terms_acceptance_status(
  p_transport_session_token text default null,
  p_external_session_token text default null
)
returns table(
  actor_type text,
  actor_id uuid,
  terms_version text,
  title text,
  effective_at timestamptz,
  accepted boolean,
  accepted_at timestamptz,
  popup_enabled boolean,
  identity_capture_enabled boolean,
  require_full_scroll boolean,
  allow_decline boolean,
  acceptance_label text,
  sections jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor record;
  v_terms record;
  v_policy jsonb;
  v_identity_required boolean;
begin
  select * into v_actor
  from public.chat_current_actor(p_transport_session_token, p_external_session_token);

  select * into v_terms
  from public.legal_terms_versions
  where is_active
  limit 1;

  if v_terms.version is null then
    raise exception 'No active Terms and Conditions version is configured';
  end if;

  select value into v_policy
  from public.system_settings
  where key = 'terms.policy';

  v_policy := coalesce(v_policy, '{}'::jsonb);
  v_identity_required := coalesce((v_policy->>'identity_capture_enabled')::boolean, false);

  return query
  select
    v_actor.actor_type::text,
    v_actor.actor_id::uuid,
    v_terms.version::text,
    coalesce(nullif(v_policy->>'title', ''), v_terms.title)::text,
    v_terms.effective_at::timestamptz,
    (
      a.id is not null
      and (not v_identity_required or e.id is not null)
    )::boolean,
    a.accepted_at::timestamptz,
    coalesce((v_policy->>'popup_enabled')::boolean, true),
    v_identity_required,
    coalesce((v_policy->>'require_full_scroll')::boolean, true),
    coalesce((v_policy->>'allow_decline')::boolean, true),
    coalesce(
      nullif(v_policy->>'acceptance_label', ''),
      'I have read, understood and agree to the complete Terms and Conditions.'
    )::text,
    coalesce(v_policy->'sections', '[]'::jsonb)
  from (select 1) seed
  left join public.legal_terms_acceptances a
    on a.actor_type = v_actor.actor_type
   and a.actor_id = v_actor.actor_id
   and a.terms_version = v_terms.version
  left join public.legal_terms_acceptance_evidence e
    on e.acceptance_id = a.id;
end;
$$;

drop function if exists public.accept_current_terms(text, text, text, text, boolean, boolean, numeric, text, text);

create function public.accept_current_terms(
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
  v_policy jsonb;
  v_identity_required boolean;
begin
  select * into v_actor
  from public.chat_current_actor(p_transport_session_token, p_external_session_token);

  select version into v_active_version
  from public.legal_terms_versions
  where is_active
  limit 1;

  if v_active_version is null or p_terms_version is distinct from v_active_version then
    raise exception 'The Terms and Conditions version has changed. Reload and review the current version.';
  end if;

  select value into v_policy
  from public.system_settings
  where key = 'terms.policy';
  v_identity_required := coalesce((v_policy->>'identity_capture_enabled')::boolean, false);

  if v_identity_required then
    if p_photo_consent is distinct from true then
      raise exception 'Explicit identity-image consent is required';
    end if;
    if p_face_detected is distinct from true
      or coalesce(p_face_confidence, 0) < 0.70
      or p_face_confidence > 1 then
      raise exception 'A clear live face detection result is required';
    end if;
    if p_evidence_mime_type <> 'image/jpeg' then
      raise exception 'Live identity evidence must be a JPEG camera capture';
    end if;
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
    identity_image_consent_at, privacy_notice_version, acceptance_metadata
  )
  values (
    v_actor.actor_type, v_actor.actor_id, v_active_version, clock_timestamp(),
    left(nullif(trim(coalesce(p_user_agent, '')), ''), 1000),
    case when v_identity_required then clock_timestamp() else null end,
    case when v_identity_required then 'identity-evidence-live-face-v2' else 'terms-acceptance-no-image-v1' end,
    jsonb_build_object(
      'method', case when v_identity_required
        then 'first_login_modal_live_camera_face_detection'
        else 'first_login_modal_electronic_acceptance'
      end,
      'identity_capture_required', v_identity_required,
      'recorded_by', v_actor.actor_type,
      'jurisdiction', 'Rajamahendravaram, East Godavari District, Andhra Pradesh, India'
    )
  )
  on conflict (actor_type, actor_id, terms_version) do update
  set accepted_at = excluded.accepted_at,
      user_agent = excluded.user_agent,
      identity_image_consent_at = excluded.identity_image_consent_at,
      privacy_notice_version = excluded.privacy_notice_version,
      acceptance_metadata = excluded.acceptance_metadata
  returning id, accepted_at into v_acceptance_id, v_accepted_at;

  if v_identity_required then
    insert into public.legal_terms_acceptance_evidence(
      acceptance_id, mime_type, image_data, image_size_bytes, image_sha256,
      captured_at, face_detected, face_detection_confidence, face_detector
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
  end if;

  return v_accepted_at;
end;
$$;

drop function if exists public.publish_terms_policy(text);

create function public.publish_terms_policy(p_title text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version text;
  v_policy jsonb;
  v_title text;
begin
  if not (public.is_super_admin() or public.has_permission('settings', 'edit')) then
    raise exception 'Not allowed to publish Terms and Conditions policy';
  end if;

  select coalesce(value, '{}'::jsonb) into v_policy
  from public.system_settings
  where key = 'terms.policy';

  v_title := coalesce(
    nullif(trim(p_title), ''),
    nullif(v_policy->>'title', ''),
    'Varada Nexus EMS Terms and Conditions'
  );
  v_version := 'terms-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');

  update public.legal_terms_versions
  set is_active = false
  where is_active;

  insert into public.legal_terms_versions(version, title, effective_at, content_hash, is_active)
  values (
    v_version,
    v_title,
    clock_timestamp(),
    'system-settings-terms-policy-' || v_version,
    true
  );

  insert into public.system_settings(key, value, updated_at)
  values (
    'terms.policy',
    coalesce(v_policy, '{}'::jsonb) || jsonb_build_object('version', v_version, 'title', v_title),
    now()
  )
  on conflict (key) do update
  set value = coalesce(public.system_settings.value, '{}'::jsonb)
    || jsonb_build_object('version', v_version, 'title', v_title),
      updated_at = now();

  return v_version;
end;
$$;

grant execute on function public.get_my_terms_acceptance_status(text, text) to anon, authenticated;
grant execute on function public.accept_current_terms(text, text, text, text, boolean, boolean, numeric, text, text) to anon, authenticated;
grant execute on function public.publish_terms_policy(text) to authenticated;

notify pgrst, 'reload schema';
