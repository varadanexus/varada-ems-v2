-- Sprint 10C.9 hotfix: client-portal users could not act on staff-created approval requests.
--
-- Root cause: interior_client_approvals_update_client_portal (20260628090000) requires
-- portal_user_id IN (the acting client's own portal_user_id) in its USING clause. Staff-created
-- approval rows (the normal "staff raises a request, client decides" workflow) are inserted with
-- portal_user_id = NULL, which never satisfies that IN predicate, so the policy silently excludes
-- every staff-created row from the client's UPDATE — confirmed live: approve-tier client UPDATE on
-- a staff-created pending row affects 0 rows, no error surfaced.
--
-- Fix: drop the portal_user_id ownership requirement from the UPDATE policy entirely. Gating moves
-- to project access + access_level = 'approve' (already enforced by the untouched
-- can_client_portal_user_act_on_project()) plus a decision-state guard (only pending/null rows are
-- actionable, so a client can't re-decide an already-decided approval). The BEFORE trigger from
-- 20260628100000 is preserved as-is except for one line: NEW.portal_user_id is now
-- coalesce(OLD.portal_user_id, current_interior_client_portal_user_id()) instead of always
-- OLD.portal_user_id, so acting on a staff-created (NULL) row correctly stamps the acting client.
-- Client-created rows keep their original portal_user_id unchanged (coalesce is a no-op when
-- OLD.portal_user_id is already set). All other column locks, the staff bypass branch, audit
-- logging, and the INSERT policy/path are untouched.

-- 1) Replace the UPDATE policy: remove portal_user_id ownership, add decision-state guard.
drop policy if exists interior_client_approvals_update_client_portal on public.interior_client_approvals;
create policy interior_client_approvals_update_client_portal on public.interior_client_approvals
for update to authenticated
using (
  public.can_client_portal_user_act_on_project(interior_project_id)
  and (decision is null or decision = 'pending')
)
with check (
  public.can_client_portal_user_act_on_project(interior_project_id)
);

-- 2) Re-create the column-lock trigger function with the single portal_user_id assignment change.
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
    new.created_at := old.created_at;

    -- Staff-created rows have portal_user_id = NULL; stamp the acting client onto them. A row a
    -- client already owns keeps its original portal_user_id (coalesce is a no-op in that case).
    new.portal_user_id := coalesce(old.portal_user_id, public.current_interior_client_portal_user_id());

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
      jsonb_build_object('decision', old.decision, 'remarks', old.remarks, 'portal_user_id', old.portal_user_id),
      jsonb_build_object('decision', new.decision, 'remarks', new.remarks, 'portal_user_id', new.portal_user_id)
    );

    return new;
  end if;

  return new;
end;
$$;

-- Trigger definition itself is unchanged (same name, same timing/events); CREATE OR REPLACE above
-- is sufficient, no DROP/CREATE TRIGGER needed since the function signature is identical.
