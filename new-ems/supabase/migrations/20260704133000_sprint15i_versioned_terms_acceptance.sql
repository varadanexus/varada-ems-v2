-- Versioned first-login Terms and Conditions acceptance for staff and all portals.

create table if not exists public.legal_terms_versions (
  version text primary key,
  title text not null,
  effective_at timestamptz not null,
  content_hash text not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_legal_terms_one_active
  on public.legal_terms_versions(is_active)
  where is_active;

insert into public.legal_terms_versions(version, title, effective_at, content_hash, is_active)
values ('2026-07-04-v1', 'Varada Nexus EMS 2.0 Terms and Conditions', '2026-07-04 00:00:00+05:30', 'ems-terms-2026-07-04-v1', true)
on conflict (version) do update
set title = excluded.title,
    effective_at = excluded.effective_at,
    content_hash = excluded.content_hash,
    is_active = true;

update public.legal_terms_versions
set is_active = false
where version <> '2026-07-04-v1' and is_active;

create table if not exists public.legal_terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  actor_type text not null check (actor_type in ('staff','transport_portal','interiors_portal','external_portal')),
  actor_id uuid not null,
  terms_version text not null references public.legal_terms_versions(version),
  accepted_at timestamptz not null default clock_timestamp(),
  user_agent text,
  acceptance_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(actor_type, actor_id, terms_version)
);

create index if not exists idx_legal_terms_acceptances_actor
  on public.legal_terms_acceptances(actor_type, actor_id, accepted_at desc);

alter table public.legal_terms_versions enable row level security;
alter table public.legal_terms_acceptances enable row level security;
revoke all on public.legal_terms_versions from anon, authenticated;
revoke all on public.legal_terms_acceptances from anon, authenticated;

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
         (a.id is not null)::boolean,
         a.accepted_at::timestamptz
  from (select 1) seed
  left join public.legal_terms_acceptances a
    on a.actor_type = v_actor.actor_type
   and a.actor_id = v_actor.actor_id
   and a.terms_version = v_terms.version;
end;
$$;

create or replace function public.accept_current_terms(
  p_terms_version text,
  p_user_agent text default null,
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
  v_accepted_at timestamptz;
begin
  select * into v_actor from public.chat_current_actor(p_transport_session_token, p_external_session_token);
  select version into v_active_version from public.legal_terms_versions where is_active limit 1;
  if v_active_version is null or p_terms_version is distinct from v_active_version then
    raise exception 'The Terms and Conditions version has changed. Reload and review the current version.';
  end if;

  insert into public.legal_terms_acceptances(
    actor_type, actor_id, terms_version, accepted_at, user_agent, acceptance_metadata
  )
  values (
    v_actor.actor_type,
    v_actor.actor_id,
    v_active_version,
    clock_timestamp(),
    left(nullif(trim(coalesce(p_user_agent, '')), ''), 1000),
    jsonb_build_object('method', 'first_login_modal', 'recorded_by', v_actor.actor_type)
  )
  on conflict (actor_type, actor_id, terms_version) do update
  set user_agent = coalesce(excluded.user_agent, public.legal_terms_acceptances.user_agent)
  returning accepted_at into v_accepted_at;

  return v_accepted_at;
end;
$$;

grant execute on function public.get_my_terms_acceptance_status(text, text) to anon, authenticated;
grant execute on function public.accept_current_terms(text, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
