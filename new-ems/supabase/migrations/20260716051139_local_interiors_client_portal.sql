-- Move Interiors client credentials onto the EMS-managed external portal
-- identity/session store. No Supabase Auth identity is created or required.

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
    check (user_type in ('vendor','agent','contractor','employee','partner','architect','client'));
end $$;

create or replace function public.external_portal_provision_user(
  p_user_type text, p_username text, p_initial_password text, p_display_name text,
  p_email text default null, p_phone text default null, p_source_module text default null,
  p_access_scope text default null, p_record_type text default null, p_record_id uuid default null,
  p_expires_at timestamptz default null, p_notes text default null, p_access_level text default 'standard'
) returns uuid language plpgsql security definer set search_path=public,vault,extensions as $$
declare
  v_actor_app_user_id uuid := public.current_app_user_id(); v_portal_user_id uuid;
  v_key text := public.get_portal_vault_key(); v_portal_user_code text;
begin
  if not public.has_permission('portal-management','create') then raise exception 'Not authorized to provision portal users'; end if;
  if p_user_type not in ('vendor','agent','contractor','employee','partner','architect','client') then raise exception 'Invalid user_type for external portal user'; end if;
  if p_initial_password is null or length(p_initial_password)<8 then raise exception 'Initial password must be at least 8 characters'; end if;
  if p_user_type='client' and not (p_source_module='interiors' and p_access_scope='interiors_client_portal' and p_record_type='interior_clients') then
    raise exception 'Client credentials must be linked to an Interiors client record';
  end if;
  v_portal_user_code := public.next_portal_user_code('external_portal_users', case lower(p_user_type)
    when 'vendor' then 'PRT-VEN' when 'agent' then 'PRT-AGN' when 'contractor' then 'PRT-CON'
    when 'employee' then 'PRT-EMP' when 'partner' then 'PRT-PRT' when 'architect' then 'PRT-ARC'
    when 'client' then 'PRT-CLI' else 'PRT-EXT' end);
  insert into public.external_portal_users(portal_user_code,user_type,username,email,phone,password_hash,display_name,notes,created_by,encrypted_password_vault,password_changed_at,password_set_by)
  values(v_portal_user_code,p_user_type,p_username,p_email,p_phone,crypt(p_initial_password,gen_salt('bf')),p_display_name,p_notes,v_actor_app_user_id,pgp_sym_encrypt(p_initial_password,v_key),now(),v_actor_app_user_id)
  returning id into v_portal_user_id;
  if p_record_type is not null and p_record_id is not null then
    insert into public.external_portal_access(portal_user_id,source_module,access_scope,record_type,record_id,granted_by,expires_at,notes,access_level)
    values(v_portal_user_id,coalesce(p_source_module,p_user_type),coalesce(p_access_scope,p_user_type||'_portal'),p_record_type,p_record_id,v_actor_app_user_id,p_expires_at,p_notes,coalesce(p_access_level,'standard'));
  end if;
  perform public.log_external_portal_audit_event(v_portal_user_id,'provisioned',jsonb_build_object('actor',v_actor_app_user_id,'user_type',p_user_type));
  return v_portal_user_id;
end $$;

revoke all on function public.external_portal_provision_user(text,text,text,text,text,text,text,text,text,uuid,timestamptz,text,text) from public,anon;
grant execute on function public.external_portal_provision_user(text,text,text,text,text,text,text,text,text,uuid,timestamptz,text,text) to authenticated;

create or replace function public.interiors_client_portal_context(p_session_token text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_user public.external_portal_users%rowtype; v_client public.interior_clients%rowtype; v_access public.external_portal_access%rowtype;
  v_project_ids uuid[]; v_shared_ids uuid[]; v_design_ids uuid[];
begin
  select u.* into v_user from public.external_portal_sessions s join public.external_portal_users u on u.id=s.portal_user_id
  where s.session_token=p_session_token and s.revoked_at is null and s.expires_at>now() and u.status='active' and not u.is_locked and u.user_type='client';
  if v_user.id is null then raise exception 'Invalid or expired client portal session'; end if;
  select a.* into v_access from public.external_portal_access a where a.portal_user_id=v_user.id and a.source_module='interiors'
    and a.access_scope='interiors_client_portal' and a.record_type='interior_clients' and a.is_active
    and (a.expires_at is null or a.expires_at>now()) order by a.granted_at desc limit 1;
  if v_access.id is null then raise exception 'No active Interiors client access is linked to this account'; end if;
  select * into v_client from public.interior_clients where id=v_access.record_id and is_active;
  if v_client.id is null then raise exception 'The linked Interiors client is unavailable'; end if;
  select coalesce(array_agg(id),'{}') into v_project_ids from public.interior_projects where interior_client_id=v_client.id and is_active;
  select coalesce(array_agg(shared_project_id) filter(where shared_project_id is not null),'{}') into v_shared_ids from public.interior_projects where id=any(v_project_ids);
  select coalesce(array_agg(id),'{}') into v_design_ids from public.interior_designs where project_id=any(v_shared_ids) and is_client_visible=true;
  return jsonb_build_object(
    'portalUser',jsonb_build_object('id',v_user.id,'portal_user_code',v_user.portal_user_code,'contact_name',v_user.display_name,'email',v_user.email,'phone',v_user.phone,'portal_status','active','interior_clients',to_jsonb(v_client)),
    'clientRecord',to_jsonb(v_client),
    'access',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'portal_user_id',v_user.id,'interior_project_id',p.id,'access_level',v_access.access_level,'is_active',true)),'[]') from public.interior_projects p where p.id=any(v_project_ids)),
    'projects',(select coalesce(jsonb_agg(to_jsonb(p) order by p.project_name),'[]') from public.interior_projects p where p.id=any(v_project_ids)),
    'approvals',(select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc),'[]') from public.interior_client_approvals a where a.interior_project_id=any(v_project_ids)),
    'designs',(select coalesce(jsonb_agg(to_jsonb(d) order by coalesce(d.updated_at,d.uploaded_at) desc),'[]') from public.interior_designs d where d.id=any(v_design_ids)),
    'designFiles',(select coalesce(jsonb_agg(to_jsonb(dd) order by dd.created_at desc),'[]') from public.drive_documents dd where dd.category='INTERIORS_DESIGN' and dd.entity_id=any(v_design_ids) and dd.deleted_at is null),
    'siteUpdates',(select coalesce(jsonb_agg(to_jsonb(su) order by su.update_date desc),'[]') from public.interior_site_updates su where su.project_id=any(v_shared_ids)),
    'photos',(select coalesce(jsonb_agg(to_jsonb(ph) order by ph.uploaded_at desc),'[]') from public.interior_project_photos ph where ph.project_id=any(v_shared_ids) and ph.is_client_visible),
    'billingHeaders',(select coalesce(jsonb_agg(to_jsonb(b) order by coalesce(b.bill_date,b.created_at::date) desc),'[]') from public.interior_billing_headers b where b.project_id=any(v_shared_ids) and b.status in ('submitted','approved','ready_for_accounts'))
  );
end $$;

create or replace function public.interiors_client_portal_decide_design(p_session_token text,p_approval_id uuid,p_decision text,p_remarks text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_context jsonb; v_approval public.interior_client_approvals%rowtype; v_design public.interior_designs%rowtype; v_decision text:=lower(trim(p_decision)); v_client_id uuid;
begin
  v_context:=public.interiors_client_portal_context(p_session_token);
  v_client_id:=(v_context->'clientRecord'->>'id')::uuid;
  if v_decision not in ('approved','rejected','revision_requested') then raise exception 'Invalid client decision'; end if;
  select a.* into v_approval from public.interior_client_approvals a join public.interior_projects p on p.id=a.interior_project_id
  where a.id=p_approval_id and p.interior_client_id=v_client_id for update of a;
  if v_approval.id is null or v_approval.approval_type<>'design' or v_approval.reference_table<>'interior_designs' or v_approval.decision<>'pending' then raise exception 'This design approval is not available'; end if;
  select * into v_design from public.interior_designs where id=v_approval.reference_id and is_client_visible for update;
  if v_design.id is null then raise exception 'The design has not been published to the client'; end if;
  update public.interior_client_approvals set decision=v_decision,remarks=nullif(trim(p_remarks),''),decided_at=now() where id=v_approval.id;
  update public.interior_designs set client_decision=v_decision,client_decided_at=now(),status=case when v_decision='approved' then 'approved' when v_decision='rejected' then 'rejected' else 'revision_requested' end where id=v_design.id;
  if nullif(trim(p_remarks),'') is not null then insert into public.interior_design_comments(design_id,comment) values(v_design.id,'Client: '||trim(p_remarks)); end if;
  update public.interior_projects set workflow_stage=case when v_decision='approved' then 'pre_execution' else 'design' end,design_gate_status=case when v_decision='approved' then 'approved' else 'revision_required' end,design_gate_completed_at=case when v_decision='approved' then now() else null end where id=v_approval.interior_project_id;
  return jsonb_build_object('design_id',v_design.id,'decision',v_decision,'next_stage',case when v_decision='approved' then 'pre_execution' else 'design' end);
end $$;

revoke all on function public.interiors_client_portal_context(text) from public;
revoke all on function public.interiors_client_portal_decide_design(text,uuid,text,text) from public;
grant execute on function public.interiors_client_portal_context(text) to anon,authenticated;
grant execute on function public.interiors_client_portal_decide_design(text,uuid,text,text) to anon,authenticated;
