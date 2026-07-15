-- Chairman-issued, single-use Terms gate bypass.
--
-- This deliberately does NOT write to legal_terms_acceptances. A redeemed
-- code creates a short-lived, actor-bound browser session so the real account
-- holder must still complete the normal acceptance and evidence flow.

create table if not exists public.legal_terms_bypass_codes (
  id uuid primary key default extensions.gen_random_uuid(),
  issued_by_app_user_id uuid not null references public.app_users(id),
  token_hash text not null unique,
  token_hint text not null,
  issued_at timestamptz not null default clock_timestamp(),
  code_expires_at timestamptz not null,
  used_at timestamptz,
  used_by_actor_type text,
  used_by_actor_id uuid,
  bypass_session_hash text unique,
  bypass_expires_at timestamptz,
  revoked_at timestamptz,
  redeemed_ip inet,
  redeemed_user_agent text,
  constraint legal_terms_bypass_code_expiry check (code_expires_at > issued_at),
  constraint legal_terms_bypass_use_pair check (
    (used_at is null and used_by_actor_type is null and used_by_actor_id is null)
    or
    (used_at is not null and used_by_actor_type is not null and used_by_actor_id is not null)
  )
);

create index if not exists idx_legal_terms_bypass_codes_active
  on public.legal_terms_bypass_codes(code_expires_at)
  where used_at is null and revoked_at is null;

create index if not exists idx_legal_terms_bypass_sessions_active
  on public.legal_terms_bypass_codes(bypass_expires_at)
  where used_at is not null and revoked_at is null;

alter table public.legal_terms_bypass_codes enable row level security;
revoke all on public.legal_terms_bypass_codes from public, anon, authenticated;

create or replace function public.issue_terms_bypass_code()
returns table(bypass_code text, code_expires_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_issuer public.app_users%rowtype;
  v_compact_code text;
  v_display_code text;
  v_expiry timestamptz := clock_timestamp() + interval '15 minutes';
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  select au.* into v_issuer
  from public.app_users au
  where au.auth_user_id = auth.uid()
    and lower(trim(au.email)) = 'prudhvi@varadanexus.com'
    and au.status = 'active'
    and au.deleted_at is null
    and coalesce(au.is_locked, false) = false
    and exists (
      select 1
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_id = au.id
        and r.code = 'chairman_managing_director'
        and r.is_active = true
    )
  limit 1;

  if v_issuer.id is null then
    raise exception 'Only the protected Chairman and Managing Director account may issue a Terms bypass code';
  end if;

  -- Remove expired unused codes and revoke any previous active code from this
  -- issuer. A Chairman can have only one currently usable code.
  update public.legal_terms_bypass_codes
  set revoked_at = clock_timestamp()
  where issued_by_app_user_id = v_issuer.id
    and used_at is null
    and revoked_at is null;

  v_compact_code := upper(encode(extensions.gen_random_bytes(12), 'hex'));
  v_display_code := concat_ws('-',
    substr(v_compact_code, 1, 4), substr(v_compact_code, 5, 4),
    substr(v_compact_code, 9, 4), substr(v_compact_code, 13, 4),
    substr(v_compact_code, 17, 4), substr(v_compact_code, 21, 4)
  );

  insert into public.legal_terms_bypass_codes(
    issued_by_app_user_id, token_hash, token_hint, code_expires_at
  ) values (
    v_issuer.id,
    encode(extensions.digest(convert_to(v_compact_code, 'UTF8'), 'sha256'), 'hex'),
    right(v_compact_code, 4),
    v_expiry
  );

  insert into public.audit_logs(
    event_type, module_code, actor_auth_user_id, actor_app_user_id,
    entity_type, entity_id, details
  ) values (
    'terms_bypass_code_issued', 'settings', auth.uid(), v_issuer.id,
    'legal_terms_bypass', right(v_compact_code, 4),
    jsonb_build_object('expires_at', v_expiry, 'single_use', true)
  );

  return query select v_display_code, v_expiry;
end;
$$;

create or replace function public.redeem_terms_bypass_code(
  p_bypass_code text,
  p_user_agent text default null,
  p_transport_session_token text default null,
  p_external_session_token text default null
)
returns table(bypass_session_token text, bypass_expires_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_actor record;
  v_code record;
  v_compact_code text;
  v_session_token text;
  v_session_expiry timestamptz := clock_timestamp() + interval '4 hours';
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  v_ip_text text;
  v_ip inet;
begin
  select * into v_actor
  from public.chat_current_actor(p_transport_session_token, p_external_session_token);

  v_compact_code := regexp_replace(upper(trim(coalesce(p_bypass_code, ''))), '[^A-Z0-9]', '', 'g');
  if length(v_compact_code) <> 24 then
    raise exception 'The one-time bypass code is invalid or expired';
  end if;

  select b.* into v_code
  from public.legal_terms_bypass_codes b
  where b.token_hash = encode(extensions.digest(convert_to(v_compact_code, 'UTF8'), 'sha256'), 'hex')
    and b.used_at is null
    and b.revoked_at is null
    and b.code_expires_at > clock_timestamp()
  for update;

  if v_code.id is null then
    raise exception 'The one-time bypass code is invalid or expired';
  end if;

  v_session_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_ip_text := nullif(trim(split_part(coalesce(
    v_headers->>'x-forwarded-for',
    v_headers->>'cf-connecting-ip',
    v_headers->>'x-real-ip',
    ''
  ), ',', 1)), '');
  begin
    v_ip := v_ip_text::inet;
  exception when others then
    v_ip := null;
  end;

  update public.legal_terms_bypass_codes
  set used_at = clock_timestamp(),
      used_by_actor_type = v_actor.actor_type,
      used_by_actor_id = v_actor.actor_id,
      bypass_session_hash = encode(extensions.digest(convert_to(v_session_token, 'UTF8'), 'sha256'), 'hex'),
      bypass_expires_at = v_session_expiry,
      redeemed_ip = v_ip,
      redeemed_user_agent = left(nullif(trim(coalesce(p_user_agent, '')), ''), 1000)
  where id = v_code.id;

  insert into public.audit_logs(
    event_type, module_code, actor_auth_user_id, actor_app_user_id,
    entity_type, entity_id, details
  ) values (
    'terms_bypass_redeemed', 'terms', auth.uid(),
    case when v_actor.actor_type = 'staff' then v_actor.actor_id else null end,
    v_actor.actor_type, v_actor.actor_id::text,
    jsonb_build_object(
      'bypass_code_id', v_code.id,
      'issued_by_app_user_id', v_code.issued_by_app_user_id,
      'bypass_expires_at', v_session_expiry,
      'acceptance_recorded', false,
      'ip_address', v_ip_text
    )
  );

  return query select v_session_token, v_session_expiry;
end;
$$;

create or replace function public.validate_terms_bypass_session(
  p_bypass_session_token text,
  p_transport_session_token text default null,
  p_external_session_token text default null
)
returns boolean
language plpgsql
security definer
stable
set search_path = pg_catalog, public, extensions
as $$
declare
  v_actor record;
begin
  if nullif(trim(coalesce(p_bypass_session_token, '')), '') is null then
    return false;
  end if;

  select * into v_actor
  from public.chat_current_actor(p_transport_session_token, p_external_session_token);

  return exists (
    select 1
    from public.legal_terms_bypass_codes b
    where b.bypass_session_hash = encode(
      extensions.digest(convert_to(trim(p_bypass_session_token), 'UTF8'), 'sha256'),
      'hex'
    )
      and b.used_by_actor_type = v_actor.actor_type
      and b.used_by_actor_id = v_actor.actor_id
      and b.used_at is not null
      and b.revoked_at is null
      and b.bypass_expires_at > clock_timestamp()
  );
end;
$$;

revoke all on function public.issue_terms_bypass_code() from public, anon, authenticated;
revoke all on function public.redeem_terms_bypass_code(text, text, text, text) from public, anon, authenticated;
revoke all on function public.validate_terms_bypass_session(text, text, text) from public, anon, authenticated;

grant execute on function public.issue_terms_bypass_code() to authenticated;
grant execute on function public.redeem_terms_bypass_code(text, text, text, text) to anon, authenticated;
grant execute on function public.validate_terms_bypass_session(text, text, text) to anon, authenticated;

comment on table public.legal_terms_bypass_codes is
  'Chairman-issued one-time Terms bypass codes and actor-bound temporary sessions. Never constitutes Terms acceptance.';

notify pgrst, 'reload schema';
