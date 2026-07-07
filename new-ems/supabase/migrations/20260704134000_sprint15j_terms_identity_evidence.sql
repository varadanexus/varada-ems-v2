-- Stronger terms version with explicit, private identity-image evidence.

update public.legal_terms_versions set is_active = false where is_active;

insert into public.legal_terms_versions(version, title, effective_at, content_hash, is_active)
values ('2026-07-04-v2', 'Varada Nexus EMS 2.0 Terms, Confidentiality and Acceptable Use', '2026-07-04 00:00:00+05:30', 'ems-terms-2026-07-04-v2-confidentiality-evidence', true)
on conflict (version) do update
set title = excluded.title,
    effective_at = excluded.effective_at,
    content_hash = excluded.content_hash,
    is_active = true;

alter table public.legal_terms_acceptances
  add column if not exists identity_image_consent_at timestamptz,
  add column if not exists privacy_notice_version text;

create table if not exists public.legal_terms_acceptance_evidence (
  id uuid primary key default gen_random_uuid(),
  acceptance_id uuid not null unique references public.legal_terms_acceptances(id) on delete cascade,
  mime_type text not null check (mime_type in ('image/jpeg','image/png')),
  image_data bytea not null,
  image_size_bytes integer not null check (image_size_bytes > 0 and image_size_bytes <= 1500000),
  image_sha256 text not null,
  captured_at timestamptz not null default clock_timestamp(),
  purpose text not null default 'identity evidence for terms acceptance',
  created_at timestamptz not null default now()
);

alter table public.legal_terms_acceptance_evidence enable row level security;
revoke all on public.legal_terms_acceptance_evidence from public, anon, authenticated;

revoke execute on function public.accept_current_terms(text, text, text, text) from public, anon, authenticated;

create or replace function public.get_my_terms_acceptance_status(
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
  accepted_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor record;
  v_terms record;
begin
  select * into v_actor from public.chat_current_actor(p_transport_session_token, p_external_session_token);
  select * into v_terms from public.legal_terms_versions where is_active limit 1;
  if v_terms.version is null then raise exception 'No active Terms and Conditions version is configured'; end if;

  return query
  select v_actor.actor_type::text,
         v_actor.actor_id::uuid,
         v_terms.version::text,
         v_terms.title::text,
         v_terms.effective_at::timestamptz,
         (a.id is not null and e.id is not null)::boolean,
         a.accepted_at::timestamptz
  from (select 1) seed
  left join public.legal_terms_acceptances a
    on a.actor_type = v_actor.actor_type
   and a.actor_id = v_actor.actor_id
   and a.terms_version = v_terms.version
  left join public.legal_terms_acceptance_evidence e on e.acceptance_id = a.id;
end;
$$;

create or replace function public.accept_current_terms(
  p_terms_version text,
  p_user_agent text,
  p_evidence_mime_type text,
  p_evidence_base64 text,
  p_photo_consent boolean,
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
  if p_evidence_mime_type not in ('image/jpeg','image/png') then raise exception 'Identity image must be JPEG or PNG'; end if;
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
    'identity-evidence-v1',
    jsonb_build_object('method', 'first_login_modal_with_identity_image', 'recorded_by', v_actor.actor_type)
  )
  on conflict (actor_type, actor_id, terms_version) do update
  set user_agent = excluded.user_agent,
      identity_image_consent_at = excluded.identity_image_consent_at,
      privacy_notice_version = excluded.privacy_notice_version,
      acceptance_metadata = excluded.acceptance_metadata
  returning id, accepted_at into v_acceptance_id, v_accepted_at;

  insert into public.legal_terms_acceptance_evidence(
    acceptance_id, mime_type, image_data, image_size_bytes, image_sha256, captured_at
  )
  values (
    v_acceptance_id, p_evidence_mime_type, v_image, octet_length(v_image),
    encode(extensions.digest(v_image, 'sha256'), 'hex'), clock_timestamp()
  )
  on conflict (acceptance_id) do update
  set mime_type = excluded.mime_type,
      image_data = excluded.image_data,
      image_size_bytes = excluded.image_size_bytes,
      image_sha256 = excluded.image_sha256,
      captured_at = excluded.captured_at;

  return v_accepted_at;
end;
$$;

grant execute on function public.accept_current_terms(text, text, text, text, boolean, text, text) to anon, authenticated;
grant execute on function public.get_my_terms_acceptance_status(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
