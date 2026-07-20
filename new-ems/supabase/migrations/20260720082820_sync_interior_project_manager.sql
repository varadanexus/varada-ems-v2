create or replace function internal.refresh_interior_project_manager(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public, internal, pg_temp
as $$
begin
  update public.projects p
  set project_manager_app_user_id = (
        select t.app_user_id
        from public.interior_project_team t
        where t.project_id = p_project_id
          and t.team_role = 'project_manager'
          and t.status = 'active'
          and t.app_user_id is not null
        order by t.assigned_at desc, t.created_at desc, t.id desc
        limit 1
      ),
      updated_by = coalesce(public.current_app_user_id(), p.updated_by),
      updated_at = now()
  where p.id = p_project_id;
end;
$$;

revoke all on function internal.refresh_interior_project_manager(uuid) from public, anon, authenticated;

create or replace function internal.sync_interior_project_manager_from_team()
returns trigger
language plpgsql
security definer
set search_path = public, internal, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform internal.refresh_interior_project_manager(old.project_id);
    return old;
  end if;

  perform internal.refresh_interior_project_manager(new.project_id);
  if tg_op = 'UPDATE' and old.project_id is distinct from new.project_id then
    perform internal.refresh_interior_project_manager(old.project_id);
  end if;
  return new;
end;
$$;

revoke all on function internal.sync_interior_project_manager_from_team() from public, anon, authenticated;

drop trigger if exists trg_sync_interior_project_manager_from_team on public.interior_project_team;
create trigger trg_sync_interior_project_manager_from_team
after insert or update or delete on public.interior_project_team
for each row execute function internal.sync_interior_project_manager_from_team();

update public.projects p
set project_manager_app_user_id = (
      select t.app_user_id
      from public.interior_project_team t
      where t.project_id = p.id
        and t.team_role = 'project_manager'
        and t.status = 'active'
        and t.app_user_id is not null
      order by t.assigned_at desc, t.created_at desc, t.id desc
      limit 1
    ),
    updated_at = now()
where exists (
  select 1
  from public.interior_projects ip
  where ip.shared_project_id = p.id
);

create or replace function public.update_interior_project(
  p_interior_project_id uuid,
  p_interior_client_id uuid,
  p_project_name text,
  p_project_title text,
  p_site_address text,
  p_status text,
  p_priority text,
  p_start_date date,
  p_target_end_date date,
  p_summary text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_project public.interior_projects%rowtype;
  v_caller_app_user_id uuid;
begin
  select * into v_project
  from public.interior_projects
  where id = p_interior_project_id;

  if not found then
    raise exception 'Interior project not found' using errcode = 'P0002';
  end if;

  if not public.has_permission('interiors-projects', 'edit')
     or not public.can_edit_project_by_id(v_project.shared_project_id) then
    raise exception 'Permission denied: interiors-projects:edit required' using errcode = '42501';
  end if;

  if nullif(btrim(p_project_name), '') is null then
    raise exception 'Project name is required' using errcode = '22023';
  end if;
  if p_status not in ('draft', 'active', 'on_hold', 'completed', 'cancelled', 'archived') then
    raise exception 'Invalid project status' using errcode = '22023';
  end if;
  if p_priority not in ('low', 'medium', 'high', 'critical') then
    raise exception 'Invalid project priority' using errcode = '22023';
  end if;
  if p_start_date is not null and p_target_end_date is not null and p_target_end_date < p_start_date then
    raise exception 'Target end date cannot be before start date' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.interior_clients ic
    where ic.id = p_interior_client_id
      and ic.division_id = v_project.division_id
  ) then
    raise exception 'Interior client is not available in this project division' using errcode = '22023';
  end if;

  v_caller_app_user_id := public.current_app_user_id();

  update public.projects
  set project_name = btrim(p_project_name),
      project_title = nullif(btrim(p_project_title), ''),
      status = p_status,
      priority = p_priority,
      start_date = p_start_date,
      target_end_date = p_target_end_date,
      summary = nullif(btrim(p_summary), ''),
      updated_by = v_caller_app_user_id,
      updated_at = now()
  where id = v_project.shared_project_id;

  update public.interior_projects
  set interior_client_id = p_interior_client_id,
      project_name = btrim(p_project_name),
      project_title = nullif(btrim(p_project_title), ''),
      site_address = nullif(btrim(p_site_address), ''),
      status = p_status,
      priority = p_priority,
      start_date = p_start_date,
      target_end_date = p_target_end_date,
      summary = nullif(btrim(p_summary), ''),
      is_active = p_status not in ('cancelled', 'archived'),
      updated_by = v_caller_app_user_id,
      updated_at = now()
  where id = p_interior_project_id;

  return jsonb_build_object(
    'interior_project_id', p_interior_project_id,
    'shared_project_id', v_project.shared_project_id,
    'project_code', v_project.project_code
  );
end;
$$;

revoke all on function public.update_interior_project(uuid, uuid, text, text, text, text, text, date, date, text) from public, anon;
grant execute on function public.update_interior_project(uuid, uuid, text, text, text, text, text, date, date, text) to authenticated;
