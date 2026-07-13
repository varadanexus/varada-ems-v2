-- Sprint 10C.9 follow-up: harden client-portal writes to interior_client_approvals.
--
-- 20260628090000 added INSERT/UPDATE RLS policies so a real client-portal user (auth path via
-- interior_client_portal_users, not the internal app_users/user_roles RBAC path) can write rows at
-- all. That migration is preserved as-is. Two gaps remain:
--
--   1. The INSERT policy requires access_level = 'approve', which blocks a view_only client from
--      raising a revision request / comment (the UI's submitRevisionRequest has no access_level
--      gate, only the approve/reject/request-revision buttons on existing rows are gated by
--      access_level = 'approve' via canApproveProject() in page-interiors-client-app.js). Comments
--      and net-new revision requests should be available to any active client, not approve-tier only.
--   2. Neither policy stops a client from also rewriting internal-only fields in the same
--      INSERT/UPDATE statement (approval_type, reference_table, reference_id, portal_user_id,
--      interior_project_id, created_at, decided_at) since RLS WITH CHECK only re-validates row
--      scope, not column-level intent. A BEFORE trigger is required for that, per Postgres RLS
--      limitations (USING/WITH CHECK cannot diff OLD vs NEW column-by-column).
--
-- This migration only touches interior_client_approvals. Internal EMS staff policies
-- (interior_client_approvals_insert_hardened / _update_hardened from 20260618174000, keyed off
-- public.has_permission('interiors-client-portal', ...)) are untouched and continue to apply in
-- full to staff actors.

-- 1) Row-scope helper for "any active access" (used for comments / new revision requests).
create or replace function public.can_client_portal_user_view_project(p_interior_project_id uuid)
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
      and icpu.auth_user_id = auth.uid()
      and icpu.access_status in ('invited', 'active')
  );
$$;

grant execute on function public.can_client_portal_user_view_project(uuid) to authenticated;

create or replace function public.current_interior_client_portal_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select icpu.id
  from public.interior_client_portal_users icpu
  where icpu.auth_user_id = auth.uid()
    and icpu.access_status in ('invited', 'active')
  limit 1;
$$;

grant execute on function public.current_interior_client_portal_user_id() to authenticated;

create or replace function public.is_interiors_client_portal_staff_actor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin()
    or public.has_permission('interiors-client-portal', 'edit')
    or public.has_permission('interiors-client-portal', 'approve')
    or public.has_permission('interiors-client-portal', 'create');
$$;

grant execute on function public.is_interiors_client_portal_staff_actor() to authenticated;

-- 2) Replace the INSERT policy so raising a comment / revision request only needs active access,
--    not approve-tier access. Decision changes on existing rows remain gated to approve-tier via
--    the unchanged interior_client_approvals_update_client_portal policy (can_client_portal_user_act_on_project).
drop policy if exists interior_client_approvals_insert_client_portal on public.interior_client_approvals;
create policy interior_client_approvals_insert_client_portal on public.interior_client_approvals
for insert to authenticated
with check (
  public.can_client_portal_user_view_project(interior_project_id)
  and portal_user_id = public.current_interior_client_portal_user_id()
);

-- 3) Column-level protection: client-portal actors may only ever set decision/remarks (and the
--    derived decided_at); every other column is forced back to a safe value regardless of payload.
create or replace function public.trg_lock_interior_client_approvals_client_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_app_user_id uuid := public.current_app_user_id();
  v_shared_project_id uuid;
begin
  if public.is_interiors_client_portal_staff_actor() then
    -- Internal staff path: untouched, full column control as before.
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.decision := 'pending';
    new.decided_at := null;
    new.portal_user_id := public.current_interior_client_portal_user_id();
    new.reference_table := null;
    new.reference_id := null;

    select ip.shared_project_id into v_shared_project_id
    from public.interior_projects ip
    where ip.id = new.interior_project_id;

    perform public.log_interiors_audit_event(
      'client_portal_revision_request_created',
      'interiors-client-portal',
      'interior_client_approvals',
      new.id,
      v_shared_project_id,
      '{}'::jsonb,
      jsonb_build_object('approval_type', new.approval_type, 'remarks', new.remarks, 'portal_user_id', new.portal_user_id)
    );

    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- Lock every internal-only field to its existing value; only decision/remarks/decided_at move.
    new.interior_project_id := old.interior_project_id;
    new.approval_type := old.approval_type;
    new.reference_table := old.reference_table;
    new.reference_id := old.reference_id;
    new.portal_user_id := old.portal_user_id;
    new.created_at := old.created_at;

    if new.decision is distinct from old.decision then
      if new.decision not in ('approved', 'rejected', 'revision_requested') then
        raise exception 'Client portal users may only approve, reject, or request revision';
      end if;
      new.decided_at := now();
    else
      new.decided_at := old.decided_at;
    end if;

    select ip.shared_project_id into v_shared_project_id
    from public.interior_projects ip
    where ip.id = new.interior_project_id;

    perform public.log_interiors_audit_event(
      'client_portal_approval_decision',
      'interiors-client-portal',
      'interior_client_approvals',
      new.id,
      v_shared_project_id,
      jsonb_build_object('decision', old.decision, 'remarks', old.remarks),
      jsonb_build_object('decision', new.decision, 'remarks', new.remarks)
    );

    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_lock_interior_client_approvals_client_columns on public.interior_client_approvals;
create trigger trg_lock_interior_client_approvals_client_columns
before insert or update on public.interior_client_approvals
for each row
execute function public.trg_lock_interior_client_approvals_client_columns();
