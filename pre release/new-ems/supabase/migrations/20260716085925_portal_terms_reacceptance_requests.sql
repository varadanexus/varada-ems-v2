-- Audited "request acceptance again" workflow. Previous evidence is copied to
-- a restricted immutable history row before the user is required to accept the
-- current Terms again. No evidence is deleted.

create table if not exists public.legal_terms_reacceptance_requests (
  id uuid primary key default gen_random_uuid(),
  actor_type text not null check (actor_type in ('transport_portal','external_portal')),
  actor_id uuid not null,
  terms_version text not null references public.legal_terms_versions(version),
  prior_acceptance_id uuid references public.legal_terms_acceptances(id) on delete set null,
  requested_by uuid not null references public.app_users(id),
  requested_at timestamptz not null default clock_timestamp(),
  reason text,
  status text not null default 'pending' check (status in ('pending','completed','cancelled')),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_legal_terms_one_pending_reacceptance
  on public.legal_terms_reacceptance_requests(actor_type, actor_id, terms_version)
  where status = 'pending';

create table if not exists public.legal_terms_acceptance_history (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.legal_terms_reacceptance_requests(id) on delete restrict,
  original_acceptance_id uuid not null,
  actor_type text not null,
  actor_id uuid not null,
  terms_version text not null,
  accepted_at timestamptz not null,
  user_agent text,
  acceptance_metadata jsonb not null default '{}'::jsonb,
  identity_image_consent_at timestamptz,
  privacy_notice_version text,
  accepted_ip inet,
  device_id text,
  device_fingerprint_version text,
  evidence_mime_type text,
  evidence_image_data bytea,
  evidence_size_bytes integer,
  evidence_sha256 text,
  evidence_captured_at timestamptz,
  evidence_face_detected boolean,
  evidence_face_confidence numeric,
  evidence_face_detector text,
  archived_at timestamptz not null default clock_timestamp()
);

alter table public.legal_terms_reacceptance_requests enable row level security;
alter table public.legal_terms_acceptance_history enable row level security;
revoke all on table public.legal_terms_reacceptance_requests from public, anon, authenticated;
revoke all on table public.legal_terms_acceptance_history from public, anon, authenticated;
grant all on table public.legal_terms_reacceptance_requests to service_role;
grant all on table public.legal_terms_acceptance_history to service_role;

create or replace function public.complete_portal_terms_reacceptance_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.actor_type in ('transport_portal','external_portal')
     and coalesce(new.acceptance_metadata->>'method','') <> 'admin_recorded_individual_consent' then
    update public.legal_terms_reacceptance_requests
    set status = 'completed', completed_at = new.accepted_at
    where actor_type = new.actor_type and actor_id = new.actor_id
      and terms_version = new.terms_version and status = 'pending'
      and requested_at <= new.accepted_at;
  end if;
  return new;
end;
$$;
revoke all on function public.complete_portal_terms_reacceptance_request() from public, anon, authenticated;
grant execute on function public.complete_portal_terms_reacceptance_request() to service_role;

drop trigger if exists trg_complete_portal_terms_reacceptance on public.legal_terms_acceptances;
create trigger trg_complete_portal_terms_reacceptance
after insert or update of accepted_at, acceptance_metadata on public.legal_terms_acceptances
for each row execute function public.complete_portal_terms_reacceptance_request();

-- A new acceptance must create a new dated Drive archive even when the prior
-- acceptance for the same terms version was already stored.
create or replace function public.queue_legal_terms_drive_archive()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.legal_terms_drive_archives(acceptance_id, status, updated_at)
  values (new.id, 'pending', now())
  on conflict (acceptance_id) do update
    set status = 'pending', archived_at = null, last_error = null, updated_at = now();
  return new;
end;
$$;
revoke all on function public.queue_legal_terms_drive_archive() from public, anon, authenticated;
grant execute on function public.queue_legal_terms_drive_archive() to service_role;

create or replace function public.admin_request_portal_terms_reacceptance(
  p_portal_system text,
  p_portal_user_id uuid,
  p_reason text default null
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
  v_acceptance record;
  v_staff_id uuid;
  v_request_id uuid;
begin
  if not public.has_permission('portal-management', 'edit') then
    raise exception 'Not authorized to request a fresh Terms acceptance';
  end if;
  v_staff_id := public.current_app_user_id();
  if v_staff_id is null then raise exception 'Active staff identity not found'; end if;

  if p_portal_system = 'transport' then
    v_actor_type := 'transport_portal';
    select coalesce(nullif(display_name,''),nullif(email,''),username) into v_identity
    from public.transport_portal_users where id=p_portal_user_id and status='active';
  elsif p_portal_system = 'external' then
    v_actor_type := 'external_portal';
    select coalesce(nullif(display_name,''),nullif(email,''),username) into v_identity
    from public.external_portal_users where id=p_portal_user_id and status='active';
  else
    raise exception 'Unsupported portal system';
  end if;
  if v_identity is null then raise exception 'Active portal user not found'; end if;

  select version into v_terms from public.legal_terms_versions where is_active limit 1;
  select * into v_acceptance from public.legal_terms_acceptances
  where actor_type=v_actor_type and actor_id=p_portal_user_id and terms_version=v_terms.version;
  if v_acceptance.id is null then raise exception 'This user has not yet accepted the current Terms'; end if;
  if exists(select 1 from public.legal_terms_reacceptance_requests
    where actor_type=v_actor_type and actor_id=p_portal_user_id and terms_version=v_terms.version and status='pending') then
    raise exception 'A fresh acceptance is already pending for this user';
  end if;

  insert into public.legal_terms_reacceptance_requests(
    actor_type,actor_id,terms_version,prior_acceptance_id,requested_by,reason
  ) values (
    v_actor_type,p_portal_user_id,v_terms.version,v_acceptance.id,v_staff_id,
    left(nullif(trim(coalesce(p_reason,'')),''),1000)
  ) returning id into v_request_id;

  insert into public.legal_terms_acceptance_history(
    request_id,original_acceptance_id,actor_type,actor_id,terms_version,accepted_at,
    user_agent,acceptance_metadata,identity_image_consent_at,privacy_notice_version,
    accepted_ip,device_id,device_fingerprint_version,evidence_mime_type,
    evidence_image_data,evidence_size_bytes,evidence_sha256,evidence_captured_at,
    evidence_face_detected,evidence_face_confidence,evidence_face_detector
  )
  select v_request_id,a.id,a.actor_type,a.actor_id,a.terms_version,a.accepted_at,
    a.user_agent,a.acceptance_metadata,a.identity_image_consent_at,a.privacy_notice_version,
    a.accepted_ip,a.device_id,a.device_fingerprint_version,e.mime_type,e.image_data,
    e.image_size_bytes,e.image_sha256,e.captured_at,e.face_detected,
    e.face_detection_confidence,e.face_detector
  from public.legal_terms_acceptances a
  left join public.legal_terms_acceptance_evidence e on e.acceptance_id=a.id
  where a.id=v_acceptance.id;

  if p_portal_system='transport' then
    update public.transport_portal_sessions set revoked_at=coalesce(revoked_at,clock_timestamp())
    where portal_user_id=p_portal_user_id and revoked_at is null;
    perform public.log_transport_portal_audit_event(p_portal_user_id,'terms_reacceptance_requested',
      jsonb_build_object('terms_version',v_terms.version,'request_id',v_request_id,'requested_by',v_staff_id));
  else
    update public.external_portal_sessions set revoked_at=coalesce(revoked_at,clock_timestamp())
    where portal_user_id=p_portal_user_id and revoked_at is null;
    perform public.log_external_portal_audit_event(p_portal_user_id,'terms_reacceptance_requested',
      jsonb_build_object('terms_version',v_terms.version,'request_id',v_request_id,'requested_by',v_staff_id));
  end if;

  return jsonb_build_object('requested',true,'request_id',v_request_id,'identity',v_identity,
    'terms_version',v_terms.version,'status','pending');
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
  select * into v_actor from public.chat_current_actor(p_transport_session_token,p_external_session_token);
  select * into v_terms from public.legal_terms_versions where is_active limit 1;
  if v_terms.version is null then raise exception 'No active Terms and Conditions version is configured'; end if;
  select value into v_policy from public.system_settings where key='terms.policy';
  v_policy := coalesce(v_policy,'{}'::jsonb);
  v_identity_required := coalesce((v_policy->>'identity_capture_enabled')::boolean,false);

  return query
  select v_actor.actor_type::text,v_actor.actor_id::uuid,v_terms.version::text,
    coalesce(nullif(v_policy->>'title',''),v_terms.title)::text,v_terms.effective_at::timestamptz,
    (a.id is not null
      and not exists(select 1 from public.legal_terms_reacceptance_requests r
        where r.actor_type=v_actor.actor_type and r.actor_id=v_actor.actor_id
          and r.terms_version=v_terms.version and r.status='pending')
      and (not v_identity_required or e.id is not null or a.acceptance_metadata->>'method'='admin_recorded_individual_consent'))::boolean,
    a.accepted_at::timestamptz,coalesce((v_policy->>'popup_enabled')::boolean,true),v_identity_required,
    coalesce((v_policy->>'require_full_scroll')::boolean,true),coalesce((v_policy->>'allow_decline')::boolean,true),
    coalesce(nullif(v_policy->>'acceptance_label',''),'I have read, understood and agree to the complete Terms and Conditions.')::text,
    coalesce(v_policy->'sections','[]'::jsonb)
  from (select 1) seed
  left join public.legal_terms_acceptances a on a.actor_type=v_actor.actor_type and a.actor_id=v_actor.actor_id and a.terms_version=v_terms.version
  left join public.legal_terms_acceptance_evidence e on e.acceptance_id=a.id;
end;
$$;

-- Extend the authorised evidence response with the pending-request state.
create or replace function public.admin_get_portal_terms_consent_status(p_portal_system text,p_portal_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_actor_type text; v_identity text; v_terms record; v_acceptance record;
  v_evidence record; v_archive record; v_request record;
begin
  if not public.has_permission('portal-management','view') then raise exception 'Not authorized to view portal consent evidence'; end if;
  if p_portal_system='transport' then
    v_actor_type:='transport_portal';
    select coalesce(nullif(display_name,''),nullif(email,''),username) into v_identity from public.transport_portal_users where id=p_portal_user_id;
  elsif p_portal_system='external' then
    v_actor_type:='external_portal';
    select coalesce(nullif(display_name,''),nullif(email,''),username) into v_identity from public.external_portal_users where id=p_portal_user_id;
  else raise exception 'Unsupported portal system'; end if;
  if v_identity is null then raise exception 'Portal user not found'; end if;
  select version,title,effective_at into v_terms from public.legal_terms_versions where is_active limit 1;
  select id,accepted_at,acceptance_metadata,user_agent,accepted_ip,device_id,device_fingerprint_version into v_acceptance
    from public.legal_terms_acceptances where actor_type=v_actor_type and actor_id=p_portal_user_id and terms_version=v_terms.version;
  if v_acceptance.id is not null then
    select mime_type,image_data,image_size_bytes,image_sha256,captured_at,face_detected,face_detection_confidence,face_detector into v_evidence
      from public.legal_terms_acceptance_evidence where acceptance_id=v_acceptance.id;
    select status,request_ip,folder_path,live_photo_web_view_link,terms_pdf_web_view_link,metadata_web_view_link,archived_at into v_archive
      from public.legal_terms_drive_archives where acceptance_id=v_acceptance.id;
  end if;
  select id,requested_at,reason,requested_by into v_request from public.legal_terms_reacceptance_requests
    where actor_type=v_actor_type and actor_id=p_portal_user_id and terms_version=v_terms.version and status='pending'
    order by requested_at desc limit 1;
  return jsonb_build_object(
    'portal_system',p_portal_system,'portal_user_id',p_portal_user_id,'identity',v_identity,
    'terms_version',v_terms.version,'terms_title',v_terms.title,'effective_at',v_terms.effective_at,
    'accepted',v_acceptance.id is not null,'accepted_at',v_acceptance.accepted_at,
    'acceptance_source',case when v_acceptance.id is null then null when v_evidence.image_data is not null then 'user_live_camera'
      when v_acceptance.acceptance_metadata->>'method'='admin_recorded_individual_consent' then 'admin_recorded' else 'user_electronic' end,
    'consent_given_by',v_acceptance.acceptance_metadata->>'consent_given_by','consent_basis',v_acceptance.acceptance_metadata->>'consent_basis',
    'recorded_by_name',v_acceptance.acceptance_metadata->>'recorded_by_name','recorded_by_email',v_acceptance.acceptance_metadata->>'recorded_by_email',
    'notes',v_acceptance.acceptance_metadata->>'notes',
    'accepted_ip',coalesce(case when v_acceptance.accepted_ip is null then null else host(v_acceptance.accepted_ip) end,v_archive.request_ip),
    'device_id',v_acceptance.device_id,'device_identifier_type',v_acceptance.device_fingerprint_version,'user_agent',v_acceptance.user_agent,
    'evidence_available',v_evidence.image_data is not null,
    'evidence_image_data_url',case when v_evidence.image_data is null then null else 'data:'||v_evidence.mime_type||';base64,'||replace(encode(v_evidence.image_data,'base64'),E'\n','') end,
    'evidence_mime_type',v_evidence.mime_type,'evidence_size_bytes',v_evidence.image_size_bytes,'evidence_sha256',v_evidence.image_sha256,
    'evidence_captured_at',v_evidence.captured_at,'face_detected',v_evidence.face_detected,'face_confidence',v_evidence.face_detection_confidence,'face_detector',v_evidence.face_detector,
    'drive_archive_status',v_archive.status,'drive_archived_at',v_archive.archived_at,'drive_folder_path',v_archive.folder_path,
    'drive_live_photo_url',v_archive.live_photo_web_view_link,'drive_terms_pdf_url',v_archive.terms_pdf_web_view_link,'drive_audit_url',v_archive.metadata_web_view_link,
    'reacceptance_pending',v_request.id is not null,'reacceptance_request_id',v_request.id,'reacceptance_requested_at',v_request.requested_at,'reacceptance_reason',v_request.reason
  );
end;
$$;

revoke all on function public.admin_request_portal_terms_reacceptance(text,uuid,text) from public,anon,authenticated;
grant execute on function public.admin_request_portal_terms_reacceptance(text,uuid,text) to authenticated,service_role;
revoke all on function public.admin_get_portal_terms_consent_status(text,uuid) from public,anon,authenticated;
grant execute on function public.admin_get_portal_terms_consent_status(text,uuid) to authenticated,service_role;
revoke all on function public.get_my_terms_acceptance_status(text,text) from public;
grant execute on function public.get_my_terms_acceptance_status(text,text) to anon,authenticated,service_role;

notify pgrst,'reload schema';
