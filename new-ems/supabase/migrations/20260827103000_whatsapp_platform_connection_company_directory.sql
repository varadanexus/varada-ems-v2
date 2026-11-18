-- Group Meta connections by company and expose a safe billing-access summary to
-- the internal product console. Credentials remain server-only.

create or replace function public.whatsapp_platform_admin_customer_directory()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_directory jsonb;
begin
  if not public.has_permission('whatsapp-platform', 'view') then
    raise exception 'Not authorized to view WhatsApp Platform administration' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'name', t.name, 'slug', t.slug, 'ownerEmail', t.owner_email,
    'status', t.status, 'planCode', t.plan_code, 'additionalTeamSeats', t.additional_team_seats,
    'includedTeamSeats', (select p.team_member_limit from public.whatsapp_platform_plans p where p.code=case when t.plan_code='starter' then 'launch' else t.plan_code end),
    'verificationStatus', t.verification_status, 'createdAt', t.created_at, 'updatedAt', t.updated_at,
    'userCount', (select count(*) from public.whatsapp_platform_users u where u.tenant_id=t.id and u.status in ('active','invited')),
    'connectionCount', (select count(*) from public.whatsapp_platform_connections c where c.tenant_id=t.id),
    'billingAccess', case
      when t.status <> 'active' then jsonb_build_object('allowed',false,'state','workspace_inactive','reason','Workspace access is inactive. The Meta number remains connected until an explicit customer-requested removal.')
      when s.id is null then jsonb_build_object('allowed',false,'state','payment_required','reason','No active paid subscription. Product access is blocked; Meta connections are preserved.')
      when s.status='active' and (s.current_end is null or s.current_end>now()) then jsonb_build_object('allowed',true,'state','paid','reason','Active paid subscription','subscriptionId',s.id,'subscriptionStatus',s.status,'packageCode',s.package_code,'accessUntil',s.current_end,'cancelAtCycleEnd',s.cancel_at_cycle_end)
      when s.status='authenticated' and coalesce(s.safe_metadata->>'trial_days','')~'^[1-9][0-9]{0,2}$' and s.charge_at>now() then jsonb_build_object('allowed',true,'state','trial','reason','Authorized trial access','subscriptionId',s.id,'subscriptionStatus',s.status,'packageCode',s.package_code,'accessUntil',s.charge_at,'cancelAtCycleEnd',s.cancel_at_cycle_end)
      else jsonb_build_object('allowed',false,'state','payment_required','reason',case when s.status in ('pending','halted') then 'Payment is overdue or failed. Product access is blocked while Meta connections remain intact.' else 'No current billing entitlement. Product access is blocked while Meta connections remain intact.' end,'subscriptionId',s.id,'subscriptionStatus',s.status,'packageCode',s.package_code,'accessUntil',s.current_end)
    end,
    'users', (select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'displayName',u.display_name,'email',u.email,'jobTitle',u.job_title,'roleCode',u.role_code,'status',u.status,'lastLoginAt',u.last_login_at,'invitedAt',u.invited_at,'inviteExpiresAt',u.invite_expires_at,'createdAt',u.created_at,'updatedAt',u.updated_at) order by case u.role_code when 'owner' then 0 when 'admin' then 1 when 'agent' then 2 else 3 end,u.created_at),'[]'::jsonb) from public.whatsapp_platform_users u where u.tenant_id=t.id),
    'connections', (select coalesce(jsonb_agg(jsonb_build_object(
      'id',c.id,'provider',c.provider,'metaBusinessId',c.meta_business_id,
      'whatsappBusinessAccountId',c.whatsapp_business_account_id,'phoneNumberId',c.phone_number_id,
      'displayPhoneNumber',c.display_phone_number,'verifiedName',c.verified_name,'status',c.status,
      'onboardingMetadata',jsonb_build_object('qualityRating',c.onboarding_metadata->>'quality_rating','phoneStatus',c.onboarding_metadata->>'phone_status','codeVerificationStatus',c.onboarding_metadata->>'code_verification_status','testNumber',coalesce(c.onboarding_metadata->'test_number','false'::jsonb),'billingRestricted',coalesce(c.onboarding_metadata->'billing_restricted','false'::jsonb)),
      'connectedAt',c.connected_at,'createdAt',c.created_at,'updatedAt',c.updated_at
    ) order by case when c.status='disconnected' then 1 else 0 end,c.created_at desc),'[]'::jsonb) from public.whatsapp_platform_connections c where c.tenant_id=t.id),
    'verification', (select jsonb_build_object('id',v.id,'status',v.status,'entityType',v.entity_type,'registrationNumber',v.registration_number,'gstin',v.gstin,'representativeName',v.authorised_representative_name,'representativeTitle',v.authorised_representative_title,'submittedAt',v.submitted_at,'reviewedAt',v.reviewed_at) from public.whatsapp_platform_business_verifications v where v.tenant_id=t.id)
  ) order by t.created_at desc),'[]'::jsonb)
  into v_directory
  from public.whatsapp_platform_tenants t
  left join lateral (
    select bs.* from public.whatsapp_platform_billing_subscriptions bs
    where bs.tenant_id=t.id and coalesce(bs.subscription_kind,bs.safe_metadata->>'subscription_kind','package')='package'
    order by case when bs.status in ('active','authenticated','pending','halted') then 0 else 1 end,bs.updated_at desc
    limit 1
  ) s on true;
  return v_directory;
end;
$$;

revoke all on function public.whatsapp_platform_admin_customer_directory() from public, anon;
grant execute on function public.whatsapp_platform_admin_customer_directory() to authenticated, service_role;
comment on function public.whatsapp_platform_admin_customer_directory() is 'Safe internal company directory with users, Meta connection details and access-vs-disconnection billing state.';
notify pgrst, 'reload schema';
