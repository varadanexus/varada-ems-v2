-- Allow one customer identity to hold memberships in multiple WhatsApp
-- workspaces. Email remains unique inside each tenant, while auth_user_id is
-- the stable identity shared by linked memberships.

drop index if exists public.uq_whatsapp_platform_users_email;

alter table public.whatsapp_platform_users
  drop constraint if exists whatsapp_platform_users_auth_user_id_key;

create index if not exists idx_whatsapp_platform_users_auth_identity
  on public.whatsapp_platform_users (auth_user_id);

create unique index if not exists uq_whatsapp_platform_users_tenant_email
  on public.whatsapp_platform_users (tenant_id, lower(email));

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
  v_user public.whatsapp_platform_users;
  v_plan_code text;
  v_included_limit integer;
  v_additional integer := 0;
  v_capacity integer;
  v_used integer;
  v_existing boolean := false;
begin
  if char_length(v_name) < 2 or char_length(v_name) > 100 then raise exception 'Member name must be between 2 and 100 characters.'; end if;
  if v_email !~ '^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$' then raise exception 'Enter a valid work email address.'; end if;
  if p_role_code not in ('admin', 'agent', 'viewer') then raise exception 'Select a valid workspace role.'; end if;
  if p_invite_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid invitation token.'; end if;
  if p_invite_expires_at <= now() or p_invite_expires_at > now() + interval '8 days' then raise exception 'Invalid invitation expiry.'; end if;

  if not exists (
    select 1 from public.whatsapp_platform_users inviter
    where inviter.id = p_invited_by_user_id and inviter.tenant_id = p_tenant_id
      and inviter.status = 'active' and inviter.role_code in ('owner', 'admin')
  ) then raise exception 'Workspace administrator access is required.'; end if;

  select t.plan_code, t.additional_team_seats into v_plan_code, v_additional
  from public.whatsapp_platform_tenants t where t.id = p_tenant_id for update;
  if not found then raise exception 'Workspace not found.'; end if;

  select p.team_member_limit into v_included_limit
  from public.whatsapp_platform_plans p
  where p.code = case when v_plan_code = 'starter' then 'launch' else v_plan_code end;
  if not found then
    v_included_limit := case v_plan_code when 'growth' then 10 when 'enterprise' then null else 3 end;
  end if;
  v_capacity := case when v_included_limit is null then null else v_included_limit + v_additional end;

  -- An identity may belong to several tenants. Only an existing membership in
  -- this tenant can block or replace this invitation.
  select u.* into v_user
  from public.whatsapp_platform_users u
  where u.tenant_id = p_tenant_id and lower(u.email) = v_email
  limit 1;
  v_existing := found;
  if v_existing and v_user.status = 'active' then raise exception 'This person is already an active workspace member.'; end if;
  if v_existing and v_user.role_code = 'owner' then raise exception 'The workspace owner cannot be reinvited.'; end if;

  if not v_existing or v_user.status <> 'invited' then
    select count(*) into v_used from public.whatsapp_platform_users u
    where u.tenant_id = p_tenant_id and u.status in ('active', 'invited');
    if v_capacity is not null and v_used >= v_capacity then
      raise exception 'Your % package team limit of % seats has been reached. Disable a member, add seats, or upgrade the package.', initcap(v_plan_code), v_capacity using errcode = 'P0001';
    end if;
  end if;

  if v_user.id is null then
    insert into public.whatsapp_platform_users (
      tenant_id, display_name, email, password_hash, role_code, status,
      invite_token_hash, invite_expires_at, invited_at, invited_by_user_id
    ) values (
      p_tenant_id, v_name, v_email,
      crypt(encode(gen_random_bytes(32), 'hex'), gen_salt('bf', 12)),
      p_role_code, 'invited', p_invite_token_hash, p_invite_expires_at, now(), p_invited_by_user_id
    ) returning * into v_user;
  else
    update public.whatsapp_platform_users set
      display_name = v_name, role_code = p_role_code, status = 'invited',
      invite_token_hash = p_invite_token_hash, invite_expires_at = p_invite_expires_at,
      invited_at = now(), invited_by_user_id = p_invited_by_user_id, updated_at = now()
    where id = v_user.id returning * into v_user;
  end if;

  return query select v_user.id;
end;
$$;

-- Existing customers prove ownership with their current password. The target
-- membership then reuses the same auth identity and password hash without
-- exposing either value outside this privileged function.
create or replace function public.whatsapp_platform_accept_existing_invite(
  p_invite_token_hash text,
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
  v_invite public.whatsapp_platform_users;
  v_identity public.whatsapp_platform_users;
  v_company text;
  v_token text;
  v_expiry timestamptz := now() + interval '12 hours';
begin
  select u.* into v_invite
  from public.whatsapp_platform_users u
  where u.invite_token_hash = p_invite_token_hash
    and u.status = 'invited'
    and u.invite_expires_at > now()
  for update
  limit 1;
  if v_invite.id is null then raise exception 'This invitation is invalid or has expired.'; end if;

  select u.* into v_identity
  from public.whatsapp_platform_users u
  where lower(u.email) = lower(v_invite.email)
    and u.status = 'active'
    and u.id <> v_invite.id
    and (u.locked_until is null or u.locked_until <= now())
  order by u.last_login_at desc nulls last, u.created_at
  limit 1;

  if v_identity.id is null
     or crypt(coalesce(p_password, ''), v_identity.password_hash) <> v_identity.password_hash then
    raise exception 'Invalid email or password.';
  end if;

  select t.name into v_company
  from public.whatsapp_platform_tenants t
  where t.id = v_invite.tenant_id and t.status = 'active';
  if v_company is null then raise exception 'This workspace is not available.'; end if;

  update public.whatsapp_platform_users
  set auth_user_id = v_identity.auth_user_id,
      display_name = v_identity.display_name,
      password_hash = v_identity.password_hash,
      status = 'active',
      invite_token_hash = null,
      invite_expires_at = null,
      failed_login_attempts = 0,
      locked_until = null,
      last_login_at = now(),
      updated_at = now()
  where id = v_invite.id;

  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.whatsapp_platform_sessions (user_id, token_hash, expires_at)
  values (v_invite.id, encode(digest(v_token, 'sha256'), 'hex'), v_expiry);

  return query select v_token, v_invite.id, v_identity.auth_user_id,
    v_invite.tenant_id, v_identity.display_name, v_invite.email, v_company, v_expiry;
end;
$$;

revoke all on function public.whatsapp_platform_create_invite(uuid,text,text,text,text,timestamptz,uuid) from public, anon, authenticated;
revoke all on function public.whatsapp_platform_accept_existing_invite(text,text) from public, anon, authenticated;
grant execute on function public.whatsapp_platform_create_invite(uuid,text,text,text,text,timestamptz,uuid) to service_role;
grant execute on function public.whatsapp_platform_accept_existing_invite(text,text) to service_role;
