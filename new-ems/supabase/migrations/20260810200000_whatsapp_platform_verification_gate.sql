-- Time-limited operational bypass for the provider business pre-check.
-- The gate is enabled by default. A pause is effective only until its expiry,
-- so it fails closed without relying on a scheduled job.

create table if not exists public.whatsapp_platform_verification_gate_settings (
  singleton boolean primary key default true check (singleton),
  gate_enabled boolean not null default true,
  bypass_expires_at timestamptz,
  bypass_reason text,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  check (bypass_reason is null or char_length(bypass_reason) <= 500)
);

insert into public.whatsapp_platform_verification_gate_settings(singleton, gate_enabled)
values (true, true) on conflict (singleton) do nothing;

create table if not exists public.whatsapp_platform_verification_gate_audit (
  id bigint generated always as identity primary key,
  gate_enabled boolean not null,
  bypass_expires_at timestamptz,
  reason text,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

alter table public.whatsapp_platform_verification_gate_settings enable row level security;
alter table public.whatsapp_platform_verification_gate_audit enable row level security;
revoke all on public.whatsapp_platform_verification_gate_settings from public, anon, authenticated;
revoke all on public.whatsapp_platform_verification_gate_audit from public, anon, authenticated;
grant all on public.whatsapp_platform_verification_gate_settings to service_role;
grant all on public.whatsapp_platform_verification_gate_audit to service_role;

create or replace function public.whatsapp_platform_admin_set_verification_gate(
  p_enabled boolean,
  p_duration_days integer default null,
  p_reason text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_actor uuid := auth.uid();
  v_expiry timestamptz;
  v_reason text := nullif(trim(coalesce(p_reason,'')), '');
begin
  if not public.has_permission('whatsapp-platform','approve') then
    raise exception 'Not authorized to change the verification gate' using errcode='42501';
  end if;
  if not p_enabled then
    if p_duration_days is null or p_duration_days < 1 or p_duration_days > 30 then
      raise exception 'Choose a pause duration between 1 and 30 days.' using errcode='22023';
    end if;
    if char_length(coalesce(v_reason,'')) < 10 then
      raise exception 'Enter a clear reason of at least 10 characters.' using errcode='22023';
    end if;
    v_expiry := now() + make_interval(days => p_duration_days);
  else
    v_expiry := null;
    v_reason := coalesce(v_reason, 'Verification gate restored');
  end if;

  insert into public.whatsapp_platform_verification_gate_settings
    (singleton,gate_enabled,bypass_expires_at,bypass_reason,updated_by,updated_at)
  values (true,p_enabled,v_expiry,v_reason,v_actor,now())
  on conflict (singleton) do update set gate_enabled=excluded.gate_enabled,
    bypass_expires_at=excluded.bypass_expires_at,bypass_reason=excluded.bypass_reason,
    updated_by=excluded.updated_by,updated_at=excluded.updated_at;

  insert into public.whatsapp_platform_verification_gate_audit
    (gate_enabled,bypass_expires_at,reason,changed_by)
  values (p_enabled,v_expiry,v_reason,v_actor);

  return jsonb_build_object('enabled',p_enabled,'bypassExpiresAt',v_expiry,
    'reason',v_reason,'updatedBy',v_actor,'updatedAt',now());
end; $$;

create or replace function public.whatsapp_platform_admin_snapshot()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_tenants jsonb; v_connections jsonb; v_verifications jsonb; v_gate jsonb;
begin
  if not public.has_permission('whatsapp-platform', 'view') then
    raise exception 'Not authorized to view WhatsApp Platform administration' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',t.id,'name',t.name,'slug',t.slug,'ownerEmail',t.owner_email,'status',t.status,
    'planCode',t.plan_code,'verificationStatus',t.verification_status,'createdAt',t.created_at,'updatedAt',t.updated_at,
    'userCount',(select count(*) from public.whatsapp_platform_users u where u.tenant_id=t.id),
    'connectionCount',(select count(*) from public.whatsapp_platform_connections c where c.tenant_id=t.id)
  ) order by t.created_at desc),'[]'::jsonb) into v_tenants from public.whatsapp_platform_tenants t;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,'tenantId',c.tenant_id,'tenantName',t.name,'provider',c.provider,
    'whatsappBusinessAccountId',c.whatsapp_business_account_id,'displayPhoneNumber',c.display_phone_number,
    'verifiedName',c.verified_name,'status',c.status,'connectedAt',c.connected_at,'createdAt',c.created_at
  ) order by c.created_at desc),'[]'::jsonb) into v_connections
  from public.whatsapp_platform_connections c join public.whatsapp_platform_tenants t on t.id=c.tenant_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',v.id,'tenantId',v.tenant_id,'tenantName',t.name,'ownerEmail',t.owner_email,
    'entityType',v.entity_type,'registrationNumber',v.registration_number,'gstin',v.gstin,
    'registeredAddress',v.registered_address,'representativeName',v.authorised_representative_name,
    'representativeTitle',v.authorised_representative_title,'status',v.status,
    'submittedAt',v.submitted_at,'reviewedAt',v.reviewed_at,'reviewNotes',v.review_notes,
    'documents',(select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'type',d.document_type,
      'name',d.original_file_name,'mimeType',d.mime_type,'size',d.file_size,'createdAt',d.created_at)
      order by d.created_at desc),'[]'::jsonb) from public.whatsapp_platform_verification_documents d
      where d.verification_id=v.id and d.status='active')
  ) order by v.submitted_at desc nulls last),'[]'::jsonb) into v_verifications
  from public.whatsapp_platform_business_verifications v join public.whatsapp_platform_tenants t on t.id=v.tenant_id;
  select jsonb_build_object(
    'enabled',(gate_enabled or bypass_expires_at is null or bypass_expires_at <= now()),
    'storedEnabled',gate_enabled,'bypassExpiresAt',bypass_expires_at,'reason',bypass_reason,
    'updatedBy',updated_by,'updatedAt',updated_at
  ) into v_gate from public.whatsapp_platform_verification_gate_settings where singleton=true;
  return jsonb_build_object(
    'totals',jsonb_build_object('tenants',(select count(*) from public.whatsapp_platform_tenants),
      'activeTenants',(select count(*) from public.whatsapp_platform_tenants where status='active'),
      'users',(select count(*) from public.whatsapp_platform_users),
      'activeSessions',(select count(*) from public.whatsapp_platform_sessions where revoked_at is null and expires_at>now()),
      'connections',(select count(*) from public.whatsapp_platform_connections),
      'connected',(select count(*) from public.whatsapp_platform_connections where status='connected'),
      'verificationPending',(select count(*) from public.whatsapp_platform_business_verifications where status in ('submitted','in_review')),
      'verified',(select count(*) from public.whatsapp_platform_business_verifications where status='verified')),
    'security',jsonb_build_object('loginAttempts24h',(select count(*) from public.whatsapp_platform_auth_attempts where action='login' and attempted_at>now()-interval '24 hours'),
      'signupAttempts24h',(select count(*) from public.whatsapp_platform_auth_attempts where action='signup' and attempted_at>now()-interval '24 hours'),
      'inactiveSessions',(select count(*) from public.whatsapp_platform_sessions where revoked_at is not null or expires_at<=now())),
    'verificationGate',coalesce(v_gate,jsonb_build_object('enabled',true,'storedEnabled',true)),
    'tenants',v_tenants,'connections',v_connections,'verifications',v_verifications,'generatedAt',now());
end; $$;

revoke all on function public.whatsapp_platform_admin_set_verification_gate(boolean,integer,text) from public,anon;
grant execute on function public.whatsapp_platform_admin_set_verification_gate(boolean,integer,text) to authenticated,service_role;
revoke all on function public.whatsapp_platform_admin_snapshot() from public,anon;
grant execute on function public.whatsapp_platform_admin_snapshot() to authenticated,service_role;
notify pgrst, 'reload schema';
