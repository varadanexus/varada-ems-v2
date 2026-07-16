-- Per-account administrative recording of explicit portal-user consent.
-- This is intentionally distinguished from the user's live-camera acceptance.

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
  v_has_evidence boolean := false;
begin
  if not public.has_permission('portal-management', 'view') then
    raise exception 'Not authorized to view portal consent status';
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

  select id, accepted_at, acceptance_metadata into v_acceptance
  from public.legal_terms_acceptances
  where actor_type = v_actor_type and actor_id = p_portal_user_id and terms_version = v_terms.version;

  if v_acceptance.id is not null then
    select exists(select 1 from public.legal_terms_acceptance_evidence where acceptance_id = v_acceptance.id)
    into v_has_evidence;
  end if;

  return jsonb_build_object(
    'portal_system', p_portal_system, 'portal_user_id', p_portal_user_id, 'identity', v_identity,
    'terms_version', v_terms.version, 'terms_title', v_terms.title, 'effective_at', v_terms.effective_at,
    'accepted', v_acceptance.id is not null, 'accepted_at', v_acceptance.accepted_at,
    'acceptance_source', case
      when v_acceptance.id is null then null
      when v_has_evidence then 'user_live_camera'
      when v_acceptance.acceptance_metadata->>'method' = 'admin_recorded_individual_consent' then 'admin_recorded'
      else 'user_electronic'
    end,
    'consent_given_by', v_acceptance.acceptance_metadata->>'consent_given_by',
    'consent_basis', v_acceptance.acceptance_metadata->>'consent_basis',
    'recorded_by_name', v_acceptance.acceptance_metadata->>'recorded_by_name',
    'recorded_by_email', v_acceptance.acceptance_metadata->>'recorded_by_email',
    'notes', v_acceptance.acceptance_metadata->>'notes'
  );
end;
$$;

create or replace function public.admin_record_portal_terms_consent(
  p_portal_system text,
  p_portal_user_id uuid,
  p_consent_given_by text,
  p_consent_basis text,
  p_notes text default null,
  p_explicit_confirmation boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_type text;
  v_identity text;
  v_terms record;
  v_existing record;
  v_staff record;
  v_accepted_at timestamptz;
begin
  if not public.has_permission('portal-management', 'edit') then raise exception 'Not authorized to record portal consent'; end if;
  if p_explicit_confirmation is distinct from true then raise exception 'Explicit confirmation that consent was obtained is required'; end if;
  if length(trim(coalesce(p_consent_given_by, ''))) < 2 then raise exception 'Enter the full name of the person who gave consent'; end if;
  if p_consent_basis not in ('verbal_confirmation', 'signed_document', 'recorded_email', 'video_call', 'other') then raise exception 'Select a valid consent basis'; end if;
  if p_consent_basis = 'other' and length(trim(coalesce(p_notes, ''))) < 5 then raise exception 'Add a note describing how consent was obtained'; end if;

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

  select id, email, display_name into v_staff
  from public.app_users where id = public.current_app_user_id() and status = 'active';
  if v_staff.id is null then raise exception 'Active staff identity not found'; end if;

  select version, title, effective_at into v_terms
  from public.legal_terms_versions where is_active limit 1;
  if v_terms.version is null then raise exception 'No active Terms and Conditions version is configured'; end if;

  select a.id, a.acceptance_metadata,
    exists(select 1 from public.legal_terms_acceptance_evidence e where e.acceptance_id = a.id) as has_evidence
  into v_existing
  from public.legal_terms_acceptances a
  where a.actor_type = v_actor_type and a.actor_id = p_portal_user_id and a.terms_version = v_terms.version;

  if v_existing.id is not null and (v_existing.has_evidence or coalesce(v_existing.acceptance_metadata->>'method', '') <> 'admin_recorded_individual_consent') then
    raise exception 'This user has already accepted the current Terms and Conditions directly';
  end if;

  insert into public.legal_terms_acceptances(
    actor_type, actor_id, terms_version, accepted_at, user_agent,
    identity_image_consent_at, privacy_notice_version, acceptance_metadata
  ) values (
    v_actor_type, p_portal_user_id, v_terms.version, clock_timestamp(), null, null,
    'admin-confirmed-individual-consent-v1',
    jsonb_build_object(
      'method', 'admin_recorded_individual_consent', 'consent_given_by', trim(p_consent_given_by),
      'consent_basis', p_consent_basis, 'notes', left(nullif(trim(coalesce(p_notes, '')), ''), 2000),
      'recorded_by_app_user_id', v_staff.id, 'recorded_by_name', coalesce(nullif(v_staff.display_name, ''), v_staff.email),
      'recorded_by_email', v_staff.email, 'explicit_confirmation', true,
      'jurisdiction', 'Rajamahendravaram, East Godavari District, Andhra Pradesh, India'
    )
  )
  on conflict (actor_type, actor_id, terms_version) do update
  set accepted_at = excluded.accepted_at, user_agent = null, identity_image_consent_at = null,
      privacy_notice_version = excluded.privacy_notice_version, acceptance_metadata = excluded.acceptance_metadata
  returning accepted_at into v_accepted_at;

  if p_portal_system = 'transport' then
    perform public.log_transport_portal_audit_event(p_portal_user_id, 'terms_consent_recorded_by_staff',
      jsonb_build_object('terms_version', v_terms.version, 'consent_given_by', trim(p_consent_given_by), 'consent_basis', p_consent_basis, 'recorded_by', v_staff.email));
  else
    perform public.log_external_portal_audit_event(p_portal_user_id, 'terms_consent_recorded_by_staff',
      jsonb_build_object('terms_version', v_terms.version, 'consent_given_by', trim(p_consent_given_by), 'consent_basis', p_consent_basis, 'recorded_by', v_staff.email));
  end if;

  return jsonb_build_object('accepted', true, 'accepted_at', v_accepted_at, 'terms_version', v_terms.version,
    'acceptance_source', 'admin_recorded', 'identity', v_identity);
end;
$$;

create or replace function public.get_my_terms_acceptance_status(
  p_transport_session_token text default null,
  p_external_session_token text default null
)
returns table(
  actor_type text, actor_id uuid, terms_version text, title text, effective_at timestamptz,
  accepted boolean, accepted_at timestamptz, popup_enabled boolean, identity_capture_enabled boolean,
  require_full_scroll boolean, allow_decline boolean, acceptance_label text, sections jsonb
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
  select * into v_actor from public.chat_current_actor(p_transport_session_token, p_external_session_token);
  select * into v_terms from public.legal_terms_versions where is_active limit 1;
  if v_terms.version is null then raise exception 'No active Terms and Conditions version is configured'; end if;
  select value into v_policy from public.system_settings where key = 'terms.policy';
  v_policy := coalesce(v_policy, '{}'::jsonb);
  v_identity_required := coalesce((v_policy->>'identity_capture_enabled')::boolean, false);

  return query
  select v_actor.actor_type::text, v_actor.actor_id::uuid, v_terms.version::text,
    coalesce(nullif(v_policy->>'title', ''), v_terms.title)::text, v_terms.effective_at::timestamptz,
    (a.id is not null and (not v_identity_required or e.id is not null or a.acceptance_metadata->>'method' = 'admin_recorded_individual_consent'))::boolean,
    a.accepted_at::timestamptz, coalesce((v_policy->>'popup_enabled')::boolean, true), v_identity_required,
    coalesce((v_policy->>'require_full_scroll')::boolean, true), coalesce((v_policy->>'allow_decline')::boolean, true),
    coalesce(nullif(v_policy->>'acceptance_label', ''), 'I have read, understood and agree to the complete Terms and Conditions.')::text,
    coalesce(v_policy->'sections', '[]'::jsonb)
  from (select 1) seed
  left join public.legal_terms_acceptances a
    on a.actor_type = v_actor.actor_type and a.actor_id = v_actor.actor_id and a.terms_version = v_terms.version
  left join public.legal_terms_acceptance_evidence e on e.acceptance_id = a.id;
end;
$$;

revoke all on function public.admin_get_portal_terms_consent_status(text, uuid) from public, anon;
revoke all on function public.admin_record_portal_terms_consent(text, uuid, text, text, text, boolean) from public, anon;
grant execute on function public.admin_get_portal_terms_consent_status(text, uuid) to authenticated, service_role;
grant execute on function public.admin_record_portal_terms_consent(text, uuid, text, text, text, boolean) to authenticated, service_role;
revoke all on function public.get_my_terms_acceptance_status(text, text) from public;
grant execute on function public.get_my_terms_acceptance_status(text, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
