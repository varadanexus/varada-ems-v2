-- Sprint 10B.4B: Interiors project creation RPC
-- Root cause: projects_insert_hardened WITH CHECK fails for authenticated role
-- because security definer functions called from RLS policy context behave
-- differently than when called directly (auth.uid() context differs).
-- Fix: use a security definer RPC that validates permissions explicitly,
-- then inserts into projects and interior_projects bypassing RLS.
-- This is the standard Supabase pattern for cross-table inserts needing RLS bypass.

create or replace function public.create_interior_project(
  p_division_id uuid,
  p_interior_client_id uuid,
  p_project_type_id uuid,
  p_project_code text,
  p_project_name text,
  p_project_title text default null,
  p_status text default 'draft',
  p_priority text default 'medium',
  p_start_date date default null,
  p_target_end_date date default null,
  p_summary text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shared_project_id uuid;
  v_interior_project_id uuid;
  v_caller_app_user_id uuid;
begin
  -- Validate caller has interiors-projects:create permission
  if not public.has_permission('interiors-projects', 'create') then
    raise exception 'Permission denied: interiors-projects:create required'
      using errcode = '42501';
  end if;

  -- Validate caller has division access
  if not public.has_division_access_by_id(p_division_id) then
    raise exception 'Permission denied: no access to division %', p_division_id
      using errcode = '42501';
  end if;

  -- Validate interior client belongs to same division
  if p_interior_client_id is not null then
    if not exists (
      select 1 from public.interior_clients ic
      where ic.id = p_interior_client_id
        and ic.division_id = p_division_id
    ) then
      raise exception 'Interior client % not found in division %', p_interior_client_id, p_division_id
        using errcode = '22023';
    end if;
  end if;

  -- Get caller app user id
  v_caller_app_user_id := public.current_app_user_id();

  -- Insert shared backbone project (bypasses RLS as security definer)
  insert into public.projects (
    division_id,
    project_type_id,
    project_code,
    project_name,
    project_title,
    status,
    priority,
    project_structure_mode,
    start_date,
    target_end_date,
    summary,
    created_by,
    updated_by,
    owner_app_user_id,
    project_manager_app_user_id
  ) values (
    p_division_id,
    p_project_type_id,
    p_project_code,
    p_project_name,
    p_project_title,
    p_status,
    p_priority,
    'standard',
    p_start_date,
    p_target_end_date,
    p_summary,
    v_caller_app_user_id,
    v_caller_app_user_id,
    v_caller_app_user_id,
    v_caller_app_user_id
  )
  returning id into v_shared_project_id;

  -- Insert interior project record (bypasses RLS as security definer)
  insert into public.interior_projects (
    division_id,
    interior_client_id,
    shared_project_id,
    project_code,
    project_name,
    project_title,
    start_date,
    target_end_date,
    status,
    priority,
    summary,
    is_active,
    created_by,
    updated_by
  ) values (
    p_division_id,
    p_interior_client_id,
    v_shared_project_id,
    p_project_code,
    p_project_name,
    p_project_title,
    p_start_date,
    p_target_end_date,
    p_status,
    p_priority,
    p_summary,
    not (p_status = any(array['archived','cancelled'])),
    v_caller_app_user_id,
    v_caller_app_user_id
  )
  returning id into v_interior_project_id;

  return jsonb_build_object(
    'interior_project_id', v_interior_project_id,
    'shared_project_id', v_shared_project_id,
    'project_code', p_project_code
  );
end;
$$;

grant execute on function public.create_interior_project(
  uuid, uuid, uuid, text, text, text, text, text, date, date, text
) to authenticated;

comment on function public.create_interior_project is
  'Creates an interior project with a linked shared backbone project. '
  'Security definer to bypass projects RLS for authenticated Interiors users. '
  'Validates interiors-projects:create permission and division access explicitly.';
