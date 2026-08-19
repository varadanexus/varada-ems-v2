-- Correct the document-level review function for the deployed verification
-- schema. Business verification timestamps live on the tenant record, not on
-- whatsapp_platform_business_verifications.
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

revoke all on function public.whatsapp_platform_admin_review_document(uuid,text,text) from public,anon;
grant execute on function public.whatsapp_platform_admin_review_document(uuid,text,text) to authenticated,service_role;
notify pgrst, 'reload schema';
