-- Sprint 16D: Legal provider settings page permission.

insert into public.permissions(module_code, action_code, label, is_active)
values
  ('legal-settings', 'view', 'Legal - Provider Settings', true),
  ('legal-settings', 'edit', 'Legal - Update Provider Settings', true),
  ('legal-settings', 'view_audit', 'Legal - View Provider Configuration Audit', true)
on conflict (module_code, action_code) do update
set label = excluded.label,
    is_active = true;

with seed_role_permissions(role_code, module_code, action_code) as (
  values
    ('super_admin', 'legal-settings', 'view'),
    ('super_admin', 'legal-settings', 'edit'),
    ('super_admin', 'legal-settings', 'view_audit'),
    ('admin', 'legal-settings', 'view'),
    ('admin', 'legal-settings', 'edit'),
    ('admin', 'legal-settings', 'view_audit'),
    ('advocate', 'legal-settings', 'view'),
    ('advocate', 'legal-settings', 'edit'),
    ('advocate', 'legal-settings', 'view_audit')
)
insert into public.role_permissions(role_id, permission_id, allow)
select r.id, p.id, true
from seed_role_permissions s
join public.roles r on r.code = s.role_code
join public.permissions p on p.module_code = s.module_code and p.action_code = s.action_code
on conflict (role_id, permission_id) do update
set allow = true;

notify pgrst, 'reload schema';
