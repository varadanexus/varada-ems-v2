-- Package-governed team capacity for the WhatsApp customer workspace.
-- Active members and pending invitations consume seats. Disabled identities do not.

alter table public.whatsapp_platform_plans
  add column if not exists team_member_limit integer;

alter table public.whatsapp_platform_plans
  drop constraint if exists whatsapp_platform_plans_team_member_limit_check;
alter table public.whatsapp_platform_plans
  add constraint whatsapp_platform_plans_team_member_limit_check
  check (team_member_limit is null or team_member_limit >= 1);

update public.whatsapp_platform_plans set team_member_limit = 3 where code in ('launch', 'starter');
update public.whatsapp_platform_plans set team_member_limit = 10 where code = 'growth';
update public.whatsapp_platform_plans set team_member_limit = null where code = 'enterprise';

alter table public.whatsapp_platform_tenants
  add column if not exists additional_team_seats integer not null default 0;

alter table public.whatsapp_platform_tenants
  drop constraint if exists whatsapp_platform_tenants_additional_team_seats_check;
alter table public.whatsapp_platform_tenants
  add constraint whatsapp_platform_tenants_additional_team_seats_check
  check (additional_team_seats between 0 and 10000);

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

  -- Serialize seat allocation for this tenant so concurrent invitations cannot overbook.
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

  select u.* into v_user from public.whatsapp_platform_users u where lower(u.email) = v_email limit 1;
  v_existing := found;
  if v_existing and v_user.tenant_id <> p_tenant_id then raise exception 'This email already belongs to another workspace.'; end if;
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

create or replace function public.whatsapp_platform_admin_set_team_capacity(p_tenant_id uuid, p_additional_seats integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tenant public.whatsapp_platform_tenants;
begin
  if not public.has_permission('whatsapp-platform', 'edit') then
    raise exception 'Not authorized to manage WhatsApp Platform customers' using errcode = '42501';
  end if;
  if p_additional_seats is null or p_additional_seats < 0 or p_additional_seats > 10000 then
    raise exception 'Additional seats must be between 0 and 10000.' using errcode = '22023';
  end if;
  update public.whatsapp_platform_tenants set additional_team_seats = p_additional_seats, updated_at = now()
  where id = p_tenant_id returning * into v_tenant;
  if v_tenant.id is null then raise exception 'Customer workspace not found' using errcode = 'P0002'; end if;
  return jsonb_build_object('id',v_tenant.id,'additionalTeamSeats',v_tenant.additional_team_seats,'updatedAt',v_tenant.updated_at);
end; $$;

create or replace function public.whatsapp_platform_update_member_access(
  p_tenant_id uuid,p_actor_user_id uuid,p_member_id uuid,p_role_code text,p_status text
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_actor public.whatsapp_platform_users;
  v_member public.whatsapp_platform_users;
  v_plan_code text;
  v_included integer;
  v_additional integer;
  v_used integer;
begin
  select * into v_actor from public.whatsapp_platform_users where id=p_actor_user_id and tenant_id=p_tenant_id and status='active';
  if v_actor.id is null or v_actor.role_code not in ('owner','admin') then raise exception 'Workspace administrator access is required.'; end if;
  if p_member_id=p_actor_user_id then raise exception 'You cannot change your own role or access status.'; end if;
  select * into v_member from public.whatsapp_platform_users where id=p_member_id and tenant_id=p_tenant_id for update;
  if v_member.id is null then raise exception 'Workspace member not found.'; end if;
  if v_member.role_code='owner' then raise exception 'The workspace owner cannot be changed here.'; end if;
  if v_actor.role_code='admin' and v_member.role_code='admin' then raise exception 'Only the workspace owner can manage administrators.'; end if;
  if p_role_code not in ('admin','agent','viewer') or p_status not in ('active','invited','disabled') then raise exception 'Select a valid member role and status.'; end if;
  if p_role_code='admin' and v_actor.role_code<>'owner' then raise exception 'Only the workspace owner can assign administrator access.'; end if;
  if p_status='active' and v_member.status='invited' then raise exception 'An invited member must accept their secure link before activation.'; end if;

  if v_member.status='disabled' and p_status in ('active','invited') then
    select plan_code,additional_team_seats into v_plan_code,v_additional from public.whatsapp_platform_tenants where id=p_tenant_id for update;
    select team_member_limit into v_included from public.whatsapp_platform_plans where code=case when v_plan_code='starter' then 'launch' else v_plan_code end;
    if not found then v_included:=case v_plan_code when 'growth' then 10 when 'enterprise' then null else 3 end; end if;
    select count(*) into v_used from public.whatsapp_platform_users where tenant_id=p_tenant_id and status in ('active','invited');
    if v_included is not null and v_used >= v_included+v_additional then raise exception 'This workspace has reached its package team limit.'; end if;
  end if;

  update public.whatsapp_platform_users set role_code=p_role_code,status=p_status,updated_at=now(),
    invite_token_hash=case when p_status='disabled' then null else invite_token_hash end,
    invite_expires_at=case when p_status='disabled' then null else invite_expires_at end
  where id=p_member_id returning * into v_member;
  return jsonb_build_object('id',v_member.id,'display_name',v_member.display_name,'email',v_member.email,
    'role_code',v_member.role_code,'status',v_member.status,'last_login_at',v_member.last_login_at,
    'created_at',v_member.created_at,'invited_at',v_member.invited_at,'invite_expires_at',v_member.invite_expires_at);
end; $$;

create or replace function public.whatsapp_platform_public_catalog()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'plans', coalesce((select jsonb_agg(jsonb_build_object(
      'code',p.code,'label',p.label,'name',p.name,'tagline',p.tagline,
      'priceMonthly',p.price_monthly,'priceMonthlyUsd',p.price_monthly_usd,
      'pricePrefix',p.price_prefix,'priceSuffix',p.price_suffix,'annualNote',p.annual_note,
      'badge',p.badge,'ctaLabel',p.cta_label,'ctaHref',p.cta_href,'features',p.features,
      'isFeatured',p.is_featured,'teamMemberLimit',p.team_member_limit
    ) order by p.sort_order,p.created_at) from public.whatsapp_platform_plans p where p.is_active),'[]'::jsonb),
    'addons', coalesce((select jsonb_agg(jsonb_build_object(
      'name',a.name,'description',a.description,'tooltip',a.tooltip,
      'priceDisplay',a.price_display,'priceUnit',a.price_unit
    ) order by a.sort_order,a.created_at) from public.whatsapp_platform_addons a where a.is_active),'[]'::jsonb),
    'rates',coalesce((select r.rates from public.whatsapp_platform_pricing_rates r where r.id=1),'{}'::jsonb)
  );
$$;

create or replace function public.whatsapp_platform_admin_catalog()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_permission('whatsapp-platform','view') then raise exception 'Not authorized to view WhatsApp Platform packages' using errcode='42501'; end if;
  return jsonb_build_object(
    'plans',coalesce((select jsonb_agg(jsonb_build_object(
      'id',p.id,'code',p.code,'label',p.label,'name',p.name,'tagline',p.tagline,
      'priceMonthly',p.price_monthly,'priceMonthlyUsd',p.price_monthly_usd,
      'pricePrefix',p.price_prefix,'priceSuffix',p.price_suffix,'annualNote',p.annual_note,
      'badge',p.badge,'ctaLabel',p.cta_label,'ctaHref',p.cta_href,'features',p.features,
      'isFeatured',p.is_featured,'isActive',p.is_active,'sortOrder',p.sort_order,
      'teamMemberLimit',p.team_member_limit
    ) order by p.sort_order,p.created_at) from public.whatsapp_platform_plans p),'[]'::jsonb),
    'addons',coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'name',a.name,'description',a.description,'tooltip',a.tooltip,
      'priceDisplay',a.price_display,'priceUnit',a.price_unit,'isActive',a.is_active,'sortOrder',a.sort_order
    ) order by a.sort_order,a.created_at) from public.whatsapp_platform_addons a),'[]'::jsonb),
    'rates',coalesce((select r.rates from public.whatsapp_platform_pricing_rates r where r.id=1),'{}'::jsonb)
  );
end; $$;

create or replace function public.whatsapp_platform_admin_set_plan_team_limit(p_plan_id uuid,p_team_member_limit integer)
returns uuid language plpgsql security definer set search_path=public as $$
begin
  if not public.has_permission('whatsapp-platform','edit') then raise exception 'Not authorized to manage WhatsApp Platform packages' using errcode='42501'; end if;
  if p_team_member_limit is not null and (p_team_member_limit < 1 or p_team_member_limit > 10000) then raise exception 'Included team seats must be between 1 and 10000, or blank for unlimited.' using errcode='22023'; end if;
  update public.whatsapp_platform_plans set team_member_limit=p_team_member_limit,updated_at=now() where id=p_plan_id;
  if not found then raise exception 'Plan not found' using errcode='P0002'; end if;
  return p_plan_id;
end; $$;

create or replace function public.whatsapp_platform_admin_snapshot()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_tenants jsonb; v_connections jsonb; v_verifications jsonb; v_gate jsonb;
begin
  if not public.has_permission('whatsapp-platform', 'view') then raise exception 'Not authorized to view WhatsApp Platform administration' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',t.id,'name',t.name,'slug',t.slug,'ownerEmail',t.owner_email,'status',t.status,
    'planCode',t.plan_code,'additionalTeamSeats',t.additional_team_seats,
    'includedTeamSeats',(select p.team_member_limit from public.whatsapp_platform_plans p where p.code=case when t.plan_code='starter' then 'launch' else t.plan_code end),
    'verificationStatus',t.verification_status,'createdAt',t.created_at,'updatedAt',t.updated_at,
    'userCount',(select count(*) from public.whatsapp_platform_users u where u.tenant_id=t.id and u.status in ('active','invited')),
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
  select jsonb_build_object('enabled',(gate_enabled or bypass_expires_at is null or bypass_expires_at<=now()),
    'storedEnabled',gate_enabled,'bypassExpiresAt',bypass_expires_at,'reason',bypass_reason,
    'updatedBy',updated_by,'updatedAt',updated_at) into v_gate
  from public.whatsapp_platform_verification_gate_settings where singleton=true;
  return jsonb_build_object(
    'totals',jsonb_build_object('tenants',(select count(*) from public.whatsapp_platform_tenants),
      'activeTenants',(select count(*) from public.whatsapp_platform_tenants where status='active'),
      'users',(select count(*) from public.whatsapp_platform_users),
      'activeSessions',(select count(*) from public.whatsapp_platform_sessions where revoked_at is null and expires_at>now()),
      'connections',(select count(*) from public.whatsapp_platform_connections),'connected',(select count(*) from public.whatsapp_platform_connections where status='connected'),
      'verificationPending',(select count(*) from public.whatsapp_platform_business_verifications where status in ('submitted','in_review')),
      'verified',(select count(*) from public.whatsapp_platform_business_verifications where status='verified')),
    'security',jsonb_build_object('loginAttempts24h',(select count(*) from public.whatsapp_platform_auth_attempts where action='login' and attempted_at>now()-interval '24 hours'),
      'signupAttempts24h',(select count(*) from public.whatsapp_platform_auth_attempts where action='signup' and attempted_at>now()-interval '24 hours'),
      'inactiveSessions',(select count(*) from public.whatsapp_platform_sessions where revoked_at is not null or expires_at<=now())),
    'verificationGate',coalesce(v_gate,jsonb_build_object('enabled',true,'storedEnabled',true)),
    'tenants',v_tenants,'connections',v_connections,'verifications',v_verifications,'generatedAt',now());
end; $$;

revoke all on function public.whatsapp_platform_admin_set_team_capacity(uuid,integer) from public,anon;
grant execute on function public.whatsapp_platform_admin_set_team_capacity(uuid,integer) to authenticated,service_role;
revoke all on function public.whatsapp_platform_admin_set_plan_team_limit(uuid,integer) from public,anon;
grant execute on function public.whatsapp_platform_admin_set_plan_team_limit(uuid,integer) to authenticated,service_role;
revoke all on function public.whatsapp_platform_update_member_access(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.whatsapp_platform_update_member_access(uuid,uuid,uuid,text,text) to service_role;
revoke all on function public.whatsapp_platform_admin_snapshot() from public,anon;
grant execute on function public.whatsapp_platform_admin_snapshot() to authenticated,service_role;

notify pgrst, 'reload schema';
