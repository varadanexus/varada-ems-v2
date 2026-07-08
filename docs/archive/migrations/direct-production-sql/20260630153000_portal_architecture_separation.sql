-- ARCHIVED DIRECT-PRODUCTION SQL: not part of the active migration chain.
-- Portal architecture separation hardening
-- Ensures portal identities stay separate from EMS app_users/auth.users,
-- adds human-readable portal codes, and introduces a dedicated Interiors portal auth stack.

create extension if not exists pgcrypto;

create sequence if not exists public.portal_code_cli_seq;
create sequence if not exists public.portal_code_trn_seq;
create sequence if not exists public.portal_code_ven_seq;
create sequence if not exists public.portal_code_agt_seq;
create sequence if not exists public.portal_code_con_seq;

create or replace function public.next_portal_code(p_prefix text)
returns text
language plpgsql
as $$
declare
  v_seq_name text;
  v_next bigint;
begin
  v_seq_name := case upper(coalesce(p_prefix, ''))
    when 'PRT-CLI' then 'public.portal_code_cli_seq'
    when 'PRT-TRN' then 'public.portal_code_trn_seq'
    when 'PRT-VEN' then 'public.portal_code_ven_seq'
    when 'PRT-AGT' then 'public.portal_code_agt_seq'
    when 'PRT-CON' then 'public.portal_code_con_seq'
    else 'public.portal_code_cli_seq'
  end;

  execute format('select nextval(%L)', v_seq_name) into v_next;
  return upper(coalesce(p_prefix, 'PRT-CLI')) || '-' || lpad(v_next::text, 6, '0');
end;
$$;

create or replace function public.assign_transport_portal_user_code()
returns trigger
language plpgsql
as $$
begin
  if coalesce(new.portal_user_code, '') = '' then
    new.portal_user_code := public.next_portal_code(
      case
        when exists (
          select 1 from public.transport_transporter_portal_access a
          where a.portal_user_id = new.id
        ) then 'PRT-TRN'
        else 'PRT-CLI'
      end
    );
  end if;
  return new;
end;
$$;

create or replace function public.assign_external_portal_user_code()
returns trigger
language plpgsql
as $$
begin
  if coalesce(new.portal_user_code, '') = '' then
    new.portal_user_code := public.next_portal_code(
      case lower(coalesce(new.user_type, ''))
        when 'vendor' then 'PRT-VEN'
        when 'agent' then 'PRT-AGT'
        when 'contractor' then 'PRT-CON'
        else 'PRT-VEN'
      end
    );
  end if;
  return new;
end;
$$;

create or replace function public.assign_interiors_portal_user_code()
returns trigger
language plpgsql
as $$
begin
  if coalesce(new.portal_user_code, '') = '' then
    new.portal_user_code := public.next_portal_code('PRT-CLI');
  end if;
  return new;
end;
$$;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'transport_portal_users'
  ) then
    alter table public.transport_portal_users
      add column if not exists portal_user_code text;

    create unique index if not exists transport_portal_users_portal_user_code_uidx
      on public.transport_portal_users (portal_user_code)
      where portal_user_code is not null;

    drop trigger if exists trg_assign_transport_portal_user_code on public.transport_portal_users;
    create trigger trg_assign_transport_portal_user_code
      before insert or update of portal_user_code on public.transport_portal_users
      for each row execute function public.assign_transport_portal_user_code();

    update public.transport_portal_users
       set portal_user_code = public.next_portal_code('PRT-CLI')
     where coalesce(portal_user_code, '') = '';
  end if;

  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'external_portal_users'
  ) then
    alter table public.external_portal_users
      add column if not exists portal_user_code text;

    create unique index if not exists external_portal_users_portal_user_code_uidx
      on public.external_portal_users (portal_user_code)
      where portal_user_code is not null;

    drop trigger if exists trg_assign_external_portal_user_code on public.external_portal_users;
    create trigger trg_assign_external_portal_user_code
      before insert or update of portal_user_code on public.external_portal_users
      for each row execute function public.assign_external_portal_user_code();

    update public.external_portal_users
       set portal_user_code = public.next_portal_code(
         case lower(coalesce(user_type, ''))
           when 'vendor' then 'PRT-VEN'
           when 'agent' then 'PRT-AGT'
           when 'contractor' then 'PRT-CON'
           else 'PRT-VEN'
         end
       )
     where coalesce(portal_user_code, '') = '';
  end if;

  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'interior_client_portal_users'
  ) then
    alter table public.interior_client_portal_users
      add column if not exists portal_user_code text,
      add column if not exists username text,
      add column if not exists portal_status text default 'invited',
      add column if not exists last_login_at timestamptz,
      add column if not exists failed_login_attempts integer not null default 0,
      add column if not exists is_locked boolean not null default false,
      add column if not exists locked_at timestamptz,
      add column if not exists password_reset_required boolean not null default true,
      add column if not exists auth_user_id uuid;

    create unique index if not exists interior_client_portal_users_portal_user_code_uidx
      on public.interior_client_portal_users (portal_user_code)
      where portal_user_code is not null;
    create unique index if not exists interior_client_portal_users_username_uidx
      on public.interior_client_portal_users (username)
      where username is not null;

    drop trigger if exists trg_assign_interiors_portal_user_code on public.interior_client_portal_users;
    create trigger trg_assign_interiors_portal_user_code
      before insert or update of portal_user_code on public.interior_client_portal_users
      for each row execute function public.assign_interiors_portal_user_code();

    update public.interior_client_portal_users
       set portal_user_code = public.next_portal_code('PRT-CLI')
     where coalesce(portal_user_code, '') = '';

    update public.interior_client_portal_users
       set username = lower(split_part(email, '@', 1))
     where coalesce(username, '') = '' and email is not null;

    update public.interior_client_portal_users
       set portal_status = case
         when lower(coalesce(access_status, '')) in ('active', 'invited', 'suspended', 'revoked', 'disabled') then lower(access_status)
         else 'invited'
       end
     where coalesce(portal_status, '') = '';

    update public.interior_client_portal_users
       set auth_user_id = null
     where auth_user_id is not null;

    alter table public.interior_client_portal_users
      alter column auth_user_id drop not null;
  end if;
end
$$;

create table if not exists public.interior_client_portal_password_vault (
  portal_user_id uuid primary key references public.interior_client_portal_users(id) on delete cascade,
  password_hash text not null,
  updated_at timestamptz not null default now(),
  updated_by_auth_user_id uuid null
);

create table if not exists public.interior_client_portal_sessions (
  id uuid primary key default gen_random_uuid(),
  portal_user_id uuid not null references public.interior_client_portal_users(id) on delete cascade,
  session_token text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz null,
  user_agent text null,
  ip_address text null
);

create table if not exists public.interior_client_portal_audit_logs (
  id uuid primary key default gen_random_uuid(),
  portal_user_id uuid null references public.interior_client_portal_users(id) on delete set null,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  actor_auth_user_id uuid null,
  created_at timestamptz not null default now()
);

create or replace function public.assert_ems_admin_for_portal_admin()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Internal EMS authentication is required.';
  end if;

  if not exists (
    select 1
    from public.app_users au
    where au.auth_user_id = auth.uid()
      and au.status = 'active'
      and coalesce(au.is_locked, false) = false
  ) then
    raise exception 'Only active EMS staff can manage portal identities.';
  end if;
end;
$$;

create or replace function public.interiors_portal_admin_create_user(
  p_interior_client_id uuid,
  p_contact_name text,
  p_phone text,
  p_email text,
  p_username text,
  p_password text,
  p_access_level text default 'view_only',
  p_project_ids uuid[] default '{}'
)
returns public.interior_client_portal_users
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.interior_client_portal_users;
  v_project_id uuid;
begin
  perform public.assert_ems_admin_for_portal_admin();

  if coalesce(trim(p_interior_client_id::text), '') = '' then
    raise exception 'interior_client_id is required';
  end if;
  if coalesce(trim(p_contact_name), '') = '' then
    raise exception 'contact_name is required';
  end if;
  if coalesce(trim(p_username), '') = '' then
    raise exception 'username is required';
  end if;
  if coalesce(trim(p_password), '') = '' then
    raise exception 'password is required';
  end if;

  insert into public.interior_client_portal_users (
    interior_client_id,
    contact_name,
    phone,
    email,
    username,
    access_status,
    portal_status,
    invited_at,
    activated_at,
    password_reset_required,
    auth_user_id
  )
  values (
    p_interior_client_id,
    p_contact_name,
    nullif(trim(p_phone), ''),
    nullif(lower(trim(p_email)), ''),
    lower(trim(p_username)),
    'active',
    'active',
    now(),
    now(),
    false,
    null
  )
  returning * into v_row;

  insert into public.interior_client_portal_password_vault (portal_user_id, password_hash, updated_at, updated_by_auth_user_id)
  values (v_row.id, crypt(p_password, gen_salt('bf')), now(), auth.uid())
  on conflict (portal_user_id)
  do update set
    password_hash = excluded.password_hash,
    updated_at = excluded.updated_at,
    updated_by_auth_user_id = excluded.updated_by_auth_user_id;

  foreach v_project_id in array coalesce(p_project_ids, '{}') loop
    insert into public.interior_client_project_access (portal_user_id, interior_project_id, access_level, is_active)
    values (v_row.id, v_project_id, coalesce(nullif(trim(p_access_level), ''), 'view_only'), true)
    on conflict do nothing;
  end loop;

  insert into public.interior_client_portal_audit_logs (portal_user_id, event_type, details, actor_auth_user_id)
  values (
    v_row.id,
    'portal_user_created',
    jsonb_build_object('portal_user_code', v_row.portal_user_code, 'username', v_row.username, 'email', v_row.email),
    auth.uid()
  );

  return v_row;
end;
$$;

create or replace function public.interiors_portal_admin_set_status(
  p_portal_user_id uuid,
  p_status text
)
returns public.interior_client_portal_users
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.interior_client_portal_users;
  v_status text;
begin
  perform public.assert_ems_admin_for_portal_admin();
  v_status := lower(coalesce(trim(p_status), 'active'));

  update public.interior_client_portal_users
     set access_status = v_status,
         portal_status = v_status,
         is_locked = case when v_status in ('disabled', 'suspended', 'revoked') then true else false end,
         locked_at = case when v_status in ('disabled', 'suspended', 'revoked') then now() else null end
   where id = p_portal_user_id
   returning * into v_row;

  if v_row.id is null then
    raise exception 'Portal user not found';
  end if;

  if v_status <> 'active' then
    update public.interior_client_portal_sessions
       set revoked_at = now()
     where portal_user_id = p_portal_user_id
       and revoked_at is null;
  end if;

  insert into public.interior_client_portal_audit_logs (portal_user_id, event_type, details, actor_auth_user_id)
  values (v_row.id, 'portal_user_status_changed', jsonb_build_object('status', v_status), auth.uid());

  return v_row;
end;
$$;

create or replace function public.interiors_portal_admin_reset_password(
  p_portal_user_id uuid,
  p_new_password text
)
returns public.interior_client_portal_users
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.interior_client_portal_users;
begin
  perform public.assert_ems_admin_for_portal_admin();

  if coalesce(trim(p_new_password), '') = '' then
    raise exception 'New password is required';
  end if;

  select * into v_row from public.interior_client_portal_users where id = p_portal_user_id;
  if v_row.id is null then
    raise exception 'Portal user not found';
  end if;

  insert into public.interior_client_portal_password_vault (portal_user_id, password_hash, updated_at, updated_by_auth_user_id)
  values (p_portal_user_id, crypt(p_new_password, gen_salt('bf')), now(), auth.uid())
  on conflict (portal_user_id)
  do update set
    password_hash = excluded.password_hash,
    updated_at = excluded.updated_at,
    updated_by_auth_user_id = excluded.updated_by_auth_user_id;

  update public.interior_client_portal_users
     set password_reset_required = false,
         failed_login_attempts = 0,
         is_locked = false,
         locked_at = null
   where id = p_portal_user_id
   returning * into v_row;

  update public.interior_client_portal_sessions
     set revoked_at = now()
   where portal_user_id = p_portal_user_id
     and revoked_at is null;

  insert into public.interior_client_portal_audit_logs (portal_user_id, event_type, details, actor_auth_user_id)
  values (v_row.id, 'portal_password_reset', jsonb_build_object('portal_user_code', v_row.portal_user_code), auth.uid());

  return v_row;
end;
$$;

create or replace function public.interiors_portal_admin_force_logout(
  p_portal_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_ems_admin_for_portal_admin();

  update public.interior_client_portal_sessions
     set revoked_at = now()
   where portal_user_id = p_portal_user_id
     and revoked_at is null;

  insert into public.interior_client_portal_audit_logs (portal_user_id, event_type, details, actor_auth_user_id)
  values (p_portal_user_id, 'portal_force_logout', '{}'::jsonb, auth.uid());
end;
$$;

create or replace function public.interiors_portal_login(
  p_username text,
  p_password text
)
returns table (
  session_token text,
  portal_user_id uuid,
  portal_user_code text,
  display_name text,
  client_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.interior_client_portal_users;
  v_hash text;
  v_token text;
begin
  select u.*
    into v_user
    from public.interior_client_portal_users u
   where lower(coalesce(u.username, '')) = lower(coalesce(trim(p_username), ''));

  if v_user.id is null then
    raise exception 'Invalid username or password';
  end if;

  if coalesce(v_user.is_locked, false) then
    raise exception 'Portal account is locked';
  end if;

  if lower(coalesce(v_user.portal_status, v_user.access_status, '')) not in ('active', 'invited') then
    raise exception 'Portal account is not active';
  end if;

  select password_hash into v_hash
    from public.interior_client_portal_password_vault
   where portal_user_id = v_user.id;

  if v_hash is null or v_hash <> crypt(p_password, v_hash) then
    update public.interior_client_portal_users
       set failed_login_attempts = coalesce(failed_login_attempts, 0) + 1,
           is_locked = case when coalesce(failed_login_attempts, 0) + 1 >= 5 then true else is_locked end,
           locked_at = case when coalesce(failed_login_attempts, 0) + 1 >= 5 then now() else locked_at end
     where id = v_user.id;

    insert into public.interior_client_portal_audit_logs (portal_user_id, event_type, details)
    values (v_user.id, 'login_failed', jsonb_build_object('username', p_username));

    raise exception 'Invalid username or password';
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');

  insert into public.interior_client_portal_sessions (portal_user_id, session_token, expires_at)
  values (v_user.id, v_token, now() + interval '12 hours');

  update public.interior_client_portal_users
     set last_login_at = now(),
         failed_login_attempts = 0,
         is_locked = false,
         locked_at = null,
         access_status = 'active',
         portal_status = 'active',
         activated_at = coalesce(activated_at, now())
   where id = v_user.id;

  insert into public.interior_client_portal_audit_logs (portal_user_id, event_type, details)
  values (v_user.id, 'login_success', jsonb_build_object('portal_user_code', v_user.portal_user_code));

  return query
  select v_token, v_user.id, v_user.portal_user_code, v_user.contact_name, c.client_name
    from public.interior_clients c
   where c.id = v_user.interior_client_id;
end;
$$;

create or replace function public.interiors_portal_validate_session(
  p_session_token text
)
returns table (
  portal_user_id uuid,
  portal_user_code text,
  display_name text,
  client_name text
)
language sql
security definer
set search_path = public
as $$
  select u.id,
         u.portal_user_code,
         u.contact_name,
         c.client_name
    from public.interior_client_portal_sessions s
    join public.interior_client_portal_users u on u.id = s.portal_user_id
    join public.interior_clients c on c.id = u.interior_client_id
   where s.session_token = p_session_token
     and s.revoked_at is null
     and s.expires_at > now()
     and coalesce(u.is_locked, false) = false
     and lower(coalesce(u.portal_status, u.access_status, '')) = 'active'
   limit 1;
$$;

create or replace function public.interiors_portal_logout(
  p_session_token text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_portal_user_id uuid;
begin
  update public.interior_client_portal_sessions
     set revoked_at = now()
   where session_token = p_session_token
     and revoked_at is null
  returning portal_user_id into v_portal_user_id;

  if v_portal_user_id is not null then
    insert into public.interior_client_portal_audit_logs (portal_user_id, event_type, details)
    values (v_portal_user_id, 'logout', '{}'::jsonb);
  end if;
end;
$$;

create or replace function public.interiors_portal_list_my_access(
  p_session_token text
)
returns table (
  portal_user_id uuid,
  portal_user_code text,
  interior_client_id uuid,
  client_name text,
  client_code text,
  interior_project_id uuid,
  project_code text,
  project_name text,
  project_title text,
  access_level text
)
language sql
security definer
set search_path = public
as $$
  select u.id,
         u.portal_user_code,
         c.id,
         c.client_name,
         c.client_code,
         p.id,
         p.project_code,
         p.project_name,
         p.project_title,
         a.access_level
    from public.interior_client_portal_sessions s
    join public.interior_client_portal_users u on u.id = s.portal_user_id
    join public.interior_clients c on c.id = u.interior_client_id
    join public.interior_client_project_access a on a.portal_user_id = u.id and a.is_active = true
    join public.interior_projects p on p.id = a.interior_project_id
   where s.session_token = p_session_token
     and s.revoked_at is null
     and s.expires_at > now();
$$;
