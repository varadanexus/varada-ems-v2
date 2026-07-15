-- Interiors design approval gate.
-- Architect draft -> staff review/publication -> client decision -> next project stage.

alter table public.interior_designs
  add column if not exists architect_portal_user_id uuid references public.external_portal_users(id) on delete set null,
  add column if not exists parent_design_id uuid references public.interior_designs(id) on delete set null,
  add column if not exists is_client_visible boolean not null default false,
  add column if not exists staff_reviewed_by uuid references public.app_users(id) on delete set null,
  add column if not exists staff_reviewed_at timestamptz,
  add column if not exists published_at timestamptz,
  add column if not exists client_decision text,
  add column if not exists client_decided_at timestamptz;

alter table public.interior_designs
  drop constraint if exists interior_designs_client_decision_check;
alter table public.interior_designs
  add constraint interior_designs_client_decision_check
  check (client_decision is null or client_decision in ('pending','approved','rejected','revision_requested'));

alter table public.interior_projects
  add column if not exists workflow_stage text not null default 'design',
  add column if not exists design_gate_status text not null default 'not_started',
  add column if not exists design_gate_completed_at timestamptz;

alter table public.interior_projects drop constraint if exists interior_projects_workflow_stage_check;
alter table public.interior_projects add constraint interior_projects_workflow_stage_check
  check (workflow_stage in ('design','client_review','pre_execution','execution','completion'));
alter table public.interior_projects drop constraint if exists interior_projects_design_gate_status_check;
alter table public.interior_projects add constraint interior_projects_design_gate_status_check
  check (design_gate_status in ('not_started','drafting','staff_review','client_review','revision_required','approved'));

create index if not exists idx_interior_designs_client_visibility
  on public.interior_designs(project_id, is_client_visible, status);
create unique index if not exists uq_interior_design_pending_client_approval
  on public.interior_client_approvals(reference_id)
  where reference_table = 'interior_designs' and decision = 'pending';

create or replace function public.interiors_architect_portal_save_design_draft(
  p_session_token text,
  p_project_id uuid,
  p_design_title text,
  p_description text default null,
  p_file_url text default null,
  p_design_id uuid default null
)
returns table(design_id uuid, version_no integer, status text)
language plpgsql security definer set search_path = public
as $$
declare
  v_access record;
  v_project public.interior_projects%rowtype;
  v_design public.interior_designs%rowtype;
  v_version integer;
begin
  select * into v_access from public.interiors_architect_portal_resolve(p_session_token) limit 1;
  select p.* into v_project from public.interior_projects p
  where p.id = p_project_id and exists (
    select 1 from public.interior_project_team t
    where t.project_id = p.shared_project_id and t.vendor_id = v_access.architect_id
      and t.team_role in ('architect','designer') and t.status = 'active'
  );
  if v_project.id is null then raise exception 'Project is not assigned to this architect'; end if;
  if nullif(trim(p_design_title), '') is null then raise exception 'Design title is required'; end if;

  if p_design_id is not null then
    select * into v_design from public.interior_designs d
    where d.id = p_design_id and d.project_id = v_project.shared_project_id
      and d.architect_portal_user_id = v_access.portal_user_id
      and d.status in ('draft','revision_requested') for update;
    if v_design.id is null then raise exception 'Only your draft or requested revision can be edited'; end if;
    update public.interior_designs set
      design_title = trim(p_design_title), description = nullif(trim(p_description), ''),
      file_url = coalesce(nullif(trim(p_file_url), ''), file_url), status = 'draft',
      is_client_visible = false, client_decision = null, client_decided_at = null
    where id = v_design.id;
    update public.interior_projects set workflow_stage = 'design', design_gate_status = 'drafting', design_gate_completed_at = null
    where id = v_project.id;
    return query select v_design.id, v_design.version_no, 'draft'::text;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext(v_project.shared_project_id::text));
  select coalesce(max(d.version_no), 0) + 1 into v_version from public.interior_designs d where d.project_id = v_project.shared_project_id;
  insert into public.interior_designs(project_id, version_no, design_title, description, file_url, status, architect_portal_user_id)
  values(v_project.shared_project_id, v_version, trim(p_design_title), nullif(trim(p_description), ''), nullif(trim(p_file_url), ''), 'draft', v_access.portal_user_id)
  returning * into v_design;
  update public.interior_projects set workflow_stage = 'design', design_gate_status = 'drafting', design_gate_completed_at = null
  where id = v_project.id;
  perform public.log_external_portal_audit_event(v_access.portal_user_id, 'interiors_architect_design_draft_saved',
    jsonb_build_object('project_id', v_project.id, 'design_id', v_design.id, 'version_no', v_design.version_no));
  return query select v_design.id, v_design.version_no, v_design.status;
end;
$$;

create or replace function public.interiors_architect_portal_submit_saved_design(p_session_token text, p_design_id uuid)
returns table(design_id uuid, version_no integer, status text)
language plpgsql security definer set search_path = public
as $$
declare v_access record; v_design public.interior_designs%rowtype; v_project_id uuid;
begin
  select * into v_access from public.interiors_architect_portal_resolve(p_session_token) limit 1;
  select d.* into v_design from public.interior_designs d
  where d.id = p_design_id and d.architect_portal_user_id = v_access.portal_user_id
    and d.status in ('draft','revision_requested') and exists (
      select 1 from public.interior_projects p join public.interior_project_team t on t.project_id = p.shared_project_id
      where p.shared_project_id = d.project_id and t.vendor_id = v_access.architect_id
        and t.team_role in ('architect','designer') and t.status = 'active'
    ) for update;
  if v_design.id is null then raise exception 'Design draft is not available for submission'; end if;
  if nullif(trim(v_design.file_url), '') is null and not exists (
    select 1 from public.drive_documents dd where dd.entity_id = v_design.id and dd.category = 'INTERIORS_DESIGN'
      and dd.deleted_at is null and dd.upload_status = 'stored'
  ) then raise exception 'Upload at least one design file before submission'; end if;
  update public.interior_designs set status='submitted', is_client_visible=false, staff_reviewed_by=null,
    staff_reviewed_at=null, published_at=null, client_decision=null, client_decided_at=null where id=v_design.id;
  select p.id into v_project_id from public.interior_projects p where p.shared_project_id=v_design.project_id limit 1;
  update public.interior_projects set workflow_stage='design', design_gate_status='staff_review', design_gate_completed_at=null where id=v_project_id;
  perform public.log_external_portal_audit_event(v_access.portal_user_id, 'interiors_architect_design_submitted',
    jsonb_build_object('project_id',v_project_id,'design_id',v_design.id,'version_no',v_design.version_no));
  return query select v_design.id, v_design.version_no, 'submitted'::text;
end;
$$;

-- Compatibility wrapper for older cached portal code: create a draft and submit it.
create or replace function public.interiors_architect_portal_submit_design(
  p_session_token text, p_project_id uuid, p_design_title text, p_description text default null, p_file_url text default null
)
returns table(design_id uuid, version_no integer)
language plpgsql security definer set search_path = public
as $$
declare v_d uuid; v_v integer;
begin
  select d.design_id,d.version_no into v_d,v_v from public.interiors_architect_portal_save_design_draft(
    p_session_token,p_project_id,p_design_title,p_description,p_file_url,null) d;
  if nullif(trim(p_file_url),'') is not null then
    perform public.interiors_architect_portal_submit_saved_design(p_session_token,v_d);
  end if;
  return query select v_d,v_v;
end;
$$;

create or replace function public.interiors_staff_review_design(p_design_id uuid, p_action text, p_remarks text default null)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare v_design public.interior_designs%rowtype; v_actor uuid; v_project public.interior_projects%rowtype; v_approval uuid; v_action text:=lower(trim(p_action));
begin
  v_actor := public.current_app_user_id();
  if v_actor is null or not (public.has_permission('interiors-designs','approve') or public.has_permission('interiors-approvals','approve')) then
    raise exception 'You do not have permission to review designs';
  end if;
  if v_action not in ('approve','reject','revision_requested') then raise exception 'Invalid review action'; end if;
  select * into v_design from public.interior_designs where id=p_design_id for update;
  if v_design.id is null or v_design.status <> 'submitted' then raise exception 'Only submitted designs can be reviewed'; end if;
  select * into v_project from public.interior_projects where shared_project_id=v_design.project_id limit 1;
  if v_project.id is null or not public.can_view_project_by_id(v_design.project_id) then raise exception 'Project is outside your access scope'; end if;

  if v_action='approve' then
    update public.interior_designs set status='approved',is_client_visible=true,staff_reviewed_by=v_actor,
      staff_reviewed_at=now(),published_at=now(),client_decision='pending',client_decided_at=null where id=v_design.id;
    insert into public.interior_client_approvals(interior_project_id,approval_type,reference_table,reference_id,decision,remarks)
    values(v_project.id,'design','interior_designs',v_design.id,'pending',nullif(trim(p_remarks),''))
    on conflict (reference_id) where reference_table='interior_designs' and decision='pending'
    do update set remarks=excluded.remarks,updated_at=now() returning id into v_approval;
    update public.interior_projects set workflow_stage='client_review',design_gate_status='client_review',design_gate_completed_at=null where id=v_project.id;
  else
    update public.interior_designs set status=case when v_action='reject' then 'rejected' else 'revision_requested' end,
      is_client_visible=false,staff_reviewed_by=v_actor,staff_reviewed_at=now(),published_at=null,client_decision=null,client_decided_at=null where id=v_design.id;
    update public.interior_projects set workflow_stage='design',design_gate_status='revision_required',design_gate_completed_at=null where id=v_project.id;
  end if;
  if nullif(trim(p_remarks),'') is not null then
    insert into public.interior_design_comments(design_id,comment,commented_by) values(v_design.id,trim(p_remarks),v_actor);
  end if;
  perform public.log_interiors_audit_event('interiors_design_staff_review','interiors-approvals','interior_designs',v_design.id,
    v_design.project_id,to_jsonb(v_design),jsonb_build_object('action',v_action,'remarks',p_remarks,'approval_id',v_approval));
  return jsonb_build_object('design_id',v_design.id,'action',v_action,'approval_id',v_approval,'project_stage',case when v_action='approve' then 'client_review' else 'design' end);
end;
$$;

create or replace function public.interiors_client_decide_design(p_approval_id uuid, p_decision text, p_remarks text default null)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare v_approval public.interior_client_approvals%rowtype; v_design public.interior_designs%rowtype; v_portal uuid; v_decision text:=lower(trim(p_decision));
begin
  if v_decision not in ('approved','rejected','revision_requested') then raise exception 'Invalid client decision'; end if;
  select * into v_approval from public.interior_client_approvals where id=p_approval_id for update;
  if v_approval.id is null or v_approval.approval_type <> 'design' or v_approval.reference_table <> 'interior_designs' or v_approval.decision <> 'pending' then
    raise exception 'This design approval is not available';
  end if;
  if not public.can_client_portal_user_act_on_project(v_approval.interior_project_id) then raise exception 'Approval access is required'; end if;
  v_portal := public.current_interior_client_portal_user_id();
  select * into v_design from public.interior_designs where id=v_approval.reference_id and is_client_visible for update;
  if v_design.id is null then raise exception 'The design has not been published to the client'; end if;
  update public.interior_client_approvals set decision=v_decision,remarks=nullif(trim(p_remarks),''),decided_at=now(),portal_user_id=coalesce(portal_user_id,v_portal) where id=v_approval.id;
  update public.interior_designs set client_decision=v_decision,client_decided_at=now(),
    status=case when v_decision='approved' then 'approved' when v_decision='rejected' then 'rejected' else 'revision_requested' end
  where id=v_design.id;
  if nullif(trim(p_remarks),'') is not null then insert into public.interior_design_comments(design_id,comment) values(v_design.id,'Client: '||trim(p_remarks)); end if;
  update public.interior_projects set workflow_stage=case when v_decision='approved' then 'pre_execution' else 'design' end,
    design_gate_status=case when v_decision='approved' then 'approved' else 'revision_required' end,
    design_gate_completed_at=case when v_decision='approved' then now() else null end where id=v_approval.interior_project_id;
  perform public.log_interiors_audit_event('interiors_design_client_decision','interiors-client-portal','interior_designs',v_design.id,
    v_design.project_id,to_jsonb(v_design),jsonb_build_object('decision',v_decision,'remarks',p_remarks,'portal_user_id',v_portal));
  return jsonb_build_object('design_id',v_design.id,'decision',v_decision,'next_stage',case when v_decision='approved' then 'pre_execution' else 'design' end);
end;
$$;

revoke all on function public.interiors_architect_portal_save_design_draft(text,uuid,text,text,text,uuid) from public;
revoke all on function public.interiors_architect_portal_submit_saved_design(text,uuid) from public;
revoke all on function public.interiors_staff_review_design(uuid,text,text) from public;
revoke all on function public.interiors_client_decide_design(uuid,text,text) from public;
grant execute on function public.interiors_architect_portal_save_design_draft(text,uuid,text,text,text,uuid) to anon,authenticated;
grant execute on function public.interiors_architect_portal_submit_saved_design(text,uuid) to anon,authenticated;
grant execute on function public.interiors_staff_review_design(uuid,text,text) to authenticated;
grant execute on function public.interiors_client_decide_design(uuid,text,text) to authenticated;

-- Client rows remain visible after publication so revision feedback never hides the source package.
drop policy if exists interior_designs_select_client_portal on public.interior_designs;
create policy interior_designs_select_client_portal on public.interior_designs for select to authenticated
using (is_client_visible=true and public.can_view_interior_client_shared_project(project_id));

-- Client decisions must pass through the transactional RPC above.
drop policy if exists interior_client_approvals_update_client_portal on public.interior_client_approvals;
create policy interior_client_approvals_update_client_portal on public.interior_client_approvals
for update to authenticated
using (
  approval_type <> 'design' and public.can_client_portal_user_act_on_project(interior_project_id)
  and (decision is null or decision='pending')
)
with check (approval_type <> 'design' and public.can_client_portal_user_act_on_project(interior_project_id));

-- Replace the registry's blanket authenticated access with staff access plus published client files.
drop policy if exists drive_documents_auth_rw on public.drive_documents;
drop policy if exists drive_documents_staff_rw on public.drive_documents;
create policy drive_documents_staff_rw on public.drive_documents for all to authenticated
using (public.current_app_user_id() is not null) with check (public.current_app_user_id() is not null);
drop policy if exists drive_documents_interiors_client_select on public.drive_documents;
create policy drive_documents_interiors_client_select on public.drive_documents for select to authenticated
using (
  category='INTERIORS_DESIGN' and deleted_at is null and exists (
    select 1 from public.interior_designs d where d.id=drive_documents.entity_id and d.is_client_visible=true
      and public.can_view_interior_client_shared_project(d.project_id)
  )
);

grant select on public.drive_documents to authenticated;
