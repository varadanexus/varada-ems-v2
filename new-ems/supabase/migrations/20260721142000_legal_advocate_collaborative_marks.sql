-- Collaborative, page-aware annotations and bookmarks for legal documents.
-- Marks are visible to every advocate who has an active share to the same
-- underlying file. They are never exposed to unauthorised portal accounts.

create table if not exists public.legal_document_annotations (
  id uuid primary key default extensions.gen_random_uuid(),
  share_id uuid not null references public.legal_advocate_shares(id) on delete cascade,
  advocate_id uuid not null references public.legal_advocates(id) on delete cascade,
  page_number integer not null default 1 check (page_number between 1 and 100000),
  annotation_type text not null default 'note' check (annotation_type in ('note','question','important','highlight')),
  body text not null check (length(trim(body)) between 1 and 4000),
  quoted_text text,
  color text not null default '#ddb85a' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create table if not exists public.legal_document_bookmarks (
  id uuid primary key default extensions.gen_random_uuid(),
  share_id uuid not null references public.legal_advocate_shares(id) on delete cascade,
  advocate_id uuid not null references public.legal_advocates(id) on delete cascade,
  page_number integer not null default 1 check (page_number between 1 and 100000),
  label text not null check (length(trim(label)) between 1 and 160),
  note text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create index if not exists idx_legal_document_annotations_share_page on public.legal_document_annotations(share_id,page_number,created_at);
create index if not exists idx_legal_document_bookmarks_share_page on public.legal_document_bookmarks(share_id,page_number,created_at);

alter table public.legal_document_annotations enable row level security;
alter table public.legal_document_bookmarks enable row level security;
revoke all on public.legal_document_annotations, public.legal_document_bookmarks from anon,authenticated;

create or replace function public.legal_advocate_portal_document_marks(p_session_token text,p_share_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_access record; v_share public.legal_advocate_shares%rowtype;
begin
  select * into v_access from public.legal_advocate_portal_resolve(p_session_token) limit 1;
  select * into v_share from public.legal_advocate_shares
  where id=p_share_id and advocate_id=v_access.advocate_id and is_active and (expires_at is null or expires_at>clock_timestamp());
  if v_share.id is null then raise exception 'Shared document is not available'; end if;
  if not exists(select 1 from public.external_portal_sessions s where s.session_token=p_session_token and s.portal_user_id=v_access.portal_user_id and s.revoked_at is null and s.expires_at>clock_timestamp() and s.legal_preview_otp_verified_at is not null) then
    raise exception 'Preview OTP verification required';
  end if;
  return jsonb_build_object(
    'annotations',coalesce((select jsonb_agg(jsonb_build_object(
      'id',m.id,'page_number',m.page_number,'annotation_type',m.annotation_type,'body',m.body,
      'quoted_text',m.quoted_text,'color',m.color,'created_at',m.created_at,'updated_at',m.updated_at,
      'author_name',a.full_name,'can_edit',m.advocate_id=v_access.advocate_id
    ) order by m.page_number,m.created_at)
      from public.legal_document_annotations m
      join public.legal_advocate_shares source_share on source_share.id=m.share_id
      join public.legal_advocates a on a.id=m.advocate_id
      where source_share.agreement_id=v_share.agreement_id and (
        (v_share.archive_file_id is not null and source_share.archive_file_id=v_share.archive_file_id) or
        (v_share.drive_document_id is not null and source_share.drive_document_id=v_share.drive_document_id)
      )), '[]'::jsonb),
    'bookmarks',coalesce((select jsonb_agg(jsonb_build_object(
      'id',m.id,'page_number',m.page_number,'label',m.label,'note',m.note,
      'created_at',m.created_at,'updated_at',m.updated_at,'author_name',a.full_name,
      'can_edit',m.advocate_id=v_access.advocate_id
    ) order by m.page_number,m.created_at)
      from public.legal_document_bookmarks m
      join public.legal_advocate_shares source_share on source_share.id=m.share_id
      join public.legal_advocates a on a.id=m.advocate_id
      where source_share.agreement_id=v_share.agreement_id and (
        (v_share.archive_file_id is not null and source_share.archive_file_id=v_share.archive_file_id) or
        (v_share.drive_document_id is not null and source_share.drive_document_id=v_share.drive_document_id)
      )), '[]'::jsonb)
  );
end $$;

create or replace function public.legal_advocate_portal_save_annotation(
  p_session_token text,p_share_id uuid,p_annotation_id uuid,p_page_number integer,
  p_annotation_type text,p_body text,p_quoted_text text default null,p_color text default '#ddb85a'
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_access record; v_share public.legal_advocate_shares%rowtype; v_id uuid;
begin
  select * into v_access from public.legal_advocate_portal_resolve(p_session_token) limit 1;
  select * into v_share from public.legal_advocate_shares where id=p_share_id and advocate_id=v_access.advocate_id and is_active and (expires_at is null or expires_at>clock_timestamp());
  if v_share.id is null then raise exception 'Shared document is not available'; end if;
  if p_page_number is null or p_page_number<1 then raise exception 'Valid page number is required'; end if;
  if p_annotation_type not in ('note','question','important','highlight') then raise exception 'Invalid annotation type'; end if;
  if nullif(trim(p_body),'') is null then raise exception 'Annotation text is required'; end if;
  if coalesce(p_color,'') !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Invalid annotation colour'; end if;
  if p_annotation_id is null then
    insert into public.legal_document_annotations(share_id,advocate_id,page_number,annotation_type,body,quoted_text,color)
    values(v_share.id,v_access.advocate_id,p_page_number,p_annotation_type,trim(p_body),nullif(trim(p_quoted_text),''),p_color) returning id into v_id;
  else
    update public.legal_document_annotations m set page_number=p_page_number,annotation_type=p_annotation_type,body=trim(p_body),quoted_text=nullif(trim(p_quoted_text),''),color=p_color,updated_at=clock_timestamp()
    where m.id=p_annotation_id and m.advocate_id=v_access.advocate_id and exists(
      select 1 from public.legal_advocate_shares source_share where source_share.id=m.share_id and source_share.agreement_id=v_share.agreement_id and (
        (v_share.archive_file_id is not null and source_share.archive_file_id=v_share.archive_file_id) or
        (v_share.drive_document_id is not null and source_share.drive_document_id=v_share.drive_document_id))) returning m.id into v_id;
    if v_id is null then raise exception 'Annotation cannot be edited'; end if;
  end if;
  perform public.log_external_portal_audit_event(v_access.portal_user_id,'legal_document_annotation_saved',jsonb_build_object('share_id',v_share.id,'annotation_id',v_id,'page_number',p_page_number));
  return v_id;
end $$;

create or replace function public.legal_advocate_portal_delete_annotation(p_session_token text,p_share_id uuid,p_annotation_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_access record; v_share public.legal_advocate_shares%rowtype;
begin
  select * into v_access from public.legal_advocate_portal_resolve(p_session_token) limit 1;
  select * into v_share from public.legal_advocate_shares where id=p_share_id and advocate_id=v_access.advocate_id and is_active and (expires_at is null or expires_at>clock_timestamp());
  delete from public.legal_document_annotations m where m.id=p_annotation_id and m.advocate_id=v_access.advocate_id and exists(
    select 1 from public.legal_advocate_shares source_share where source_share.id=m.share_id and source_share.agreement_id=v_share.agreement_id and ((v_share.archive_file_id is not null and source_share.archive_file_id=v_share.archive_file_id) or (v_share.drive_document_id is not null and source_share.drive_document_id=v_share.drive_document_id)));
  if found then perform public.log_external_portal_audit_event(v_access.portal_user_id,'legal_document_annotation_deleted',jsonb_build_object('share_id',v_share.id,'annotation_id',p_annotation_id)); end if;
  return found;
end $$;

create or replace function public.legal_advocate_portal_save_bookmark(
  p_session_token text,p_share_id uuid,p_bookmark_id uuid,p_page_number integer,p_label text,p_note text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_access record; v_share public.legal_advocate_shares%rowtype; v_id uuid;
begin
  select * into v_access from public.legal_advocate_portal_resolve(p_session_token) limit 1;
  select * into v_share from public.legal_advocate_shares where id=p_share_id and advocate_id=v_access.advocate_id and is_active and (expires_at is null or expires_at>clock_timestamp());
  if v_share.id is null then raise exception 'Shared document is not available'; end if;
  if p_page_number is null or p_page_number<1 then raise exception 'Valid page number is required'; end if;
  if nullif(trim(p_label),'') is null then raise exception 'Bookmark label is required'; end if;
  if p_bookmark_id is null then
    insert into public.legal_document_bookmarks(share_id,advocate_id,page_number,label,note)
    values(v_share.id,v_access.advocate_id,p_page_number,trim(p_label),nullif(trim(p_note),'')) returning id into v_id;
  else
    update public.legal_document_bookmarks m set page_number=p_page_number,label=trim(p_label),note=nullif(trim(p_note),''),updated_at=clock_timestamp()
    where m.id=p_bookmark_id and m.advocate_id=v_access.advocate_id and exists(
      select 1 from public.legal_advocate_shares source_share where source_share.id=m.share_id and source_share.agreement_id=v_share.agreement_id and ((v_share.archive_file_id is not null and source_share.archive_file_id=v_share.archive_file_id) or (v_share.drive_document_id is not null and source_share.drive_document_id=v_share.drive_document_id))) returning m.id into v_id;
    if v_id is null then raise exception 'Bookmark cannot be edited'; end if;
  end if;
  perform public.log_external_portal_audit_event(v_access.portal_user_id,'legal_document_bookmark_saved',jsonb_build_object('share_id',v_share.id,'bookmark_id',v_id,'page_number',p_page_number));
  return v_id;
end $$;

create or replace function public.legal_advocate_portal_delete_bookmark(p_session_token text,p_share_id uuid,p_bookmark_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_access record; v_share public.legal_advocate_shares%rowtype;
begin
  select * into v_access from public.legal_advocate_portal_resolve(p_session_token) limit 1;
  select * into v_share from public.legal_advocate_shares where id=p_share_id and advocate_id=v_access.advocate_id and is_active and (expires_at is null or expires_at>clock_timestamp());
  delete from public.legal_document_bookmarks m where m.id=p_bookmark_id and m.advocate_id=v_access.advocate_id and exists(
    select 1 from public.legal_advocate_shares source_share where source_share.id=m.share_id and source_share.agreement_id=v_share.agreement_id and ((v_share.archive_file_id is not null and source_share.archive_file_id=v_share.archive_file_id) or (v_share.drive_document_id is not null and source_share.drive_document_id=v_share.drive_document_id)));
  if found then perform public.log_external_portal_audit_event(v_access.portal_user_id,'legal_document_bookmark_deleted',jsonb_build_object('share_id',v_share.id,'bookmark_id',p_bookmark_id)); end if;
  return found;
end $$;

revoke all on function public.legal_advocate_portal_document_marks(text,uuid) from public;
revoke all on function public.legal_advocate_portal_save_annotation(text,uuid,uuid,integer,text,text,text,text) from public;
revoke all on function public.legal_advocate_portal_delete_annotation(text,uuid,uuid) from public;
revoke all on function public.legal_advocate_portal_save_bookmark(text,uuid,uuid,integer,text,text) from public;
revoke all on function public.legal_advocate_portal_delete_bookmark(text,uuid,uuid) from public;
grant execute on function public.legal_advocate_portal_document_marks(text,uuid) to anon,authenticated;
grant execute on function public.legal_advocate_portal_save_annotation(text,uuid,uuid,integer,text,text,text,text) to anon,authenticated;
grant execute on function public.legal_advocate_portal_delete_annotation(text,uuid,uuid) to anon,authenticated;
grant execute on function public.legal_advocate_portal_save_bookmark(text,uuid,uuid,integer,text,text) to anon,authenticated;
grant execute on function public.legal_advocate_portal_delete_bookmark(text,uuid,uuid) to anon,authenticated;
notify pgrst, 'reload schema';
