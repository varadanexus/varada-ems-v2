-- Allow authorized WhatsApp Platform administrators to correct customer-submitted
-- verification data without creating a second, divergent copy of the customer record.

create or replace function public.whatsapp_platform_admin_update_verification(
  p_tenant_id uuid,
  p_company_name text,
  p_entity_type text,
  p_registration_number text,
  p_gstin text,
  p_registered_address text,
  p_representative_name text,
  p_representative_title text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_verification public.whatsapp_platform_business_verifications;
  v_before jsonb;
  v_after jsonb;
  v_company_name text := trim(coalesce(p_company_name, ''));
  v_entity_type text := lower(trim(coalesce(p_entity_type, '')));
begin
  if not public.has_permission('whatsapp-platform', 'edit')
     and not public.has_permission('whatsapp-platform', 'approve') then
    raise exception 'Not authorized to edit WhatsApp Platform verification data'
      using errcode = '42501';
  end if;

  if char_length(v_company_name) not between 2 and 120 then
    raise exception 'Company name must contain between 2 and 120 characters'
      using errcode = '22023';
  end if;
  if v_entity_type not in ('private_limited','public_limited','partnership','sole_proprietor','nonprofit','government','other') then
    raise exception 'Invalid entity type' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_registration_number, ''))) > 80
     or char_length(trim(coalesce(p_gstin, ''))) > 20
     or char_length(trim(coalesce(p_registered_address, ''))) > 800
     or char_length(trim(coalesce(p_representative_name, ''))) > 120
     or char_length(trim(coalesce(p_representative_title, ''))) > 120 then
    raise exception 'One or more verification fields exceed the allowed length'
      using errcode = '22023';
  end if;

  select jsonb_build_object(
    'companyName', t.name,
    'entityType', v.entity_type,
    'registrationNumber', v.registration_number,
    'gstin', v.gstin,
    'registeredAddress', v.registered_address,
    'representativeName', v.authorised_representative_name,
    'representativeTitle', v.authorised_representative_title
  ) into v_before
  from public.whatsapp_platform_business_verifications v
  join public.whatsapp_platform_tenants t on t.id = v.tenant_id
  where v.tenant_id = p_tenant_id
  for update of v, t;

  if v_before is null then
    raise exception 'Verification case not found' using errcode = 'P0002';
  end if;

  update public.whatsapp_platform_tenants
  set name = v_company_name,
      updated_at = now()
  where id = p_tenant_id;

  update public.whatsapp_platform_business_verifications
  set entity_type = v_entity_type,
      registration_number = nullif(trim(coalesce(p_registration_number, '')), ''),
      gstin = nullif(upper(trim(coalesce(p_gstin, ''))), ''),
      registered_address = nullif(trim(coalesce(p_registered_address, '')), ''),
      authorised_representative_name = nullif(trim(coalesce(p_representative_name, '')), ''),
      authorised_representative_title = nullif(trim(coalesce(p_representative_title, '')), ''),
      updated_at = now()
  where tenant_id = p_tenant_id
  returning * into v_verification;

  v_after := jsonb_build_object(
    'companyName', v_company_name,
    'entityType', v_verification.entity_type,
    'registrationNumber', v_verification.registration_number,
    'gstin', v_verification.gstin,
    'registeredAddress', v_verification.registered_address,
    'representativeName', v_verification.authorised_representative_name,
    'representativeTitle', v_verification.authorised_representative_title
  );

  insert into public.audit_logs(
    event_type, module_code, actor_auth_user_id, actor_app_user_id,
    entity_type, entity_id, details
  ) values (
    'whatsapp_verification_details_updated', 'whatsapp-platform', auth.uid(),
    (select id from public.app_users where auth_user_id = auth.uid() limit 1),
    'whatsapp_platform_business_verification', v_verification.id::text,
    jsonb_build_object('tenantId', p_tenant_id, 'before', v_before, 'after', v_after)
  );

  return jsonb_build_object('ok', true, 'tenantId', p_tenant_id, 'verification', v_after);
end;
$$;

revoke all on function public.whatsapp_platform_admin_update_verification(uuid,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.whatsapp_platform_admin_update_verification(uuid,text,text,text,text,text,text,text) to authenticated, service_role;

notify pgrst, 'reload schema';
