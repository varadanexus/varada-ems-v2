-- Secure Legal Advocate Portal
-- Staff create advocate masters, provision credentials through Portal Access,
-- and explicitly share individual legal files. The portal never receives a
-- Google Drive URL or service credential; file bytes are proxied by the Legal
-- integrations function after this migration revalidates the live session.

do $$
declare v_constraint text;
begin
  select conname into v_constraint
  from pg_constraint
  where conrelid = 'public.external_portal_users'::regclass
    and contype = 'c' and pg_get_constraintdef(oid) ilike '%user_type%';
  if v_constraint is not null then
    execute format('alter table public.external_portal_users drop constraint %I', v_constraint);
  end if;
  alter table public.external_portal_users
    add constraint external_portal_users_user_type_check
    check (user_type in ('vendor','agent','contractor','employee','partner','architect','client','advocate'));
end $$;

create table if not exists public.legal_advocates (
  id uuid primary key default gen_random_uuid(),
  advocate_code text not null unique,
  full_name text not null,
  firm_name text,
  bar_council_number text,
  email text,
  phone text,
  status text not null default 'active' check (status in ('active','inactive')),
  notes text,
  created_by uuid references public.app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.legal_advocate_shares (
  id uuid primary key default gen_random_uuid(),
  advocate_id uuid not null references public.legal_advocates(id) on delete cascade,
  agreement_id uuid not null references public.legal_agreements(id) on delete cascade,
  archive_file_id uuid references public.legal_archive_files(id) on delete cascade,
  drive_document_id uuid references public.drive_documents(id) on delete cascade,
  display_title text,
  instructions text,
  permission_level text not null default 'comment' check (permission_level in ('view','comment','download')),
  review_status text not null default 'shared' check (review_status in ('shared','opened','under_review','revision_required','reviewed')),
  is_active boolean not null default true,
  expires_at timestamptz,
  shared_by uuid references public.app_users(id),
  shared_at timestamptz not null default now(),
  last_opened_at timestamptz,
  access_count integer not null default 0,
  revoked_at timestamptz,
  revoked_by uuid references public.app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint legal_advocate_share_one_file check (
    (archive_file_id is not null and drive_document_id is null) or
    (archive_file_id is null and drive_document_id is not null)
  )
);

create unique index if not exists uq_legal_advocate_share_archive
  on public.legal_advocate_shares(advocate_id, archive_file_id)
  where archive_file_id is not null and is_active;
create unique index if not exists uq_legal_advocate_share_drive_document
  on public.legal_advocate_shares(advocate_id, drive_document_id)
  where drive_document_id is not null and is_active;
create index if not exists idx_legal_advocate_shares_active
  on public.legal_advocate_shares(advocate_id, is_active, shared_at desc);

create table if not exists public.legal_advocate_comments (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references public.legal_advocate_shares(id) on delete cascade,
  advocate_id uuid not null references public.legal_advocates(id) on delete cascade,
  comment_type text not null default 'comment' check (comment_type in ('comment','question','revision_required','reviewed')),
  body text not null,
  created_at timestamptz not null default now(),
  staff_reply text,
  replied_by uuid references public.app_users(id),
  replied_at timestamptz
);

alter table public.legal_advocates enable row level security;
alter table public.legal_advocate_shares enable row level security;
alter table public.legal_advocate_comments enable row level security;

drop policy if exists legal_advocates_staff_select on public.legal_advocates;
create policy legal_advocates_staff_select on public.legal_advocates
  for select to authenticated using (public.has_permission('legal-archive','view') or public.has_permission('portal-management','view'));

revoke all on public.legal_advocates, public.legal_advocate_shares, public.legal_advocate_comments from anon;

create or replace function public.next_legal_advocate_code()
returns text language plpgsql security definer set search_path=public as $$
declare v_next integer;
begin
  perform pg_advisory_xact_lock(hashtext('legal_advocate_code'));
  select coalesce(max(nullif(regexp_replace(advocate_code, '\D', '', 'g'), '')::integer), 0) + 1
  into v_next from public.legal_advocates;
  return 'ADV-' || lpad(v_next::text, 5, '0');
end $$;

create or replace function public.legal_advocate_admin_context()
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not public.has_permission('legal-archive','view') then raise exception 'Legal archive view permission required'; end if;
  return jsonb_build_object(
    'advocates', coalesce((select jsonb_agg(to_jsonb(a) order by a.full_name) from public.legal_advocates a), '[]'::jsonb),
    'agreements', coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'agreement_no',a.agreement_no,'title',a.title,'party_name',a.party_name,'status',a.status
    ) order by a.created_at desc) from public.legal_agreements a where a.deleted_at is null), '[]'::jsonb),
    'files', coalesce((
      select jsonb_agg(f order by f->>'agreement_no', f->>'file_name') from (
        select jsonb_build_object(
          'source_kind','archive','source_id',af.id,'agreement_id',af.agreement_id,
          'agreement_no',a.agreement_no,'agreement_title',a.title,'file_name',af.file_name,
          'mime_type',af.mime_type,'file_kind',af.file_kind,'created_at',coalesce(af.uploaded_at,af.created_at)
        ) f from public.legal_archive_files af join public.legal_agreements a on a.id=af.agreement_id
        where af.drive_file_id is not null and a.deleted_at is null
        union all
        select jsonb_build_object(
          'source_kind','draft','source_id',dd.id,'agreement_id',a.id,
          'agreement_no',a.agreement_no,'agreement_title',a.title,'file_name',dd.file_name,
          'mime_type',dd.mime_type,'file_kind',coalesce(dd.document_type,'LEGAL_DRAFT'),'created_at',dd.created_at
        ) f from public.drive_documents dd
        join public.legal_agreements a on dd.error_detail like ('%agreement-id:'||a.id::text||';%')
        where dd.category='LEGAL_DRAFT' and dd.drive_file_id is not null and dd.deleted_at is null and a.deleted_at is null
      ) files
    ), '[]'::jsonb),
    'shares', coalesce((select jsonb_agg(jsonb_build_object(
      'id',s.id,'advocate_id',s.advocate_id,'advocate_name',v.full_name,
      'agreement_id',s.agreement_id,'agreement_no',a.agreement_no,'agreement_title',a.title,
      'display_title',s.display_title,'instructions',s.instructions,'permission_level',s.permission_level,
      'review_status',s.review_status,'is_active',s.is_active,'expires_at',s.expires_at,
      'shared_at',s.shared_at,'last_opened_at',s.last_opened_at,'access_count',s.access_count,
      'file_name',coalesce(af.file_name,dd.file_name),'mime_type',coalesce(af.mime_type,dd.mime_type),
      'source_kind',case when s.archive_file_id is not null then 'archive' else 'draft' end
    ) order by s.shared_at desc)
      from public.legal_advocate_shares s
      join public.legal_advocates v on v.id=s.advocate_id
      join public.legal_agreements a on a.id=s.agreement_id
      left join public.legal_archive_files af on af.id=s.archive_file_id
      left join public.drive_documents dd on dd.id=s.drive_document_id), '[]'::jsonb),
    'comments', coalesce((select jsonb_agg(jsonb_build_object(
      'id',c.id,'share_id',c.share_id,'advocate_id',c.advocate_id,'advocate_name',v.full_name,
      'comment_type',c.comment_type,'body',c.body,'created_at',c.created_at,
      'staff_reply',c.staff_reply,'replied_at',c.replied_at
    ) order by c.created_at desc)
      from public.legal_advocate_comments c join public.legal_advocates v on v.id=c.advocate_id), '[]'::jsonb)
  );
end $$;

create or replace function public.legal_advocate_admin_save_advocate(
  p_advocate_id uuid, p_full_name text, p_firm_name text default null,
  p_bar_council_number text default null, p_email text default null,
  p_phone text default null, p_notes text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_actor uuid:=public.current_app_user_id();
begin
  if not (public.has_permission('legal-archive','create') or public.has_permission('legal-archive','edit')) then raise exception 'Legal archive create or edit permission required'; end if;
  if nullif(trim(p_full_name),'') is null then raise exception 'Advocate name is required'; end if;
  if p_advocate_id is null then
    insert into public.legal_advocates(advocate_code,full_name,firm_name,bar_council_number,email,phone,notes,created_by)
    values(public.next_legal_advocate_code(),trim(p_full_name),nullif(trim(p_firm_name),''),nullif(trim(p_bar_council_number),''),nullif(lower(trim(p_email)),''),nullif(trim(p_phone),''),nullif(trim(p_notes),''),v_actor)
    returning id into v_id;
  else
    update public.legal_advocates set full_name=trim(p_full_name),firm_name=nullif(trim(p_firm_name),''),bar_council_number=nullif(trim(p_bar_council_number),''),email=nullif(lower(trim(p_email)),''),phone=nullif(trim(p_phone),''),notes=nullif(trim(p_notes),''),updated_at=now()
    where id=p_advocate_id returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function public.legal_advocate_admin_share(
  p_advocate_id uuid, p_agreement_id uuid, p_source_kind text, p_source_id uuid,
  p_display_title text default null, p_instructions text default null,
  p_permission_level text default 'comment', p_expires_at timestamptz default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_actor uuid:=public.current_app_user_id(); v_archive uuid; v_drive uuid;
begin
  if not public.has_permission('legal-archive','create') then raise exception 'Legal archive create permission required'; end if;
  if not exists(select 1 from public.legal_advocates where id=p_advocate_id and status='active') then raise exception 'Select an active advocate'; end if;
  if not exists(select 1 from public.legal_agreements where id=p_agreement_id and deleted_at is null) then raise exception 'Agreement not found'; end if;
  if p_permission_level not in ('view','comment','download') then raise exception 'Invalid permission level'; end if;
  if p_source_kind='archive' then
    select id into v_archive from public.legal_archive_files where id=p_source_id and agreement_id=p_agreement_id and drive_file_id is not null;
    if v_archive is null then raise exception 'Archive file not found for this agreement'; end if;
  elsif p_source_kind='draft' then
    select dd.id into v_drive from public.drive_documents dd
    where dd.id=p_source_id and dd.category='LEGAL_DRAFT' and dd.drive_file_id is not null and dd.deleted_at is null
      and dd.error_detail like ('%agreement-id:'||p_agreement_id::text||';%');
    if v_drive is null then raise exception 'Draft file not found for this agreement'; end if;
  else raise exception 'Invalid document source'; end if;
  insert into public.legal_advocate_shares(advocate_id,agreement_id,archive_file_id,drive_document_id,display_title,instructions,permission_level,expires_at,shared_by)
  values(p_advocate_id,p_agreement_id,v_archive,v_drive,nullif(trim(p_display_title),''),nullif(trim(p_instructions),''),p_permission_level,p_expires_at,v_actor)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.legal_advocate_admin_revoke_share(p_share_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if not public.has_permission('legal-archive','edit') then raise exception 'Legal archive edit permission required'; end if;
  update public.legal_advocate_shares set is_active=false,revoked_at=now(),revoked_by=public.current_app_user_id(),updated_at=now() where id=p_share_id and is_active;
  return found;
end $$;

create or replace function public.legal_advocate_admin_reply(p_comment_id uuid,p_reply text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if not public.has_permission('legal-archive','edit') then raise exception 'Legal archive edit permission required'; end if;
  if nullif(trim(p_reply),'') is null then raise exception 'Reply is required'; end if;
  update public.legal_advocate_comments set staff_reply=trim(p_reply),replied_by=public.current_app_user_id(),replied_at=now() where id=p_comment_id;
  return found;
end $$;

create or replace function public.legal_advocate_portal_resolve(p_session_token text)
returns table(portal_user_id uuid,advocate_id uuid) language plpgsql security definer set search_path=public as $$
declare v_user record;
begin
  select * into v_user from public.external_portal_validate_session(p_session_token) limit 1;
  if v_user.portal_user_id is null or v_user.user_type<>'advocate' then raise exception 'Advocate portal session is not valid'; end if;
  return query select v_user.portal_user_id,a.record_id from public.external_portal_access a
  join public.legal_advocates v on v.id=a.record_id
  where a.portal_user_id=v_user.portal_user_id and a.source_module='legal' and a.access_scope='legal_advocate_portal'
    and a.record_type='legal_advocates' and a.is_active and (a.expires_at is null or a.expires_at>now()) and v.status='active'
  order by a.granted_at desc limit 1;
end $$;

create or replace function public.legal_advocate_portal_context(p_session_token text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_access record;
begin
  select * into v_access from public.legal_advocate_portal_resolve(p_session_token) limit 1;
  if v_access.advocate_id is null then raise exception 'No active advocate profile is linked to this account'; end if;
  return jsonb_build_object(
    'profile',(select jsonb_build_object('id',v.id,'code',v.advocate_code,'name',v.full_name,'firm',v.firm_name,'bar_council_number',v.bar_council_number,'email',v.email,'phone',v.phone) from public.legal_advocates v where v.id=v_access.advocate_id),
    'shares',coalesce((select jsonb_agg(jsonb_build_object(
      'id',s.id,'agreement_id',s.agreement_id,'agreement_no',a.agreement_no,'agreement_title',a.title,
      'party_name',a.party_name,'agreement_status',a.status,'display_title',coalesce(s.display_title,af.file_name,dd.file_name,a.title),
      'file_name',coalesce(af.file_name,dd.file_name),'mime_type',coalesce(af.mime_type,dd.mime_type),
      'file_kind',coalesce(af.file_kind,dd.document_type,'LEGAL_DRAFT'),'permission_level',s.permission_level,
      'review_status',s.review_status,'instructions',s.instructions,'shared_at',s.shared_at,'expires_at',s.expires_at,
      'last_opened_at',s.last_opened_at,'access_count',s.access_count,
      'comments',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'comment_type',c.comment_type,'body',c.body,'created_at',c.created_at,'staff_reply',c.staff_reply,'replied_at',c.replied_at) order by c.created_at desc) from public.legal_advocate_comments c where c.share_id=s.id),'[]'::jsonb)
    ) order by s.shared_at desc) from public.legal_advocate_shares s
      join public.legal_agreements a on a.id=s.agreement_id
      left join public.legal_archive_files af on af.id=s.archive_file_id
      left join public.drive_documents dd on dd.id=s.drive_document_id
      where s.advocate_id=v_access.advocate_id and s.is_active and (s.expires_at is null or s.expires_at>now())), '[]'::jsonb)
  );
end $$;

create or replace function public.legal_advocate_portal_add_comment(p_session_token text,p_share_id uuid,p_comment_type text,p_body text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_access record; v_share public.legal_advocate_shares%rowtype; v_id uuid;
begin
  select * into v_access from public.legal_advocate_portal_resolve(p_session_token) limit 1;
  select * into v_share from public.legal_advocate_shares where id=p_share_id and advocate_id=v_access.advocate_id and is_active and (expires_at is null or expires_at>now());
  if v_share.id is null then raise exception 'Shared document is not available'; end if;
  if v_share.permission_level='view' then raise exception 'Comments are not enabled for this document'; end if;
  if p_comment_type not in ('comment','question','revision_required','reviewed') then raise exception 'Invalid review action'; end if;
  if nullif(trim(p_body),'') is null then raise exception 'Comment is required'; end if;
  insert into public.legal_advocate_comments(share_id,advocate_id,comment_type,body) values(v_share.id,v_access.advocate_id,p_comment_type,trim(p_body)) returning id into v_id;
  update public.legal_advocate_shares set review_status=case p_comment_type when 'revision_required' then 'revision_required' when 'reviewed' then 'reviewed' else 'under_review' end,updated_at=now() where id=v_share.id;
  perform public.log_external_portal_audit_event(v_access.portal_user_id,'legal_advocate_comment',jsonb_build_object('share_id',v_share.id,'comment_id',v_id,'comment_type',p_comment_type));
  return v_id;
end $$;

create or replace function public.legal_advocate_portal_file_access(p_session_token text,p_share_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_access record; v_result jsonb;
begin
  select * into v_access from public.legal_advocate_portal_resolve(p_session_token) limit 1;
  select jsonb_build_object('drive_file_id',coalesce(af.drive_file_id,dd.drive_file_id),'file_name',coalesce(af.file_name,dd.file_name),'mime_type',coalesce(af.mime_type,dd.mime_type),'permission_level',s.permission_level)
  into v_result from public.legal_advocate_shares s
  left join public.legal_archive_files af on af.id=s.archive_file_id
  left join public.drive_documents dd on dd.id=s.drive_document_id
  where s.id=p_share_id and s.advocate_id=v_access.advocate_id and s.is_active and (s.expires_at is null or s.expires_at>now());
  if v_result is null or nullif(v_result->>'drive_file_id','') is null then raise exception 'Shared document is unavailable'; end if;
  update public.legal_advocate_shares set last_opened_at=now(),access_count=access_count+1,review_status=case when review_status='shared' then 'opened' else review_status end,updated_at=now() where id=p_share_id;
  perform public.log_external_portal_audit_event(v_access.portal_user_id,'legal_advocate_file_opened',jsonb_build_object('share_id',p_share_id));
  return v_result;
end $$;

create or replace function public.external_portal_provision_user(
  p_user_type text, p_username text, p_initial_password text, p_display_name text,
  p_email text default null, p_phone text default null, p_source_module text default null,
  p_access_scope text default null, p_record_type text default null, p_record_id uuid default null,
  p_expires_at timestamptz default null, p_notes text default null, p_access_level text default 'standard'
) returns uuid language plpgsql security definer set search_path=public,vault,extensions as $$
declare v_actor_app_user_id uuid:=public.current_app_user_id();v_portal_user_id uuid;v_key text:=public.get_portal_vault_key();v_portal_user_code text;
begin
  if not public.has_permission('portal-management','create') then raise exception 'Not authorized to provision portal users'; end if;
  if p_user_type not in ('vendor','agent','contractor','employee','partner','architect','client','advocate') then raise exception 'Invalid user_type for external portal user'; end if;
  if p_initial_password is null or length(p_initial_password)<8 then raise exception 'Initial password must be at least 8 characters'; end if;
  if p_user_type='client' and not (p_source_module='interiors' and p_access_scope='interiors_client_portal' and p_record_type='interior_clients') then raise exception 'Client credentials must be linked to an Interiors client record'; end if;
  if p_user_type='advocate' and not (p_source_module='legal' and p_access_scope='legal_advocate_portal' and p_record_type='legal_advocates') then raise exception 'Advocate credentials must be linked to a Legal advocate record'; end if;
  v_portal_user_code:=public.next_portal_user_code('external_portal_users',case lower(p_user_type) when 'vendor' then 'PRT-VEN' when 'agent' then 'PRT-AGN' when 'contractor' then 'PRT-CON' when 'employee' then 'PRT-EMP' when 'partner' then 'PRT-PRT' when 'architect' then 'PRT-ARC' when 'client' then 'PRT-CLI' when 'advocate' then 'PRT-ADV' else 'PRT-EXT' end);
  insert into public.external_portal_users(portal_user_code,user_type,username,email,phone,password_hash,display_name,notes,created_by,encrypted_password_vault,password_changed_at,password_set_by)
  values(v_portal_user_code,p_user_type,p_username,p_email,p_phone,crypt(p_initial_password,gen_salt('bf')),p_display_name,p_notes,v_actor_app_user_id,pgp_sym_encrypt(p_initial_password,v_key),now(),v_actor_app_user_id) returning id into v_portal_user_id;
  if p_record_type is not null and p_record_id is not null then insert into public.external_portal_access(portal_user_id,source_module,access_scope,record_type,record_id,granted_by,expires_at,notes,access_level) values(v_portal_user_id,coalesce(p_source_module,p_user_type),coalesce(p_access_scope,p_user_type||'_portal'),p_record_type,p_record_id,v_actor_app_user_id,p_expires_at,p_notes,coalesce(p_access_level,'standard')); end if;
  perform public.log_external_portal_audit_event(v_portal_user_id,'provisioned',jsonb_build_object('actor',v_actor_app_user_id,'user_type',p_user_type));return v_portal_user_id;
end $$;

revoke all on function public.legal_advocate_admin_context() from public,anon;
revoke all on function public.legal_advocate_admin_save_advocate(uuid,text,text,text,text,text,text) from public,anon;
revoke all on function public.legal_advocate_admin_share(uuid,uuid,text,uuid,text,text,text,timestamptz) from public,anon;
revoke all on function public.legal_advocate_admin_revoke_share(uuid) from public,anon;
revoke all on function public.legal_advocate_admin_reply(uuid,text) from public,anon;
grant execute on function public.legal_advocate_admin_context() to authenticated;
grant execute on function public.legal_advocate_admin_save_advocate(uuid,text,text,text,text,text,text) to authenticated;
grant execute on function public.legal_advocate_admin_share(uuid,uuid,text,uuid,text,text,text,timestamptz) to authenticated;
grant execute on function public.legal_advocate_admin_revoke_share(uuid) to authenticated;
grant execute on function public.legal_advocate_admin_reply(uuid,text) to authenticated;
revoke all on function public.legal_advocate_portal_resolve(text) from public;
revoke all on function public.legal_advocate_portal_context(text) from public;
revoke all on function public.legal_advocate_portal_add_comment(text,uuid,text,text) from public;
revoke all on function public.legal_advocate_portal_file_access(text,uuid) from public;
grant execute on function public.legal_advocate_portal_context(text) to anon,authenticated;
grant execute on function public.legal_advocate_portal_add_comment(text,uuid,text,text) to anon,authenticated;
grant execute on function public.legal_advocate_portal_file_access(text,uuid) to service_role;
revoke all on function public.external_portal_provision_user(text,text,text,text,text,text,text,text,text,uuid,timestamptz,text,text) from public,anon;
grant execute on function public.external_portal_provision_user(text,text,text,text,text,text,text,text,text,uuid,timestamptz,text,text) to authenticated;

notify pgrst, 'reload schema';
