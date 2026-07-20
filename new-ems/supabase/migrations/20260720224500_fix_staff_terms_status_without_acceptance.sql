-- A staff member with no current T&C acceptance left the evidence/archive
-- RECORD variables structurally unassigned, causing the admin status RPC to
-- raise a 500 while building its JSON response. Typed row variables remain
-- safely addressable and return null fields when SELECT finds no row.

create or replace function public.admin_get_staff_terms_consent_status(p_app_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_identity text;
  v_terms public.legal_terms_versions%rowtype;
  v_acceptance public.legal_terms_acceptances%rowtype;
  v_evidence public.legal_terms_acceptance_evidence%rowtype;
  v_archive public.legal_terms_drive_archives%rowtype;
  v_request public.legal_terms_reacceptance_requests%rowtype;
begin
  if not (public.is_super_admin() or public.has_permission('users', 'view')) then
    raise exception 'Not authorized to view EMS user consent evidence';
  end if;

  select coalesce(nullif(display_name, ''), nullif(email, ''), nullif(username, ''), id::text)
  into v_identity
  from public.app_users
  where id = p_app_user_id;
  if v_identity is null then raise exception 'EMS user not found'; end if;

  select * into v_terms
  from public.legal_terms_versions
  where is_active
  order by effective_at desc
  limit 1;
  if v_terms.version is null then raise exception 'No active Terms and Conditions version is configured'; end if;

  select * into v_acceptance
  from public.legal_terms_acceptances
  where actor_type = 'staff' and actor_id = p_app_user_id and terms_version = v_terms.version
  order by accepted_at desc
  limit 1;

  if v_acceptance.id is not null then
    select * into v_evidence
    from public.legal_terms_acceptance_evidence
    where acceptance_id = v_acceptance.id
    order by captured_at desc
    limit 1;

    select * into v_archive
    from public.legal_terms_drive_archives
    where acceptance_id = v_acceptance.id
    limit 1;
  end if;

  select * into v_request
  from public.legal_terms_reacceptance_requests
  where actor_type = 'staff' and actor_id = p_app_user_id
    and terms_version = v_terms.version and status = 'pending'
  order by requested_at desc
  limit 1;

  return jsonb_build_object(
    'app_user_id', p_app_user_id,
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
    'accepted_ip', coalesce(
      case when v_acceptance.accepted_ip is null then null else host(v_acceptance.accepted_ip) end,
      v_archive.request_ip
    ),
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
    'drive_audit_url', v_archive.metadata_web_view_link,
    'reacceptance_pending', v_request.id is not null,
    'reacceptance_request_id', v_request.id,
    'reacceptance_requested_at', v_request.requested_at,
    'reacceptance_reason', v_request.reason
  );
end;
$$;

revoke all on function public.admin_get_staff_terms_consent_status(uuid) from public, anon, authenticated;
grant execute on function public.admin_get_staff_terms_consent_status(uuid) to authenticated, service_role;

-- The request RPC had the same unassigned RECORD problem when a user had
-- never accepted the current terms. Keep the prior-acceptance link nullable
-- so an administrator can send the first acceptance request as well as a
-- later reacceptance request.
create or replace function public.admin_request_staff_terms_reacceptance(
  p_app_user_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_identity text;
  v_terms public.legal_terms_versions%rowtype;
  v_acceptance public.legal_terms_acceptances%rowtype;
  v_staff_id uuid;
  v_request_id uuid;
begin
  if not (public.is_super_admin() or public.has_permission('users', 'edit')) then
    raise exception 'Not authorized to request a fresh EMS Terms acceptance';
  end if;
  v_staff_id := public.current_app_user_id();
  if v_staff_id is null then raise exception 'Active staff identity not found'; end if;

  select coalesce(nullif(display_name, ''), nullif(email, ''), nullif(username, ''), id::text)
  into v_identity
  from public.app_users
  where id = p_app_user_id and status = 'active';
  if v_identity is null then raise exception 'Active EMS user not found'; end if;

  select * into v_terms
  from public.legal_terms_versions
  where is_active
  order by effective_at desc
  limit 1;
  if v_terms.version is null then raise exception 'No active Terms and Conditions version is configured'; end if;

  select * into v_acceptance
  from public.legal_terms_acceptances
  where actor_type = 'staff' and actor_id = p_app_user_id and terms_version = v_terms.version
  order by accepted_at desc
  limit 1;

  if exists (
    select 1 from public.legal_terms_reacceptance_requests
    where actor_type = 'staff' and actor_id = p_app_user_id
      and terms_version = v_terms.version and status = 'pending'
  ) then
    raise exception 'A fresh acceptance is already pending for this user';
  end if;

  insert into public.legal_terms_reacceptance_requests(
    actor_type, actor_id, terms_version, prior_acceptance_id, requested_by, reason
  ) values (
    'staff', p_app_user_id, v_terms.version, v_acceptance.id, v_staff_id,
    left(nullif(trim(coalesce(p_reason, '')), ''), 1000)
  ) returning id into v_request_id;

  if v_acceptance.id is not null then
    insert into public.legal_terms_acceptance_history(
      request_id, original_acceptance_id, actor_type, actor_id, terms_version, accepted_at,
      user_agent, acceptance_metadata, identity_image_consent_at, privacy_notice_version,
      accepted_ip, device_id, device_fingerprint_version, evidence_mime_type,
      evidence_image_data, evidence_size_bytes, evidence_sha256, evidence_captured_at,
      evidence_face_detected, evidence_face_confidence, evidence_face_detector
    )
    select v_request_id, a.id, a.actor_type, a.actor_id, a.terms_version, a.accepted_at,
      a.user_agent, a.acceptance_metadata, a.identity_image_consent_at, a.privacy_notice_version,
      a.accepted_ip, a.device_id, a.device_fingerprint_version, e.mime_type, e.image_data,
      e.image_size_bytes, e.image_sha256, e.captured_at, e.face_detected,
      e.face_detection_confidence, e.face_detector
    from public.legal_terms_acceptances a
    left join public.legal_terms_acceptance_evidence e on e.acceptance_id = a.id
    where a.id = v_acceptance.id;
  end if;

  update public.app_user_sessions
  set revoked_at = coalesce(revoked_at, clock_timestamp())
  where app_user_id = p_app_user_id and revoked_at is null;

  return jsonb_build_object(
    'requested', true,
    'request_id', v_request_id,
    'identity', v_identity,
    'terms_version', v_terms.version,
    'status', 'pending'
  );
end;
$$;

revoke all on function public.admin_request_staff_terms_reacceptance(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_request_staff_terms_reacceptance(uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';
