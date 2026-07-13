-- Sprint 19B: Transporter portal trip-document uploads + staff approval
--
-- Lets transporter-portal users upload trip documents (weigh bill, trip sheet,
-- expense receipt) for their assigned trips. Files are stored in Google Drive by
-- the drive-integrations edge function; this migration adds the approval
-- workflow + Drive linkage to transport_trip_documents, a portal read RPC, and
-- staff approve/reject RPCs (documents are reviewed inside Trip Details).

-- 1. Approval workflow + Drive linkage columns -------------------------------
alter table public.transport_trip_documents
  add column if not exists approval_status text not null default 'pending',
  add column if not exists approved_by uuid,
  add column if not exists approved_at timestamptz,
  add column if not exists rejection_reason text,
  add column if not exists uploaded_by_actor_type text,
  add column if not exists uploaded_by_actor_id uuid,
  add column if not exists drive_file_id text,
  add column if not exists drive_folder_id text,
  add column if not exists web_view_link text;

create index if not exists idx_transport_trip_documents_approval_status
  on public.transport_trip_documents(approval_status);

-- 2. Normalize trigger: allow EXPENSE_RECEIPT + keep approval_status sane -----
create or replace function public.before_ins_upd_transport_trip_documents_normalize()
returns trigger
language plpgsql
as $$
declare
  v_trip_no text;
  v_base text;
begin
  if new.document_type is null then
    raise exception 'document_type is required';
  end if;

  new.document_type := upper(new.document_type);
  if new.document_type not in ('WEIGHT_BILL','TRIP_SHEET','INVOICE_COPY','EWAY_BILL','POD','LOADING_SLIP','UNLOADING_SLIP','EXPENSE_RECEIPT','OTHER') then
    raise exception 'unsupported document_type %', new.document_type;
  end if;

  if new.document_type = 'OTHER' and coalesce(btrim(new.custom_document_name), '') = '' then
    raise exception 'custom_document_name is required for OTHER';
  end if;

  new.is_mandatory := (new.document_type = 'WEIGHT_BILL');

  new.approval_status := lower(coalesce(nullif(btrim(new.approval_status), ''), 'pending'));
  if new.approval_status not in ('pending','approved','rejected') then
    raise exception 'invalid approval_status %', new.approval_status;
  end if;

  select trip_no into v_trip_no from public.transport_trips where id = new.trip_id;
  if v_trip_no is null then
    raise exception 'invalid trip_id';
  end if;

  v_base := case when new.document_type = 'OTHER' then coalesce(new.custom_document_name,'OTHER') else new.document_type end;
  v_base := upper(regexp_replace(v_base, '[^A-Za-z0-9]', '', 'g'));
  if coalesce(v_base, '') = '' then v_base := 'DOC'; end if;
  new.stored_file_name := v_base || '-' || v_trip_no;
  new.updated_at := now();
  return new;
end;
$$;

-- 3. Transporter portal: list my uploaded documents across my trips ----------
create or replace function public.transport_transporter_portal_documents(
  p_session_token text,
  p_transport_transporter_id uuid
)
returns table(
  id uuid,
  trip_id uuid,
  trip_no text,
  document_type text,
  original_file_name text,
  web_view_link text,
  approval_status text,
  rejection_reason text,
  remarks text,
  created_at timestamptz,
  approved_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_portal_user_id uuid;
begin
  select portal_user_id into v_portal_user_id
  from public.transport_portal_validate_session(p_session_token);

  if v_portal_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1 from public.transport_transporter_portal_access a
    where a.portal_user_id = v_portal_user_id
      and a.transport_transporter_id = p_transport_transporter_id
      and a.is_active
  ) then
    raise exception 'Access denied for this transporter';
  end if;

  return query
  select
    d.id, d.trip_id, t.trip_no, d.document_type, d.original_file_name,
    d.web_view_link, d.approval_status, d.rejection_reason, d.remarks,
    d.created_at, d.approved_at
  from public.transport_trip_documents d
  join public.transport_trips t on t.id = d.trip_id
  where t.transport_transporter_id = p_transport_transporter_id
    and d.deleted_at is null
    and d.is_active
    and coalesce(d.is_uploaded, false) = true
  order by d.created_at desc;
end;
$$;

grant execute on function public.transport_transporter_portal_documents(text, uuid) to anon, authenticated;

-- 4. Staff approve / reject (used from Trip Details) --------------------------
create or replace function public.approve_transport_trip_document(p_document_id uuid)
returns public.transport_trip_documents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.transport_trip_documents;
begin
  if v_uid is null or not exists (
    select 1 from public.app_users u where u.auth_user_id = v_uid and u.status = 'active' and not u.is_locked
  ) then
    raise exception 'Not authorized';
  end if;

  update public.transport_trip_documents
     set approval_status = 'approved',
         approved_by = v_uid,
         approved_at = now(),
         rejection_reason = null
   where id = p_document_id and deleted_at is null
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Document not found';
  end if;
  return v_row;
end;
$$;

create or replace function public.reject_transport_trip_document(p_document_id uuid, p_reason text default null)
returns public.transport_trip_documents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.transport_trip_documents;
begin
  if v_uid is null or not exists (
    select 1 from public.app_users u where u.auth_user_id = v_uid and u.status = 'active' and not u.is_locked
  ) then
    raise exception 'Not authorized';
  end if;

  update public.transport_trip_documents
     set approval_status = 'rejected',
         approved_by = v_uid,
         approved_at = now(),
         rejection_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where id = p_document_id and deleted_at is null
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Document not found';
  end if;
  return v_row;
end;
$$;

grant execute on function public.approve_transport_trip_document(uuid) to authenticated;
grant execute on function public.reject_transport_trip_document(uuid, text) to authenticated;
