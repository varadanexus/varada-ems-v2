-- Interiors Architect Portal
-- Architects remain Interiors vendor masters and are assigned through
-- interior_project_team. Portal sessions use the existing external portal
-- identity stack and every RPC revalidates both the session and assignment.

alter table public.interior_vendors
  drop constraint if exists interior_vendors_vendor_type_check;
alter table public.interior_vendors
  add constraint interior_vendors_vendor_type_check
  check (vendor_type = any (array[
    'architect'::text, 'designer'::text, 'carpenter'::text,
    'electrician'::text, 'painter'::text, 'tile'::text,
    'false_ceiling'::text, 'plumbing'::text, 'other'::text
  ]));

alter table public.external_portal_users
  drop constraint if exists external_portal_users_user_type_check;
alter table public.external_portal_users
  add constraint external_portal_users_user_type_check
  check (user_type = any (array[
    'architect'::text, 'vendor'::text, 'agent'::text, 'contractor'::text,
    'employee'::text, 'partner'::text
  ]));

create or replace function public.interiors_architect_portal_resolve(p_session_token text)
returns table(portal_user_id uuid, architect_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user record;
begin
  select * into v_user
  from public.external_portal_validate_session(p_session_token)
  limit 1;

  if v_user.portal_user_id is null or v_user.user_type <> 'architect' then
    raise exception 'Architect portal session is not valid';
  end if;

  return query
  select v_user.portal_user_id, a.record_id
  from public.external_portal_access a
  join public.interior_vendors v on v.id = a.record_id
  where a.portal_user_id = v_user.portal_user_id
    and a.source_module = 'interiors'
    and a.access_scope = 'interiors_architect_portal'
    and a.record_type = 'interior_vendors'
    and a.is_active
    and (a.expires_at is null or a.expires_at > now())
    and v.vendor_type = 'architect'
    and v.status = 'active'
  order by a.granted_at desc
  limit 1;
end;
$$;

revoke all on function public.interiors_architect_portal_resolve(text) from public, anon, authenticated;

create or replace function public.interiors_architect_portal_context(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_access record;
  v_result jsonb;
begin
  select * into v_access
  from public.interiors_architect_portal_resolve(p_session_token)
  limit 1;
  if v_access.architect_id is null then
    raise exception 'No active architect profile is linked to this account';
  end if;

  select jsonb_build_object(
    'profile', jsonb_build_object(
      'id', v.id,
      'name', v.vendor_name,
      'email', v.email,
      'phone', v.phone,
      'type', v.vendor_type
    ),
    'projects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'shared_project_id', p.shared_project_id,
        'project_code', p.project_code,
        'project_name', coalesce(p.project_title, p.project_name),
        'client_name', coalesce(c.client_name, p.client_name),
        'site_address', p.site_address,
        'status', p.status,
        'priority', p.priority,
        'start_date', p.start_date,
        'target_end_date', p.target_end_date,
        'summary', p.summary,
        'progress_percent', coalesce((
          select su.progress_percent
          from public.interior_site_updates su
          where su.project_id = p.shared_project_id
          order by su.update_date desc, su.created_at desc
          limit 1
        ), 0),
        'design_count', (select count(*) from public.interior_designs d where d.project_id = p.shared_project_id),
        'pending_approvals', (select count(*) from public.interior_client_approvals ca where ca.interior_project_id = p.id and ca.decision = 'pending')
      ) order by p.updated_at desc nulls last, p.created_at desc)
      from public.interior_projects p
      left join public.interior_clients c on c.id = p.interior_client_id
      where coalesce(p.is_active, true)
        and exists (
          select 1 from public.interior_project_team t
          where t.project_id = p.shared_project_id
            and t.vendor_id = v_access.architect_id
            and t.team_role in ('architect', 'designer')
            and t.status = 'active'
        )
    ), '[]'::jsonb)
  ) into v_result
  from public.interior_vendors v
  where v.id = v_access.architect_id;

  return coalesce(v_result, '{}'::jsonb);
end;
$$;

revoke all on function public.interiors_architect_portal_context(text) from public;
grant execute on function public.interiors_architect_portal_context(text) to anon, authenticated;

create or replace function public.interiors_architect_portal_project(p_session_token text, p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_access record;
  v_project public.interior_projects%rowtype;
  v_result jsonb;
begin
  select * into v_access
  from public.interiors_architect_portal_resolve(p_session_token)
  limit 1;
  if v_access.architect_id is null then raise exception 'Architect access is not active'; end if;

  select p.* into v_project
  from public.interior_projects p
  where p.id = p_project_id
    and exists (
      select 1 from public.interior_project_team t
      where t.project_id = p.shared_project_id
        and t.vendor_id = v_access.architect_id
        and t.team_role in ('architect', 'designer')
        and t.status = 'active'
    );
  if v_project.id is null then raise exception 'Project is not assigned to this architect'; end if;

  select jsonb_build_object(
    'project', to_jsonb(v_project) - 'budget',
    'designs', coalesce((select jsonb_agg(
      (to_jsonb(d) || jsonb_build_object('comments', coalesce((
        select jsonb_agg(to_jsonb(dc) order by dc.created_at desc)
        from public.interior_design_comments dc where dc.design_id = d.id
      ), '[]'::jsonb))) order by d.version_no desc
    ) from public.interior_designs d where d.project_id = v_project.shared_project_id), '[]'::jsonb),
    'design_packages', coalesce((select jsonb_agg(to_jsonb(dp) order by dp.updated_at desc) from public.interior_design_packages dp where dp.project_id = v_project.shared_project_id), '[]'::jsonb),
    'spaces', coalesce((select jsonb_agg(to_jsonb(s) order by s.space_order, s.space_name) from public.interior_spaces s where s.project_id = v_project.shared_project_id), '[]'::jsonb),
    'finish_schedules', coalesce((select jsonb_agg(to_jsonb(fs) order by fs.updated_at desc) from public.interior_finish_schedules fs where fs.project_id = v_project.shared_project_id), '[]'::jsonb),
    'material_specs', coalesce((select jsonb_agg(to_jsonb(ms) order by ms.updated_at desc) from public.interior_material_specs ms where ms.project_id = v_project.shared_project_id), '[]'::jsonb),
    'site_updates', coalesce((select jsonb_agg(to_jsonb(su) order by su.update_date desc, su.created_at desc) from public.interior_site_updates su where su.project_id = v_project.shared_project_id), '[]'::jsonb),
    'approvals', coalesce((select jsonb_agg(to_jsonb(ca) order by ca.created_at desc) from public.interior_client_approvals ca where ca.interior_project_id = v_project.id), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.interiors_architect_portal_project(text, uuid) from public;
grant execute on function public.interiors_architect_portal_project(text, uuid) to anon, authenticated;

create or replace function public.interiors_architect_portal_submit_design(
  p_session_token text,
  p_project_id uuid,
  p_design_title text,
  p_description text default null,
  p_file_url text default null
)
returns table(design_id uuid, version_no integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_access record;
  v_project public.interior_projects%rowtype;
  v_version integer;
  v_design_id uuid;
begin
  select * into v_access from public.interiors_architect_portal_resolve(p_session_token) limit 1;
  select p.* into v_project
  from public.interior_projects p
  where p.id = p_project_id
    and exists (
      select 1 from public.interior_project_team t
      where t.project_id = p.shared_project_id
        and t.vendor_id = v_access.architect_id
        and t.team_role in ('architect', 'designer')
        and t.status = 'active'
    );
  if v_project.id is null then raise exception 'Project is not assigned to this architect'; end if;
  if nullif(trim(p_design_title), '') is null then raise exception 'Design title is required'; end if;

  perform pg_advisory_xact_lock(hashtext(v_project.shared_project_id::text));
  select coalesce(max(d.version_no), 0) + 1 into v_version
  from public.interior_designs d where d.project_id = v_project.shared_project_id;

  insert into public.interior_designs (
    project_id, version_no, design_title, description, file_url, status
  ) values (
    v_project.shared_project_id, v_version, trim(p_design_title), nullif(trim(p_description), ''), nullif(trim(p_file_url), ''), 'submitted'
  ) returning id into v_design_id;

  perform public.log_external_portal_audit_event(
    v_access.portal_user_id,
    'interiors_architect_design_submitted',
    jsonb_build_object('project_id', v_project.id, 'design_id', v_design_id, 'version_no', v_version)
  );
  return query select v_design_id, v_version;
end;
$$;

revoke all on function public.interiors_architect_portal_submit_design(text, uuid, text, text, text) from public;
grant execute on function public.interiors_architect_portal_submit_design(text, uuid, text, text, text) to anon, authenticated;
