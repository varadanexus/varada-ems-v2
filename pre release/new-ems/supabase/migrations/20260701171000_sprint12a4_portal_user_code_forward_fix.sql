-- Sprint 12A.4: forward fix for Portal Access runtime dependency on portal_user_code.
--
-- Problem addressed:
--   Portal Access now reads portal_user_code from transport_portal_users and
--   external_portal_users, but the checked-in new-ems migration chain never added
--   that column. interior_client_portal_users also lacks the column even though
--   newer portal-management/frontend flows expect a human-readable portal identity.
--
-- Scope constraints:
--   * additive only
--   * forward migration under new-ems/supabase/migrations
--   * no auth/app_users architecture changes
--   * no unrelated module/table redesign

create extension if not exists pgcrypto;

create or replace function public.next_portal_user_code(p_table_name text, p_prefix text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next_num bigint;
  v_code text;
begin
  execute format(
    'select coalesce(max(substring(portal_user_code from %L)::bigint), 0) + 1
       from public.%I
      where portal_user_code like %L',
    '^' || p_prefix || '-([0-9]+)$',
    p_table_name,
    p_prefix || '-%'
  )
  into v_next_num;

  v_code := p_prefix || '-' || lpad(v_next_num::text, 6, '0');
  return v_code;
end;
$$;

alter table public.transport_portal_users
  add column if not exists portal_user_code text;

alter table public.external_portal_users
  add column if not exists portal_user_code text;

alter table public.interior_client_portal_users
  add column if not exists portal_user_code text;

do $$
declare
  v_start_cli bigint;
  v_start_trn bigint;
  v_start_ven bigint;
  v_start_agn bigint;
  v_start_con bigint;
  v_start_emp bigint;
  v_start_prt bigint;
  v_start_ext bigint;
  v_start_int_cli bigint;
begin
  select coalesce(max(substring(portal_user_code from '^PRT-CLI-([0-9]+)$')::bigint), 0)
    into v_start_cli
  from public.transport_portal_users
  where portal_user_code like 'PRT-CLI-%';

  select coalesce(max(substring(portal_user_code from '^PRT-TRN-([0-9]+)$')::bigint), 0)
    into v_start_trn
  from public.transport_portal_users
  where portal_user_code like 'PRT-TRN-%';

  with pending as (
    select
      t.id,
      case
        when exists (select 1 from public.transport_client_portal_access a where a.portal_user_id = t.id) then 'PRT-CLI'
        when exists (select 1 from public.transport_transporter_portal_access a where a.portal_user_id = t.id) then 'PRT-TRN'
        else 'PRT-TRN'
      end as prefix
    from public.transport_portal_users t
    where coalesce(nullif(trim(t.portal_user_code), ''), '') = ''
  ), numbered as (
    select
      id,
      prefix,
      row_number() over (partition by prefix order by id) as seq
    from pending
  )
  update public.transport_portal_users t
     set portal_user_code = case n.prefix
       when 'PRT-CLI' then 'PRT-CLI-' || lpad((v_start_cli + n.seq)::text, 6, '0')
       else 'PRT-TRN-' || lpad((v_start_trn + n.seq)::text, 6, '0')
     end
    from numbered n
   where n.id = t.id;

  select coalesce(max(substring(portal_user_code from '^PRT-VEN-([0-9]+)$')::bigint), 0)
    into v_start_ven
  from public.external_portal_users
  where portal_user_code like 'PRT-VEN-%';

  select coalesce(max(substring(portal_user_code from '^PRT-AGN-([0-9]+)$')::bigint), 0)
    into v_start_agn
  from public.external_portal_users
  where portal_user_code like 'PRT-AGN-%';

  select coalesce(max(substring(portal_user_code from '^PRT-CON-([0-9]+)$')::bigint), 0)
    into v_start_con
  from public.external_portal_users
  where portal_user_code like 'PRT-CON-%';

  select coalesce(max(substring(portal_user_code from '^PRT-EMP-([0-9]+)$')::bigint), 0)
    into v_start_emp
  from public.external_portal_users
  where portal_user_code like 'PRT-EMP-%';

  select coalesce(max(substring(portal_user_code from '^PRT-PRT-([0-9]+)$')::bigint), 0)
    into v_start_prt
  from public.external_portal_users
  where portal_user_code like 'PRT-PRT-%';

  select coalesce(max(substring(portal_user_code from '^PRT-EXT-([0-9]+)$')::bigint), 0)
    into v_start_ext
  from public.external_portal_users
  where portal_user_code like 'PRT-EXT-%';

  with pending as (
    select
      e.id,
      case lower(coalesce(e.user_type, ''))
        when 'vendor' then 'PRT-VEN'
        when 'agent' then 'PRT-AGN'
        when 'contractor' then 'PRT-CON'
        when 'employee' then 'PRT-EMP'
        when 'partner' then 'PRT-PRT'
        else 'PRT-EXT'
      end as prefix
    from public.external_portal_users e
    where coalesce(nullif(trim(e.portal_user_code), ''), '') = ''
  ), numbered as (
    select
      id,
      prefix,
      row_number() over (partition by prefix order by id) as seq
    from pending
  )
  update public.external_portal_users e
     set portal_user_code = case n.prefix
       when 'PRT-VEN' then 'PRT-VEN-' || lpad((v_start_ven + n.seq)::text, 6, '0')
       when 'PRT-AGN' then 'PRT-AGN-' || lpad((v_start_agn + n.seq)::text, 6, '0')
       when 'PRT-CON' then 'PRT-CON-' || lpad((v_start_con + n.seq)::text, 6, '0')
       when 'PRT-EMP' then 'PRT-EMP-' || lpad((v_start_emp + n.seq)::text, 6, '0')
       when 'PRT-PRT' then 'PRT-PRT-' || lpad((v_start_prt + n.seq)::text, 6, '0')
       else 'PRT-EXT-' || lpad((v_start_ext + n.seq)::text, 6, '0')
     end
    from numbered n
   where n.id = e.id;

  select coalesce(max(substring(portal_user_code from '^PRT-INT-CLI-([0-9]+)$')::bigint), 0)
    into v_start_int_cli
  from public.interior_client_portal_users
  where portal_user_code like 'PRT-INT-CLI-%';

  with pending as (
    select i.id,
           row_number() over (order by i.id) as seq
    from public.interior_client_portal_users i
    where coalesce(nullif(trim(i.portal_user_code), ''), '') = ''
  )
  update public.interior_client_portal_users i
     set portal_user_code = 'PRT-INT-CLI-' || lpad((v_start_int_cli + p.seq)::text, 6, '0')
    from pending p
   where p.id = i.id;
end;
$$;

alter table public.transport_portal_users
  alter column portal_user_code set not null;

alter table public.external_portal_users
  alter column portal_user_code set not null;

alter table public.interior_client_portal_users
  alter column portal_user_code set not null;

create unique index if not exists uq_transport_portal_users_portal_user_code
  on public.transport_portal_users (portal_user_code);

create unique index if not exists uq_external_portal_users_portal_user_code
  on public.external_portal_users (portal_user_code);

create unique index if not exists uq_interior_client_portal_users_portal_user_code
  on public.interior_client_portal_users (portal_user_code);

create or replace function public.assign_transport_portal_user_code()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(nullif(trim(new.portal_user_code), ''), '') = '' then
    new.portal_user_code := public.next_portal_user_code('transport_portal_users', 'PRT-TRN');
  end if;
  return new;
end;
$$;

create or replace function public.assign_external_portal_user_code()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_prefix text;
begin
  if coalesce(nullif(trim(new.portal_user_code), ''), '') = '' then
    v_prefix := case lower(coalesce(new.user_type, ''))
      when 'vendor' then 'PRT-VEN'
      when 'agent' then 'PRT-AGN'
      when 'contractor' then 'PRT-CON'
      when 'employee' then 'PRT-EMP'
      when 'partner' then 'PRT-PRT'
      else 'PRT-EXT'
    end;
    new.portal_user_code := public.next_portal_user_code('external_portal_users', v_prefix);
  end if;
  return new;
end;
$$;

create or replace function public.assign_interior_client_portal_user_code()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(nullif(trim(new.portal_user_code), ''), '') = '' then
    new.portal_user_code := public.next_portal_user_code('interior_client_portal_users', 'PRT-INT-CLI');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_transport_portal_users_assign_portal_user_code on public.transport_portal_users;
create trigger trg_transport_portal_users_assign_portal_user_code
before insert on public.transport_portal_users
for each row execute function public.assign_transport_portal_user_code();

drop trigger if exists trg_external_portal_users_assign_portal_user_code on public.external_portal_users;
create trigger trg_external_portal_users_assign_portal_user_code
before insert on public.external_portal_users
for each row execute function public.assign_external_portal_user_code();

drop trigger if exists trg_interior_client_portal_users_assign_portal_user_code on public.interior_client_portal_users;
create trigger trg_interior_client_portal_users_assign_portal_user_code
before insert on public.interior_client_portal_users
for each row execute function public.assign_interior_client_portal_user_code();

create or replace function public.transport_portal_provision_user(
  p_username text,
  p_initial_password text,
  p_display_name text,
  p_email text default null,
  p_phone text default null,
  p_client_ids uuid[] default '{}'::uuid[],
  p_transporter_ids uuid[] default '{}'::uuid[],
  p_access_level text default 'standard'
)
returns uuid
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  v_actor_app_user_id uuid := public.current_app_user_id();
  v_portal_user_id uuid;
  v_id uuid;
  v_key text := public.get_portal_vault_key();
  v_portal_user_code text;
begin
  if not public.has_permission('transport-portal-management', 'create') then
    raise exception 'Not authorized to provision transport portal users';
  end if;

  if p_initial_password is null or length(p_initial_password) < 8 then
    raise exception 'Initial password must be at least 8 characters';
  end if;

  v_portal_user_code := case
    when coalesce(array_length(p_client_ids, 1), 0) > 0 then public.next_portal_user_code('transport_portal_users', 'PRT-CLI')
    when coalesce(array_length(p_transporter_ids, 1), 0) > 0 then public.next_portal_user_code('transport_portal_users', 'PRT-TRN')
    else public.next_portal_user_code('transport_portal_users', 'PRT-TRN')
  end;

  insert into public.transport_portal_users (
    portal_user_code, username, email, phone, password_hash, display_name, created_by,
    encrypted_password_vault, password_changed_at, password_set_by
  )
  values (
    v_portal_user_code, p_username, p_email, p_phone, crypt(p_initial_password, gen_salt('bf')), p_display_name, v_actor_app_user_id,
    pgp_sym_encrypt(p_initial_password, v_key), now(), v_actor_app_user_id
  )
  returning id into v_portal_user_id;

  foreach v_id in array coalesce(p_client_ids, '{}'::uuid[]) loop
    insert into public.transport_client_portal_access (portal_user_id, transport_client_id, granted_by, access_level)
    values (v_portal_user_id, v_id, v_actor_app_user_id, coalesce(p_access_level, 'standard'))
    on conflict (portal_user_id, transport_client_id) do update set is_active = true, revoked_at = null, access_level = coalesce(p_access_level, 'standard');
  end loop;

  foreach v_id in array coalesce(p_transporter_ids, '{}'::uuid[]) loop
    insert into public.transport_transporter_portal_access (portal_user_id, transport_transporter_id, granted_by, access_level)
    values (v_portal_user_id, v_id, v_actor_app_user_id, coalesce(p_access_level, 'standard'))
    on conflict (portal_user_id, transport_transporter_id) do update set is_active = true, revoked_at = null, access_level = coalesce(p_access_level, 'standard');
  end loop;

  return v_portal_user_id;
end;
$$;

create or replace function public.external_portal_provision_user(
  p_user_type text,
  p_username text,
  p_initial_password text,
  p_display_name text,
  p_email text default null,
  p_phone text default null,
  p_source_module text default null,
  p_access_scope text default null,
  p_record_type text default null,
  p_record_id uuid default null,
  p_expires_at timestamptz default null,
  p_notes text default null,
  p_access_level text default 'standard'
)
returns uuid
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  v_actor_app_user_id uuid := public.current_app_user_id();
  v_portal_user_id uuid;
  v_key text := public.get_portal_vault_key();
  v_portal_user_code text;
begin
  if not public.has_permission('portal-management', 'create') then
    raise exception 'Not authorized to provision portal users';
  end if;
  if p_user_type not in ('vendor', 'agent', 'contractor', 'employee', 'partner') then
    raise exception 'Invalid user_type for external portal user';
  end if;
  if p_initial_password is null or length(p_initial_password) < 8 then
    raise exception 'Initial password must be at least 8 characters';
  end if;

  v_portal_user_code := public.next_portal_user_code(
    'external_portal_users',
    case lower(coalesce(p_user_type, ''))
      when 'vendor' then 'PRT-VEN'
      when 'agent' then 'PRT-AGN'
      when 'contractor' then 'PRT-CON'
      when 'employee' then 'PRT-EMP'
      when 'partner' then 'PRT-PRT'
      else 'PRT-EXT'
    end
  );

  insert into public.external_portal_users (
    portal_user_code, user_type, username, email, phone, password_hash, display_name, notes, created_by,
    encrypted_password_vault, password_changed_at, password_set_by
  )
  values (
    v_portal_user_code, p_user_type, p_username, p_email, p_phone, crypt(p_initial_password, gen_salt('bf')), p_display_name, p_notes, v_actor_app_user_id,
    pgp_sym_encrypt(p_initial_password, v_key), now(), v_actor_app_user_id
  )
  returning id into v_portal_user_id;

  if p_record_type is not null and p_record_id is not null then
    insert into public.external_portal_access (portal_user_id, source_module, access_scope, record_type, record_id, granted_by, expires_at, notes, access_level)
    values (v_portal_user_id, coalesce(p_source_module, p_user_type), coalesce(p_access_scope, p_user_type || '_portal'), p_record_type, p_record_id, v_actor_app_user_id, p_expires_at, p_notes, coalesce(p_access_level, 'standard'));
  end if;

  perform public.log_external_portal_audit_event(v_portal_user_id, 'provisioned', jsonb_build_object('actor', v_actor_app_user_id, 'user_type', p_user_type));

  return v_portal_user_id;
end;
$$;