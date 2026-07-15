-- Bring pre-gate design records into the controlled workflow without losing data.

with latest_approved as (
  select distinct on (d.project_id) d.id
  from public.interior_designs d
  where d.status = 'approved'
  order by d.project_id, d.version_no desc, d.updated_at desc
)
update public.interior_designs d
set is_client_visible = true,
    published_at = coalesce(d.published_at, d.staff_reviewed_at, d.updated_at, d.uploaded_at),
    staff_reviewed_at = coalesce(d.staff_reviewed_at, d.updated_at, d.uploaded_at),
    client_decision = coalesce(d.client_decision, 'pending')
from latest_approved la
where d.id = la.id;

insert into public.interior_client_approvals(
  interior_project_id, approval_type, reference_table, reference_id, decision
)
select ip.id, 'design', 'interior_designs', d.id, 'pending'
from public.interior_designs d
join public.interior_projects ip on ip.shared_project_id = d.project_id
where d.is_client_visible = true
  and d.client_decision = 'pending'
  and not exists (
    select 1 from public.interior_client_approvals ca
    where ca.reference_table = 'interior_designs' and ca.reference_id = d.id
      and ca.decision = 'pending'
  )
on conflict (reference_id) where reference_table = 'interior_designs' and decision = 'pending'
do nothing;

update public.interior_projects ip
set workflow_stage = case
      when exists (select 1 from public.interior_designs d where d.project_id=ip.shared_project_id and d.is_client_visible and d.client_decision='pending') then 'client_review'
      else 'design'
    end,
    design_gate_status = case
      when exists (select 1 from public.interior_designs d where d.project_id=ip.shared_project_id and d.is_client_visible and d.client_decision='pending') then 'client_review'
      when exists (select 1 from public.interior_designs d where d.project_id=ip.shared_project_id and d.status='submitted') then 'staff_review'
      when exists (select 1 from public.interior_designs d where d.project_id=ip.shared_project_id and d.status in ('revision_requested','rejected')) then 'revision_required'
      when exists (select 1 from public.interior_designs d where d.project_id=ip.shared_project_id and d.status='draft') then 'drafting'
      else 'not_started'
    end,
    design_gate_completed_at = null
where exists (select 1 from public.interior_designs d where d.project_id=ip.shared_project_id);
