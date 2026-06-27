-- Fix: client-portal-user path had no INSERT/UPDATE policy on interior_client_approvals.
-- The existing insert/update policies only check public.has_permission('interiors-client-portal', ...),
-- which is the internal staff RBAC table and is never satisfied by an external client-portal user's
-- session (their auth_user_id has no row in user_roles). The client-portal SELECT policy added in
-- 20260623150000 was never paired with an INSERT/UPDATE policy, so real clients cannot submit
-- approvals/rejections/revision requests through the portal.

create or replace function public.can_client_portal_user_act_on_project(p_interior_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.interior_client_project_access icpa
    join public.interior_client_portal_users icpu on icpu.id = icpa.portal_user_id
    where icpa.interior_project_id = p_interior_project_id
      and icpa.is_active = true
      and icpa.access_level = 'approve'
      and icpu.auth_user_id = auth.uid()
      and icpu.access_status in ('invited', 'active')
  );
$$;

grant execute on function public.can_client_portal_user_act_on_project(uuid) to authenticated;

drop policy if exists interior_client_approvals_insert_client_portal on public.interior_client_approvals;
create policy interior_client_approvals_insert_client_portal on public.interior_client_approvals
for insert to authenticated
with check (
  public.can_client_portal_user_act_on_project(interior_project_id)
  and portal_user_id in (
    select icpu.id
    from public.interior_client_portal_users icpu
    where icpu.auth_user_id = auth.uid()
      and icpu.access_status in ('invited', 'active')
  )
);

drop policy if exists interior_client_approvals_update_client_portal on public.interior_client_approvals;
create policy interior_client_approvals_update_client_portal on public.interior_client_approvals
for update to authenticated
using (
  public.can_client_portal_user_act_on_project(interior_project_id)
  and portal_user_id in (
    select icpu.id
    from public.interior_client_portal_users icpu
    where icpu.auth_user_id = auth.uid()
      and icpu.access_status in ('invited', 'active')
  )
)
with check (
  public.can_client_portal_user_act_on_project(interior_project_id)
  and portal_user_id in (
    select icpu.id
    from public.interior_client_portal_users icpu
    where icpu.auth_user_id = auth.uid()
      and icpu.access_status in ('invited', 'active')
  )
);
