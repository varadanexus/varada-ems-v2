-- Sprint 12A.3: Central Portal Access module.
--
-- Database decision: NO new portal-user/session/audit tables. Portal Access is a unified UI
-- layer over the systems already built and live-tested in Sprint 12A/12A.1/12A.2
-- (transport_portal_users + transport_client_portal_access + transport_transporter_portal_access
-- for Transportation Client/Transporter; external_portal_users + external_portal_access for
-- Transportation Agent + External Vendor/Contractor; the existing Supabase-Auth-backed
-- interior_client_portal_users/interior_client_project_access for Interiors Client, untouched
-- and deep-linked rather than re-implemented). Every provisioning/reset/reveal/unlock/
-- force-logout/revoke-access RPC this module calls already exists — none are duplicated here.
--
-- The only genuinely new requirement not covered by the existing schema is "Access Level" as
-- a field on the creation form. transport_client_portal_access / transport_transporter_
-- portal_access / external_portal_access had no such column; interior_client_project_access
-- already has one (access_level, from the original Interiors portal work) and is left as-is.
-- This migration adds a matching, additive access_level column to the three tables that
-- lacked it, defaulting to 'standard' so existing rows are unaffected.

alter table public.transport_client_portal_access add column if not exists access_level text not null default 'standard';
alter table public.transport_transporter_portal_access add column if not exists access_level text not null default 'standard';
alter table public.external_portal_access add column if not exists access_level text not null default 'standard';
-- Extend the existing provisioning RPCs (CREATE OR REPLACE only — same signatures plus one
-- new optional trailing parameter each, so every existing caller from Sprint 12A/12A.1/12A.2
-- keeps working unchanged) to accept and store the access level at creation time.

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
begin
  if not public.has_permission('transport-portal-management', 'create') then
    raise exception 'Not authorized to provision transport portal users';
  end if;

  if p_initial_password is null or length(p_initial_password) < 8 then
    raise exception 'Initial password must be at least 8 characters';
  end if;

  insert into public.transport_portal_users (
    username, email, phone, password_hash, display_name, created_by,
    encrypted_password_vault, password_changed_at, password_set_by
  )
  values (
    p_username, p_email, p_phone, crypt(p_initial_password, gen_salt('bf')), p_display_name, v_actor_app_user_id,
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
  v_id uuid;
  v_key text := public.get_portal_vault_key();
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

  insert into public.external_portal_users (
    user_type, username, email, phone, password_hash, display_name, notes, created_by,
    encrypted_password_vault, password_changed_at, password_set_by
  )
  values (
    p_user_type, p_username, p_email, p_phone, crypt(p_initial_password, gen_salt('bf')), p_display_name, p_notes, v_actor_app_user_id,
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
