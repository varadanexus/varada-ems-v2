-- Secure, tenant-scoped invitations for the WhatsApp customer workspace.
-- Only token digests are stored; the one-time token is returned to the
-- workspace administrator once and expires after seven days.

alter table public.whatsapp_platform_users
  add column if not exists invite_token_hash text,
  add column if not exists invite_expires_at timestamptz,
  add column if not exists invited_at timestamptz,
  add column if not exists invited_by_user_id uuid references public.whatsapp_platform_users(id) on delete set null;

create unique index if not exists uq_whatsapp_platform_users_invite_token
  on public.whatsapp_platform_users (invite_token_hash)
  where invite_token_hash is not null;

create or replace function public.whatsapp_platform_create_invite(
  p_tenant_id uuid,
  p_display_name text,
  p_email text,
  p_role_code text,
  p_invite_token_hash text,
  p_invite_expires_at timestamptz,
  p_invited_by_user_id uuid
)
returns table (user_id uuid)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_name text := trim(coalesce(p_display_name, ''));
  v_email text := lower(trim(coalesce(p_email, '')));
  v_user_id uuid;
begin
  if char_length(v_name) < 2 or char_length(v_name) > 100 then
    raise exception 'Member name must be between 2 and 100 characters.';
  end if;
  if v_email !~ '^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$' then
    raise exception 'Enter a valid work email address.';
  end if;
  if p_role_code not in ('admin', 'agent', 'viewer') then
    raise exception 'Select a valid workspace role.';
  end if;
  if p_invite_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid invitation token.';
  end if;
  if p_invite_expires_at <= now() or p_invite_expires_at > now() + interval '8 days' then
    raise exception 'Invalid invitation expiry.';
  end if;
  if not exists (
    select 1 from public.whatsapp_platform_users inviter
    where inviter.id = p_invited_by_user_id
      and inviter.tenant_id = p_tenant_id
      and inviter.status = 'active'
      and inviter.role_code in ('owner', 'admin')
  ) then
    raise exception 'Workspace administrator access is required.';
  end if;

  insert into public.whatsapp_platform_users (
    tenant_id, display_name, email, password_hash, role_code, status,
    invite_token_hash, invite_expires_at, invited_at, invited_by_user_id
  ) values (
    p_tenant_id, v_name, v_email,
    crypt(encode(gen_random_bytes(32), 'hex'), gen_salt('bf', 12)),
    p_role_code, 'invited', p_invite_token_hash, p_invite_expires_at, now(), p_invited_by_user_id
  )
  returning id into v_user_id;

  return query select v_user_id;
end;
$$;

create or replace function public.whatsapp_platform_accept_invite(
  p_invite_token_hash text,
  p_display_name text,
  p_password text
)
returns table (
  session_token text,
  user_id uuid,
  auth_user_id uuid,
  tenant_id uuid,
  display_name text,
  email text,
  company_name text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_name text := trim(coalesce(p_display_name, ''));
  v_user public.whatsapp_platform_users;
  v_company text;
  v_token text;
  v_expiry timestamptz := now() + interval '12 hours';
begin
  if char_length(v_name) < 2 or char_length(v_name) > 100 then
    raise exception 'Your name must be between 2 and 100 characters.';
  end if;
  if char_length(coalesce(p_password, '')) < 10
     or p_password !~ '[A-Z]'
     or p_password !~ '[a-z]'
     or p_password !~ '[0-9]' then
    raise exception 'Password must have at least 10 characters, including uppercase, lowercase and a number.';
  end if;

  select u.* into v_user
  from public.whatsapp_platform_users u
  where u.invite_token_hash = p_invite_token_hash
    and u.status = 'invited'
    and u.invite_expires_at > now()
  for update
  limit 1;
  if v_user.id is null then raise exception 'This invitation is invalid or has expired.'; end if;

  select t.name into v_company
  from public.whatsapp_platform_tenants t
  where t.id = v_user.tenant_id and t.status = 'active';
  if v_company is null then raise exception 'This workspace is not available.'; end if;

  update public.whatsapp_platform_users
  set display_name = v_name,
      password_hash = crypt(p_password, gen_salt('bf', 12)),
      status = 'active', invite_token_hash = null, invite_expires_at = null,
      failed_login_attempts = 0, locked_until = null, last_login_at = now(), updated_at = now()
  where id = v_user.id;

  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.whatsapp_platform_sessions (user_id, token_hash, expires_at)
  values (v_user.id, encode(digest(v_token, 'sha256'), 'hex'), v_expiry);

  return query select v_token, v_user.id, v_user.auth_user_id, v_user.tenant_id,
    v_name, v_user.email, v_company, v_expiry;
end;
$$;

revoke all on function public.whatsapp_platform_create_invite(uuid,text,text,text,text,timestamptz,uuid) from public, anon, authenticated;
revoke all on function public.whatsapp_platform_accept_invite(text,text,text) from public, anon, authenticated;
grant execute on function public.whatsapp_platform_create_invite(uuid,text,text,text,text,timestamptz,uuid) to service_role;
grant execute on function public.whatsapp_platform_accept_invite(text,text,text) to service_role;

