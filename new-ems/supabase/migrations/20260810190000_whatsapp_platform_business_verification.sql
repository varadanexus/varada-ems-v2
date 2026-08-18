-- Tenant-scoped business verification for WhatsApp Solutions customers.
-- Verification documents stay private and are accessed only through protected
-- server functions; no public Drive URLs are stored or exposed.

alter table public.whatsapp_platform_tenants
  add column if not exists verification_status text not null default 'not_started',
  add column if not exists verified_at timestamptz;

alter table public.whatsapp_platform_tenants
  drop constraint if exists whatsapp_platform_tenants_verification_status_check,
  add constraint whatsapp_platform_tenants_verification_status_check
    check (verification_status in ('not_started','draft','submitted','in_review','changes_requested','verified','rejected'));

create table if not exists public.whatsapp_platform_business_verifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.whatsapp_platform_tenants(id) on delete cascade,
  entity_type text not null,
  registration_number text,
  gstin text,
  registered_address text,
  authorised_representative_name text,
  authorised_representative_title text,
  status text not null default 'draft' check (status in ('draft','submitted','in_review','changes_requested','verified','rejected')),
  declaration_accepted_at timestamptz,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (entity_type in ('private_limited','public_limited','partnership','sole_proprietor','nonprofit','government','other')),
  check (registration_number is null or char_length(registration_number) <= 80),
  check (gstin is null or char_length(gstin) <= 20),
  check (registered_address is null or char_length(registered_address) <= 800),
  check (authorised_representative_name is null or char_length(authorised_representative_name) <= 120),
  check (authorised_representative_title is null or char_length(authorised_representative_title) <= 120),
  check (review_notes is null or char_length(review_notes) <= 2000)
);

create table if not exists public.whatsapp_platform_verification_documents (
  id uuid primary key default gen_random_uuid(),
  verification_id uuid not null references public.whatsapp_platform_business_verifications(id) on delete cascade,
  tenant_id uuid not null references public.whatsapp_platform_tenants(id) on delete cascade,
  uploaded_by_user_id uuid not null references public.whatsapp_platform_users(id) on delete restrict,
  document_type text not null,
  original_file_name text not null,
  stored_file_name text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0 and file_size <= 5242880),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  drive_file_id text not null,
  drive_folder_id text not null,
  drive_folder_path text not null,
  status text not null default 'active' check (status in ('active','replaced','deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (document_type in ('incorporation_certificate','partnership_deed','business_registration','governing_instrument','establishment_order','business_address_proof','signatory_authorisation','gst_certificate'))
);

create index if not exists whatsapp_platform_verification_documents_tenant_idx
  on public.whatsapp_platform_verification_documents(tenant_id, status, document_type);
create index if not exists whatsapp_platform_business_verifications_status_idx
  on public.whatsapp_platform_business_verifications(status, submitted_at desc);

alter table public.whatsapp_platform_business_verifications enable row level security;
alter table public.whatsapp_platform_verification_documents enable row level security;
revoke all on public.whatsapp_platform_business_verifications from public, anon, authenticated;
revoke all on public.whatsapp_platform_verification_documents from public, anon, authenticated;
grant all on public.whatsapp_platform_business_verifications to service_role;
grant all on public.whatsapp_platform_verification_documents to service_role;

create or replace function public.whatsapp_platform_admin_snapshot()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_tenants jsonb; v_connections jsonb; v_verifications jsonb;
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
    'tenants',v_tenants,'connections',v_connections,'verifications',v_verifications,'generatedAt',now());
end; $$;

create or replace function public.whatsapp_platform_admin_review_verification(
  p_tenant_id uuid, p_decision text, p_notes text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_status text; v_reviewer uuid;
begin
  if not public.has_permission('whatsapp-platform','approve') then
    raise exception 'Not authorized to review business verification' using errcode='42501';
  end if;
  if p_decision not in ('in_review','changes_requested','verified','rejected') then
    raise exception 'Invalid review decision' using errcode='22023';
  end if;
  if p_decision in ('changes_requested','rejected') and char_length(trim(coalesce(p_notes,''))) < 10 then
    raise exception 'Add clear review notes for the customer.' using errcode='22023';
  end if;
  v_reviewer := auth.uid();
  update public.whatsapp_platform_business_verifications set status=p_decision,
    review_notes=nullif(trim(coalesce(p_notes,'')),''), reviewed_at=now(), reviewed_by=v_reviewer, updated_at=now()
    where tenant_id=p_tenant_id and status in ('submitted','in_review','changes_requested','rejected') returning status into v_status;
  if v_status is null then raise exception 'Verification submission not found or cannot be reviewed' using errcode='P0002'; end if;
  update public.whatsapp_platform_tenants set verification_status=p_decision,
    verified_at=case when p_decision='verified' then now() else null end, updated_at=now() where id=p_tenant_id;
  return jsonb_build_object('tenantId',p_tenant_id,'status',p_decision,'reviewedAt',now());
end; $$;

revoke all on function public.whatsapp_platform_admin_snapshot() from public,anon;
revoke all on function public.whatsapp_platform_admin_review_verification(uuid,text,text) from public,anon;
grant execute on function public.whatsapp_platform_admin_snapshot() to authenticated,service_role;
grant execute on function public.whatsapp_platform_admin_review_verification(uuid,text,text) to authenticated,service_role;
notify pgrst, 'reload schema';
