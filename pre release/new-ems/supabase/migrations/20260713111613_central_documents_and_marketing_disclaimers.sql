-- Central document numbering and versioned Digital Marketing & Services portal
-- disclaimers. Existing number formats and module RPC signatures are preserved.

-- ---------------------------------------------------------------------------
-- One stable numbering entry point for present and future EMS divisions.
-- ---------------------------------------------------------------------------

drop policy if exists central_invoice_seq_rw on public.central_invoice_number_sequences;
drop policy if exists central_credit_note_seq_rw on public.central_credit_note_sequences;
revoke all on table public.central_invoice_number_sequences from anon, authenticated;
revoke all on table public.central_credit_note_sequences from anon, authenticated;

create or replace function public.next_central_document_number(
  p_document_type text,
  p_document_date date default current_date
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text := lower(trim(coalesce(p_document_type, '')));
begin
  case v_type
    when 'invoice' then
      return public.next_central_invoice_number(coalesce(p_document_date, current_date));
    when 'credit_note' then
      return public.next_central_credit_note_number(coalesce(p_document_date, current_date));
    else
      raise exception 'Unsupported central document type: %', p_document_type
        using errcode = '22023';
  end case;
end;
$$;

create or replace function public.ds_next_invoice_number()
returns text
language sql
security definer
set search_path = public
as $$
  select public.next_central_document_number('invoice', current_date);
$$;

create or replace function public.generate_transport_gst_invoice_no(
  p_division_id uuid,
  p_invoice_date date
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_invoice_date is null then raise exception 'invoice_date is required'; end if;
  return public.next_central_document_number('invoice', p_invoice_date);
end;
$$;

create or replace function public.next_interior_bill_number()
returns text
language sql
security definer
set search_path = public
as $$
  select public.next_central_document_number('invoice', current_date);
$$;

create or replace function public.ds_next_credit_note_number()
returns text
language sql
security definer
set search_path = public
as $$
  select public.next_central_document_number('credit_note', current_date);
$$;

create or replace function public.generate_transport_client_credit_note_no(
  p_division_id uuid,
  p_credit_note_date date
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_credit_note_date is null then raise exception 'credit_note_date is required'; end if;
  return public.next_central_document_number('credit_note', p_credit_note_date);
end;
$$;

create or replace function public.next_interior_credit_note_number()
returns text
language sql
security definer
set search_path = public
as $$
  select public.next_central_document_number('credit_note', current_date);
$$;

revoke all on function public.next_central_invoice_number(date) from public, anon;
revoke all on function public.next_central_credit_note_number(date) from public, anon;
revoke all on function public.next_central_document_number(text, date) from public, anon;
revoke all on function public.ds_next_invoice_number() from public, anon;
revoke all on function public.generate_transport_gst_invoice_no(uuid, date) from public, anon;
revoke all on function public.next_interior_bill_number() from public, anon;
revoke all on function public.ds_next_credit_note_number() from public, anon;
revoke all on function public.generate_transport_client_credit_note_no(uuid, date) from public, anon;
revoke all on function public.next_interior_credit_note_number() from public, anon;

grant execute on function public.next_central_document_number(text, date) to authenticated;
grant execute on function public.ds_next_invoice_number() to authenticated;
grant execute on function public.generate_transport_gst_invoice_no(uuid, date) to authenticated;
grant execute on function public.next_interior_bill_number() to authenticated;
grant execute on function public.ds_next_credit_note_number() to authenticated;
grant execute on function public.generate_transport_client_credit_note_no(uuid, date) to authenticated;
grant execute on function public.next_interior_credit_note_number() to authenticated;

comment on function public.next_central_document_number(text, date) is
  'Shared, concurrency-safe document number entry point for every EMS division and future module.';

-- ---------------------------------------------------------------------------
-- Separate first-login disclaimer evidence for client and vendor portals.
-- ---------------------------------------------------------------------------

create table if not exists public.marketing_portal_disclaimer_acceptances (
  id uuid primary key default gen_random_uuid(),
  portal_user_id uuid not null references public.external_portal_users(id) on delete cascade,
  profile_id uuid not null,
  portal_type text not null check (portal_type in ('client', 'vendor')),
  disclaimer_version text not null,
  content_hash text not null,
  accepted_at timestamptz not null default clock_timestamp(),
  user_agent text,
  unique (portal_user_id, portal_type, disclaimer_version)
);

create index if not exists idx_marketing_disclaimer_portal_user
  on public.marketing_portal_disclaimer_acceptances(portal_user_id, portal_type, accepted_at desc);

alter table public.marketing_portal_disclaimer_acceptances enable row level security;
revoke all on table public.marketing_portal_disclaimer_acceptances from anon, authenticated;

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
    v_version := '2026-07-13-client-v1';
    v_hash := 'marketing-client-disclaimer-20260713-v1';
  else
    v_version := '2026-07-13-vendor-v1';
    v_hash := 'marketing-vendor-disclaimer-20260713-v1';
  end if;

  select a.accepted_at into v_accepted_at
  from public.marketing_portal_disclaimer_acceptances a
  where a.portal_user_id = v_ctx.portal_user_id
    and a.portal_type = v_type
    and a.disclaimer_version = v_version
    and a.content_hash = v_hash;

  return jsonb_build_object(
    'accepted', v_accepted_at is not null,
    'accepted_at', v_accepted_at,
    'portal_type', v_type,
    'disclaimer_version', v_version,
    'content_hash', v_hash
  );
end;
$$;

create or replace function public.accept_marketing_portal_disclaimer(
  p_session_token text,
  p_portal_type text,
  p_disclaimer_version text,
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
    v_expected_version := '2026-07-13-client-v1';
    v_hash := 'marketing-client-disclaimer-20260713-v1';
  else
    v_expected_version := '2026-07-13-vendor-v1';
    v_hash := 'marketing-vendor-disclaimer-20260713-v1';
  end if;

  if nullif(trim(coalesce(p_disclaimer_version, '')), '') is distinct from v_expected_version then
    raise exception 'This disclaimer has changed. Refresh the page and review the current version.'
      using errcode = '22023';
  end if;

  insert into public.marketing_portal_disclaimer_acceptances (
    portal_user_id, profile_id, portal_type, disclaimer_version, content_hash, user_agent
  ) values (
    v_ctx.portal_user_id, v_ctx.profile_id, v_type, v_expected_version, v_hash,
    left(nullif(trim(coalesce(p_user_agent, '')), ''), 1000)
  )
  on conflict (portal_user_id, portal_type, disclaimer_version) do nothing;

  select a.accepted_at into v_accepted_at
  from public.marketing_portal_disclaimer_acceptances a
  where a.portal_user_id = v_ctx.portal_user_id
    and a.portal_type = v_type
    and a.disclaimer_version = v_expected_version
    and a.content_hash = v_hash;

  if v_accepted_at is null then
    raise exception 'The disclaimer acceptance could not be recorded';
  end if;
  return v_accepted_at;
end;
$$;

revoke all on function public.marketing_portal_disclaimer_status(text, text) from public, anon, authenticated;
revoke all on function public.accept_marketing_portal_disclaimer(text, text, text, text) from public, anon, authenticated;

-- Marketing portal users authenticate with an opaque, short-lived external
-- session token. These RPCs therefore remain callable by the browser roles but
-- authorize every request by resolving that token server-side.
grant execute on function public.marketing_portal_disclaimer_status(text, text) to anon, authenticated;
grant execute on function public.accept_marketing_portal_disclaimer(text, text, text, text) to anon, authenticated;

comment on table public.marketing_portal_disclaimer_acceptances is
  'Immutable, version-specific acknowledgement evidence for Digital Marketing & Services client and vendor portals.';

notify pgrst, 'reload schema';
