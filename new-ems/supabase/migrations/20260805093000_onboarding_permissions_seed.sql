-- Centralised Onboarding — permissions + role grants.
-- Seeds the module permission rows and grants them to leadership/admin/manager
-- roles. Idempotent via the unique (module_code, action_code) constraint.

begin;

insert into public.permissions (module_code, action_code, label, is_active)
values
  ('centralised-onboarding', 'view',       'Centralised Onboarding — View',            true),
  ('centralised-onboarding', 'create',     'Centralised Onboarding — Send Onboarding',  true),
  ('centralised-onboarding', 'edit',       'Centralised Onboarding — Manage Records',   true),
  ('centralised-onboarding', 'approve',    'Centralised Onboarding — Approve Submissions', true),
  ('centralised-onboarding', 'export',     'Centralised Onboarding — Export',           true),
  ('centralised-onboarding', 'view_audit', 'Centralised Onboarding — View Audit',       true)
on conflict (module_code, action_code) do update
set label = excluded.label, is_active = true;

with role_grants(role_code, action_code) as (
  values
    ('chairman_managing_director', 'view'),
    ('chairman_managing_director', 'create'),
    ('chairman_managing_director', 'edit'),
    ('chairman_managing_director', 'approve'),
    ('chairman_managing_director', 'export'),
    ('chairman_managing_director', 'view_audit'),
    ('super_admin', 'view'),
    ('super_admin', 'create'),
    ('super_admin', 'edit'),
    ('super_admin', 'approve'),
    ('super_admin', 'export'),
    ('super_admin', 'view_audit'),
    ('admin', 'view'),
    ('admin', 'create'),
    ('admin', 'edit'),
    ('admin', 'approve'),
    ('admin', 'export'),
    ('admin', 'view_audit'),
    ('manager', 'view'),
    ('manager', 'create'),
    ('manager', 'edit'),
    ('manager', 'approve'),
    ('manager', 'export'),
    ('operator', 'view'),
    ('operator', 'create')
)
insert into public.role_permissions (role_id, permission_id, allow)
select r.id, p.id, true
from role_grants rg
join public.roles r on r.code = rg.role_code
join public.permissions p
  on p.module_code = 'centralised-onboarding'
 and p.action_code = rg.action_code
where not exists (
  select 1 from public.role_permissions rp
  where rp.role_id = r.id and rp.permission_id = p.id
);

commit;
