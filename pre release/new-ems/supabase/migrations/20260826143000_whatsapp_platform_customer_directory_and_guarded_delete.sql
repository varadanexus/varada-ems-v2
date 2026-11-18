-- Corporate customer directory and guarded account deletion for the WhatsApp
-- Platform admin console. Financial evidence created in live mode is immutable.

create or replace function public.whatsapp_platform_admin_customer_directory()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_directory jsonb;
begin
  if not public.has_permission('whatsapp-platform', 'view') then
    raise exception 'Not authorized to view WhatsApp Platform administration' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'name', t.name,
    'slug', t.slug,
    'ownerEmail', t.owner_email,
    'status', t.status,
    'planCode', t.plan_code,
    'additionalTeamSeats', t.additional_team_seats,
    'includedTeamSeats', (
      select p.team_member_limit
      from public.whatsapp_platform_plans p
      where p.code = case when t.plan_code = 'starter' then 'launch' else t.plan_code end
    ),
    'verificationStatus', t.verification_status,
    'createdAt', t.created_at,
    'updatedAt', t.updated_at,
    'userCount', (
      select count(*) from public.whatsapp_platform_users u
      where u.tenant_id = t.id and u.status in ('active', 'invited')
    ),
    'connectionCount', (
      select count(*) from public.whatsapp_platform_connections c where c.tenant_id = t.id
    ),
    'users', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', u.id,
        'displayName', u.display_name,
        'email', u.email,
        'jobTitle', u.job_title,
        'roleCode', u.role_code,
        'status', u.status,
        'lastLoginAt', u.last_login_at,
        'invitedAt', u.invited_at,
        'inviteExpiresAt', u.invite_expires_at,
        'createdAt', u.created_at,
        'updatedAt', u.updated_at
      ) order by case u.role_code when 'owner' then 0 when 'admin' then 1 when 'agent' then 2 else 3 end, u.created_at), '[]'::jsonb)
      from public.whatsapp_platform_users u where u.tenant_id = t.id
    ),
    'connections', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id,
        'provider', c.provider,
        'whatsappBusinessAccountId', c.whatsapp_business_account_id,
        'phoneNumberId', c.phone_number_id,
        'displayPhoneNumber', c.display_phone_number,
        'verifiedName', c.verified_name,
        'status', c.status,
        'connectedAt', c.connected_at,
        'createdAt', c.created_at
      ) order by c.created_at desc), '[]'::jsonb)
      from public.whatsapp_platform_connections c where c.tenant_id = t.id
    ),
    'verification', (
      select jsonb_build_object(
        'id', v.id,
        'status', v.status,
        'entityType', v.entity_type,
        'registrationNumber', v.registration_number,
        'gstin', v.gstin,
        'representativeName', v.authorised_representative_name,
        'representativeTitle', v.authorised_representative_title,
        'submittedAt', v.submitted_at,
        'reviewedAt', v.reviewed_at
      )
      from public.whatsapp_platform_business_verifications v where v.tenant_id = t.id
    )
  ) order by t.created_at desc), '[]'::jsonb)
  into v_directory
  from public.whatsapp_platform_tenants t;

  return v_directory;
end;
$$;

revoke all on function public.whatsapp_platform_admin_customer_directory() from public, anon;
grant execute on function public.whatsapp_platform_admin_customer_directory() to authenticated, service_role;

create or replace function public.whatsapp_platform_admin_hard_delete_tenant(
  p_tenant_id uuid,
  p_confirmation_name text,
  p_actor_app_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant public.whatsapp_platform_tenants;
  v_user_count integer;
  v_connection_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Permanent account deletion is server-only' using errcode = '42501';
  end if;

  select * into v_tenant
  from public.whatsapp_platform_tenants
  where id = p_tenant_id
  for update;

  if not found then raise exception 'Customer account not found.' using errcode = 'P0002'; end if;
  if trim(coalesce(p_confirmation_name, '')) <> v_tenant.name then
    raise exception 'The confirmation name does not exactly match the customer account.';
  end if;

  if exists (
    select 1 from public.whatsapp_platform_billing_subscriptions
    where tenant_id = p_tenant_id and coalesce(safe_metadata->>'mode', 'test') = 'live'
  ) or exists (
    select 1 from public.whatsapp_platform_billing_invoices
    where tenant_id = p_tenant_id and document_environment = 'live'
  ) or exists (
    select 1 from public.whatsapp_platform_billing_credit_notes
    where tenant_id = p_tenant_id and document_environment = 'live'
  ) then
    raise exception 'This account contains live financial records and cannot be hard-deleted. Close the workspace and retain its statutory ledger.';
  end if;

  if exists (
    select 1 from public.whatsapp_platform_billing_subscriptions
    where tenant_id = p_tenant_id and status not in ('cancelled', 'completed', 'expired')
  ) then
    raise exception 'Cancel the provider subscription completely before deleting this account.';
  end if;

  select count(*) into v_user_count from public.whatsapp_platform_users where tenant_id = p_tenant_id;
  select count(*) into v_connection_count from public.whatsapp_platform_connections where tenant_id = p_tenant_id;

  insert into public.audit_logs (
    event_type, action, module_code, actor_app_user_id, entity_type, entity_id, details
  ) values (
    'whatsapp_platform_customer_account_deleted',
    'hard_delete_tenant',
    'whatsapp-platform',
    p_actor_app_user_id,
    'whatsapp_platform_tenants',
    p_tenant_id,
    jsonb_build_object(
      'tenant_id', p_tenant_id,
      'tenant_name', v_tenant.name,
      'owner_email', v_tenant.owner_email,
      'workspace_slug', v_tenant.slug,
      'users_removed', v_user_count,
      'connections_removed', v_connection_count
    )
  );

  -- Test-only financial rows have no statutory standing and must be removed
  -- from the leaves inward because these tables intentionally use RESTRICT.
  delete from public.whatsapp_platform_billing_refund_requests where tenant_id = p_tenant_id;
  delete from public.whatsapp_platform_billing_credit_notes where tenant_id = p_tenant_id;
  delete from public.whatsapp_platform_billing_refunds where tenant_id = p_tenant_id;
  delete from public.whatsapp_platform_billing_invoices where tenant_id = p_tenant_id;
  delete from public.whatsapp_platform_billing_action_audit where tenant_id = p_tenant_id;
  delete from public.whatsapp_platform_billing_checkout_quotes where tenant_id = p_tenant_id;
  delete from public.whatsapp_platform_billing_coupon_redemptions where tenant_id = p_tenant_id;

  delete from public.whatsapp_platform_tenants where id = p_tenant_id;
  if not found then raise exception 'Customer account deletion did not complete.'; end if;

  return jsonb_build_object(
    'success', true,
    'tenantId', p_tenant_id,
    'tenantName', v_tenant.name,
    'usersRemoved', v_user_count,
    'connectionsRemoved', v_connection_count
  );
end;
$$;

revoke all on function public.whatsapp_platform_admin_hard_delete_tenant(uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.whatsapp_platform_admin_hard_delete_tenant(uuid,text,uuid) to service_role;

comment on function public.whatsapp_platform_admin_hard_delete_tenant(uuid,text,uuid) is
  'Guarded service-only account deletion. Rejects live financial evidence and non-terminal provider subscriptions.';

notify pgrst, 'reload schema';
