-- Sprint 10B.4A: Permit shared Project Engine backbone creation for Interiors project onboarding.
-- Scope is limited to interior_project inserts only; existing Project Engine behavior remains unchanged.

drop policy if exists projects_insert_hardened on public.projects;

create policy projects_insert_hardened on public.projects
for insert to authenticated
with check (
  public.can_administer_project_engine()
  or (
    public.has_permission('project-engine-projects', 'create')
    and public.has_division_access_by_id(division_id)
    and public.has_role_code('manager')
  )
  or (
    public.has_permission('interiors-projects', 'create')
    and public.has_division_access_by_id(division_id)
    and exists (
      select 1
      from public.project_types pt
      where pt.id = projects.project_type_id
        and pt.code = 'interior_project'
    )
  )
);