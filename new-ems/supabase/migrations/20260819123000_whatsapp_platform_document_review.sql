-- Independent review decisions for each active business-verification document.

alter table public.whatsapp_platform_verification_documents
  add column if not exists review_status text not null default 'pending',
  add column if not exists review_notes text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid;

alter table public.whatsapp_platform_verification_documents
  drop constraint if exists whatsapp_platform_verification_documents_review_status_check,
  add constraint whatsapp_platform_verification_documents_review_status_check
    check (review_status in ('pending','in_review','changes_requested','approved','rejected')),
  drop constraint if exists whatsapp_platform_verification_documents_review_notes_check,
  add constraint whatsapp_platform_verification_documents_review_notes_check
    check (review_notes is null or char_length(review_notes) <= 2000);

alter table public.whatsapp_platform_verification_documents
  drop constraint if exists whatsapp_platform_verification_documents_document_type_check,
  add constraint whatsapp_platform_verification_documents_document_type_check
    check (document_type in (
      'incorporation_certificate','partnership_deed','business_registration',
      'governing_instrument','establishment_order','business_address_proof',
      'signatory_authorisation','letter_of_authorization','gst_certificate',
      'bank_statement','other_requested_document'
    ));

create table if not exists public.whatsapp_platform_verification_document_requests (
  id uuid primary key default gen_random_uuid(),
  verification_id uuid not null references public.whatsapp_platform_business_verifications(id) on delete cascade,
  tenant_id uuid not null references public.whatsapp_platform_tenants(id) on delete cascade,
  requested_document_type text not null,
  title text not null check (char_length(trim(title)) between 3 and 120),
  instructions text check (instructions is null or char_length(instructions) <= 2000),
  due_at timestamptz,
  status text not null default 'requested' check (status in ('requested','uploaded','satisfied','cancelled')),
  fulfilled_document_id uuid references public.whatsapp_platform_verification_documents(id) on delete set null,
  requested_by uuid,
  requested_at timestamptz not null default now(),
  fulfilled_at timestamptz,
  updated_at timestamptz not null default now(),
  check (requested_document_type in (
    'incorporation_certificate','partnership_deed','business_registration',
    'governing_instrument','establishment_order','business_address_proof',
    'signatory_authorisation','letter_of_authorization','gst_certificate',
    'bank_statement','other_requested_document'
  ))
);

create index if not exists whatsapp_platform_verification_document_requests_tenant_idx
  on public.whatsapp_platform_verification_document_requests(tenant_id,status,requested_at desc);
alter table public.whatsapp_platform_verification_document_requests enable row level security;
revoke all on public.whatsapp_platform_verification_document_requests from public,anon,authenticated;
grant all on public.whatsapp_platform_verification_document_requests to service_role;

create index if not exists whatsapp_platform_verification_documents_review_idx
  on public.whatsapp_platform_verification_documents(verification_id, review_status)
  where status = 'active';

create or replace function public.whatsapp_platform_admin_document_reviews()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_reviews jsonb;
begin
  if not public.has_permission('whatsapp-platform','view') then
    raise exception 'Not authorized to view WhatsApp Platform document reviews' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id',d.id,
      'reviewStatus',d.review_status,
      'reviewNotes',d.review_notes,
      'reviewedAt',d.reviewed_at,
      'reviewedBy',d.reviewed_by
    )),'[]'::jsonb) into v_reviews
  from public.whatsapp_platform_verification_documents d
  where d.status='active';
  return v_reviews;
end;
$$;

create or replace function public.whatsapp_platform_admin_review_document(
  p_document_id uuid, p_decision text, p_notes text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_document public.whatsapp_platform_verification_documents%rowtype;
begin
  if not public.has_permission('whatsapp-platform','approve') then
    raise exception 'Not authorized to review verification documents' using errcode='42501';
  end if;
  if p_decision not in ('in_review','changes_requested','approved','rejected') then
    raise exception 'Invalid document review decision' using errcode='22023';
  end if;
  if p_decision in ('changes_requested','rejected') and char_length(trim(coalesce(p_notes,''))) < 10 then
    raise exception 'Add clear reviewer notes for the customer.' using errcode='22023';
  end if;

  update public.whatsapp_platform_verification_documents
  set review_status=p_decision,
      review_notes=nullif(trim(coalesce(p_notes,'')),''),
      reviewed_at=now(), reviewed_by=auth.uid(), updated_at=now()
  where id=p_document_id and status='active'
  returning * into v_document;
  if v_document.id is null then
    raise exception 'Active verification document not found' using errcode='P0002';
  end if;

  update public.whatsapp_platform_business_verifications
  set status=case
        when p_decision<>'approved' and status='verified' then 'in_review'
        when status='submitted' then 'in_review'
        else status
      end,
      updated_at=now()
  where id=v_document.verification_id;

  update public.whatsapp_platform_tenants t
  set verification_status=case
        when p_decision<>'approved' and t.verification_status='verified' then 'in_review'
        when t.verification_status='submitted' then 'in_review'
        else t.verification_status
      end,
      verified_at=case when p_decision<>'approved' then null else t.verified_at end,
      updated_at=now()
  where t.id=v_document.tenant_id;

  update public.whatsapp_platform_verification_document_requests
  set status=case when p_decision='approved' then 'satisfied'
                  when p_decision in ('changes_requested','rejected') then 'requested'
                  else status end,
      fulfilled_at=case when p_decision='approved' then now()
                        when p_decision in ('changes_requested','rejected') then null
                        else fulfilled_at end,
      updated_at=now()
  where fulfilled_document_id=v_document.id and status<>'cancelled';

  return jsonb_build_object('documentId',v_document.id,'status',p_decision,'reviewedAt',now());
end; $$;

create or replace function public.whatsapp_platform_admin_document_requests()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_requests jsonb;
begin
  if not public.has_permission('whatsapp-platform','view') then
    raise exception 'Not authorized to view verification document requests' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'tenantId',r.tenant_id,'verificationId',r.verification_id,
    'documentType',r.requested_document_type,'title',r.title,'instructions',r.instructions,
    'dueAt',r.due_at,'status',r.status,'fulfilledDocumentId',r.fulfilled_document_id,
    'requestedAt',r.requested_at,'fulfilledAt',r.fulfilled_at
  ) order by r.requested_at desc),'[]'::jsonb) into v_requests
  from public.whatsapp_platform_verification_document_requests r;
  return v_requests;
end; $$;

create or replace function public.whatsapp_platform_admin_request_document(
  p_tenant_id uuid, p_document_type text, p_title text,
  p_instructions text default null, p_due_at timestamptz default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_verification_id uuid; v_request_id uuid;
begin
  if not public.has_permission('whatsapp-platform','approve') then
    raise exception 'Not authorized to request verification documents' using errcode='42501';
  end if;
  if p_document_type not in (
    'incorporation_certificate','partnership_deed','business_registration',
    'governing_instrument','establishment_order','business_address_proof',
    'signatory_authorisation','letter_of_authorization','gst_certificate',
    'bank_statement','other_requested_document'
  ) then raise exception 'Invalid requested document type' using errcode='22023'; end if;
  if char_length(trim(coalesce(p_title,''))) < 3 then
    raise exception 'Enter a clear document title' using errcode='22023';
  end if;
  select id into v_verification_id from public.whatsapp_platform_business_verifications where tenant_id=p_tenant_id;
  if v_verification_id is null then raise exception 'Verification case not found' using errcode='P0002'; end if;
  insert into public.whatsapp_platform_verification_document_requests(
    verification_id,tenant_id,requested_document_type,title,instructions,due_at,requested_by
  ) values (
    v_verification_id,p_tenant_id,p_document_type,trim(p_title),nullif(trim(coalesce(p_instructions,'')),''),p_due_at,auth.uid()
  ) returning id into v_request_id;
  update public.whatsapp_platform_business_verifications
    set status=case when status in ('submitted','in_review','verified','rejected') then 'changes_requested' else status end,
        review_notes='Additional verification evidence has been requested.',
        updated_at=now() where id=v_verification_id;
  update public.whatsapp_platform_tenants
    set verification_status=case when verification_status in ('submitted','in_review','verified','rejected') then 'changes_requested' else verification_status end,
        verified_at=case when verification_status='verified' then null else verified_at end,
        updated_at=now() where id=p_tenant_id;
  return jsonb_build_object('id',v_request_id,'status','requested');
end; $$;

create or replace function public.whatsapp_platform_admin_cancel_document_request(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not public.has_permission('whatsapp-platform','approve') then
    raise exception 'Not authorized to cancel verification document requests' using errcode='42501';
  end if;
  update public.whatsapp_platform_verification_document_requests
    set status='cancelled',updated_at=now()
    where id=p_request_id and status in ('requested','uploaded');
  if not found then raise exception 'Open document request not found' using errcode='P0002'; end if;
  return jsonb_build_object('id',p_request_id,'status','cancelled');
end; $$;

create or replace function public.whatsapp_platform_admin_review_verification(
  p_tenant_id uuid, p_decision text, p_notes text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_status text; v_reviewer uuid; v_unapproved integer;
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
  if p_decision='verified' then
    select count(*) into v_unapproved
    from public.whatsapp_platform_verification_documents
    where tenant_id=p_tenant_id and status='active' and review_status<>'approved';
    if v_unapproved > 0 then
      raise exception 'Approve every active verification document before approving the business pre-check.' using errcode='22023';
    end if;
  end if;

  v_reviewer := auth.uid();
  update public.whatsapp_platform_business_verifications set status=p_decision,
    review_notes=nullif(trim(coalesce(p_notes,'')),''), reviewed_at=now(), reviewed_by=v_reviewer, updated_at=now()
    where tenant_id=p_tenant_id and status in ('submitted','in_review','changes_requested','rejected','verified') returning status into v_status;
  if v_status is null then raise exception 'Verification submission not found or cannot be reviewed' using errcode='P0002'; end if;
  update public.whatsapp_platform_tenants set verification_status=p_decision,
    verified_at=case when p_decision='verified' then now() else null end, updated_at=now() where id=p_tenant_id;
  return jsonb_build_object('tenantId',p_tenant_id,'status',p_decision,'reviewedAt',now());
end; $$;

revoke all on function public.whatsapp_platform_admin_document_reviews() from public,anon;
revoke all on function public.whatsapp_platform_admin_review_document(uuid,text,text) from public,anon;
revoke all on function public.whatsapp_platform_admin_document_requests() from public,anon;
revoke all on function public.whatsapp_platform_admin_request_document(uuid,text,text,text,timestamptz) from public,anon;
revoke all on function public.whatsapp_platform_admin_cancel_document_request(uuid) from public,anon;
revoke all on function public.whatsapp_platform_admin_review_verification(uuid,text,text) from public,anon;
grant execute on function public.whatsapp_platform_admin_document_reviews() to authenticated,service_role;
grant execute on function public.whatsapp_platform_admin_review_document(uuid,text,text) to authenticated,service_role;
grant execute on function public.whatsapp_platform_admin_document_requests() to authenticated,service_role;
grant execute on function public.whatsapp_platform_admin_request_document(uuid,text,text,text,timestamptz) to authenticated,service_role;
grant execute on function public.whatsapp_platform_admin_cancel_document_request(uuid) to authenticated,service_role;
grant execute on function public.whatsapp_platform_admin_review_verification(uuid,text,text) to authenticated,service_role;
notify pgrst, 'reload schema';
