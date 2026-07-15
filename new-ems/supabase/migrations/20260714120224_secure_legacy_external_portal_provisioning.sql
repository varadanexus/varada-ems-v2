-- Preserve the legacy 12-argument caller while routing all provisioning
-- through the current validated 13-argument implementation.

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
  p_notes text default null
)
returns uuid
language sql
security invoker
set search_path = public
as $$
  select public.external_portal_provision_user(
    p_user_type,
    p_username,
    p_initial_password,
    p_display_name,
    p_email,
    p_phone,
    p_source_module,
    p_access_scope,
    p_record_type,
    p_record_id,
    p_expires_at,
    p_notes,
    'standard'
  );
$$;

revoke all on function public.external_portal_provision_user(text, text, text, text, text, text, text, text, text, uuid, timestamptz, text) from public, anon;
grant execute on function public.external_portal_provision_user(text, text, text, text, text, text, text, text, text, uuid, timestamptz, text) to authenticated;
