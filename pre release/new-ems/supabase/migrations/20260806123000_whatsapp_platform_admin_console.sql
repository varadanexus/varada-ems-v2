-- EMS-side management console for the sellable WhatsApp Business Platform.
-- Only safe operational projections are returned; password hashes, session
-- tokens, token hashes, and provider secrets never leave the database.

insert into public.permissions (module_code, action_code, label, is_active)
values
  ('whatsapp-platform', 'edit', 'WhatsApp Platform — Manage customer tenants and plans', true),
  ('whatsapp-platform', 'approve', 'WhatsApp Platform — Approve production and onboarding controls', true)
on conflict (module_code, action_code) do update
set label = excluded.label, is_active = true;

create or replace function public.whatsapp_platform_admin_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenants jsonb;
  v_connections jsonb;
  v_result jsonb;
begin
  if not public.has_permission('whatsapp-platform', 'view') then
    raise exception 'Not authorized to view WhatsApp Platform administration'
      using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', t.id,
      'name', t.name,
      'slug', t.slug,
      'ownerEmail', t.owner_email,
      'status', t.status,
      'planCode', t.plan_code,
      'createdAt', t.created_at,
      'updatedAt', t.updated_at,
      'userCount', (select count(*) from public.whatsapp_platform_users u where u.tenant_id = t.id),
      'connectionCount', (select count(*) from public.whatsapp_platform_connections c where c.tenant_id = t.id)
    ) order by t.created_at desc
  ), '[]'::jsonb)
  into v_tenants
  from public.whatsapp_platform_tenants t;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'tenantId', c.tenant_id,
      'tenantName', t.name,
      'provider', c.provider,
      'whatsappBusinessAccountId', c.whatsapp_business_account_id,
      'displayPhoneNumber', c.display_phone_number,
      'verifiedName', c.verified_name,
      'status', c.status,
      'connectedAt', c.connected_at,
      'createdAt', c.created_at
    ) order by c.created_at desc
  ), '[]'::jsonb)
  into v_connections
  from public.whatsapp_platform_connections c
  join public.whatsapp_platform_tenants t on t.id = c.tenant_id;

  select jsonb_build_object(
    'totals', jsonb_build_object(
      'tenants', (select count(*) from public.whatsapp_platform_tenants),
      'activeTenants', (select count(*) from public.whatsapp_platform_tenants where status = 'active'),
      'users', (select count(*) from public.whatsapp_platform_users),
      'activeSessions', (select count(*) from public.whatsapp_platform_sessions where revoked_at is null and expires_at > now()),
      'connections', (select count(*) from public.whatsapp_platform_connections),
      'connected', (select count(*) from public.whatsapp_platform_connections where status = 'connected')
    ),
    'security', jsonb_build_object(
      'loginAttempts24h', (select count(*) from public.whatsapp_platform_auth_attempts where action = 'login' and attempted_at > now() - interval '24 hours'),
      'signupAttempts24h', (select count(*) from public.whatsapp_platform_auth_attempts where action = 'signup' and attempted_at > now() - interval '24 hours'),
      'inactiveSessions', (select count(*) from public.whatsapp_platform_sessions where revoked_at is not null or expires_at <= now())
    ),
    'tenants', v_tenants,
    'connections', v_connections,
    'generatedAt', now()
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.whatsapp_platform_admin_update_tenant(
  p_tenant_id uuid,
  p_status text,
  p_plan_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant public.whatsapp_platform_tenants;
begin
  if not public.has_permission('whatsapp-platform', 'edit') then
    raise exception 'Not authorized to manage WhatsApp Platform customers'
      using errcode = '42501';
  end if;
  if p_status not in ('active', 'suspended', 'closed') then
    raise exception 'Invalid customer status' using errcode = '22023';
  end if;
  if p_plan_code not in ('starter', 'growth', 'enterprise') then
    raise exception 'Invalid plan code' using errcode = '22023';
  end if;

  update public.whatsapp_platform_tenants
  set status = p_status,
      plan_code = p_plan_code,
      updated_at = now()
  where id = p_tenant_id
  returning * into v_tenant;

  if v_tenant.id is null then
    raise exception 'Customer workspace not found' using errcode = 'P0002';
  end if;

  if p_status <> 'active' then
    update public.whatsapp_platform_sessions s
    set revoked_at = coalesce(s.revoked_at, now())
    where s.user_id in (
      select u.id from public.whatsapp_platform_users u where u.tenant_id = p_tenant_id
    ) and s.revoked_at is null;
  end if;

  return jsonb_build_object(
    'id', v_tenant.id,
    'status', v_tenant.status,
    'planCode', v_tenant.plan_code,
    'updatedAt', v_tenant.updated_at
  );
end;
$$;

revoke all on function public.whatsapp_platform_admin_snapshot() from public, anon;
revoke all on function public.whatsapp_platform_admin_update_tenant(uuid, text, text) from public, anon;
grant execute on function public.whatsapp_platform_admin_snapshot() to authenticated, service_role;
grant execute on function public.whatsapp_platform_admin_update_tenant(uuid, text, text) to authenticated, service_role;

comment on function public.whatsapp_platform_admin_snapshot() is
  'Safe EMS operational projection for the WhatsApp Platform management console; excludes all credential and token material.';

notify pgrst, 'reload schema';
