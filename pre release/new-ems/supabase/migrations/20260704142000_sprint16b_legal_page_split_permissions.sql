-- Sprint 16B: split Legal into dedicated workflow pages.

insert into public.permissions(module_code, action_code, label, is_active)
values
  ('legal-drafting', 'view', 'Legal - Drafting', true),
  ('legal-drafting', 'create', 'Legal - Create Draft', true),
  ('legal-drafting', 'edit', 'Legal - Edit Draft', true),
  ('legal-drafting', 'export', 'Legal - Export Draft', true),
  ('legal-send', 'view', 'Legal - Send To User', true),
  ('legal-send', 'create', 'Legal - Create Signing Request', true),
  ('legal-send', 'approve', 'Legal - Approve Send', true),
  ('legal-agreements', 'view', 'Legal - View Agreements', true),
  ('legal-agreements', 'export', 'Legal - Export Agreements', true),
  ('legal-archive', 'view', 'Legal - Archive', true),
  ('legal-archive', 'export', 'Legal - Export Archive', true),
  ('legal-audit', 'view', 'Legal - Audit Trail', true),
  ('legal-audit', 'view_audit', 'Legal - View Legal Audit', true)
on conflict (module_code, action_code) do update
set label = excluded.label,
    is_active = true;

with seed_role_permissions(role_code, module_code, action_code) as (
  values
    ('super_admin', 'legal-drafting', 'view'),
    ('super_admin', 'legal-drafting', 'create'),
    ('super_admin', 'legal-drafting', 'edit'),
    ('super_admin', 'legal-drafting', 'export'),
    ('super_admin', 'legal-send', 'view'),
    ('super_admin', 'legal-send', 'create'),
    ('super_admin', 'legal-send', 'approve'),
    ('super_admin', 'legal-agreements', 'view'),
    ('super_admin', 'legal-agreements', 'export'),
    ('super_admin', 'legal-archive', 'view'),
    ('super_admin', 'legal-archive', 'export'),
    ('super_admin', 'legal-audit', 'view'),
    ('super_admin', 'legal-audit', 'view_audit'),
    ('admin', 'legal-drafting', 'view'),
    ('admin', 'legal-drafting', 'create'),
    ('admin', 'legal-drafting', 'edit'),
    ('admin', 'legal-drafting', 'export'),
    ('admin', 'legal-send', 'view'),
    ('admin', 'legal-send', 'create'),
    ('admin', 'legal-send', 'approve'),
    ('admin', 'legal-agreements', 'view'),
    ('admin', 'legal-agreements', 'export'),
    ('admin', 'legal-archive', 'view'),
    ('admin', 'legal-archive', 'export'),
    ('admin', 'legal-audit', 'view'),
    ('admin', 'legal-audit', 'view_audit'),
    ('advocate', 'legal-drafting', 'view'),
    ('advocate', 'legal-drafting', 'create'),
    ('advocate', 'legal-drafting', 'edit'),
    ('advocate', 'legal-drafting', 'export'),
    ('advocate', 'legal-send', 'view'),
    ('advocate', 'legal-send', 'create'),
    ('advocate', 'legal-send', 'approve'),
    ('advocate', 'legal-agreements', 'view'),
    ('advocate', 'legal-agreements', 'export'),
    ('advocate', 'legal-archive', 'view'),
    ('advocate', 'legal-archive', 'export'),
    ('advocate', 'legal-audit', 'view'),
    ('advocate', 'legal-audit', 'view_audit')
)
insert into public.role_permissions(role_id, permission_id, allow)
select r.id, p.id, true
from seed_role_permissions s
join public.roles r on r.code = s.role_code
join public.permissions p on p.module_code = s.module_code and p.action_code = s.action_code
on conflict (role_id, permission_id) do update
set allow = true;

notify pgrst, 'reload schema';
