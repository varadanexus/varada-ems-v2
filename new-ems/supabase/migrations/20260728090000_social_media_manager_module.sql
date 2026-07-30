begin;

with seed_permissions(module_code, action_code, label) as (
  values
    ('social-media-manager', 'view', 'Nexus Social View'),
    ('social-media-manager', 'create', 'Nexus Social Create Content'),
    ('social-media-manager', 'edit', 'Nexus Social Edit Content'),
    ('social-media-manager', 'approve', 'Nexus Social Approve Content'),
    ('social-media-manager', 'post', 'Nexus Social Publish Content'),
    ('social-media-manager', 'export', 'Nexus Social Export Analytics'),
    ('social-media-manager', 'view_audit', 'Nexus Social View Audit')
)
insert into public.permissions (module_code, action_code, label, is_active)
select sp.module_code, sp.action_code, sp.label, true
from seed_permissions sp
where not exists (
  select 1
  from public.permissions p
  where p.module_code = sp.module_code
    and p.action_code = sp.action_code
);

with role_grants(role_code, action_code) as (
  values
    ('chairman_managing_director', 'view'),
    ('chairman_managing_director', 'create'),
    ('chairman_managing_director', 'edit'),
    ('chairman_managing_director', 'approve'),
    ('chairman_managing_director', 'post'),
    ('chairman_managing_director', 'export'),
    ('chairman_managing_director', 'view_audit'),
    ('super_admin', 'view'),
    ('super_admin', 'create'),
    ('super_admin', 'edit'),
    ('super_admin', 'approve'),
    ('super_admin', 'post'),
    ('super_admin', 'export'),
    ('super_admin', 'view_audit'),
    ('admin', 'view'),
    ('admin', 'create'),
    ('admin', 'edit'),
    ('admin', 'approve'),
    ('admin', 'post'),
    ('admin', 'export'),
    ('admin', 'view_audit'),
    ('manager', 'view'),
    ('manager', 'create'),
    ('manager', 'edit'),
    ('manager', 'approve'),
    ('manager', 'export'),
    ('operator', 'view'),
    ('operator', 'create'),
    ('operator', 'edit')
)
insert into public.role_permissions (role_id, permission_id, allow)
select r.id, p.id, true
from role_grants rg
join public.roles r on r.code = rg.role_code
join public.permissions p
  on p.module_code = 'social-media-manager'
 and p.action_code = rg.action_code
where not exists (
  select 1
  from public.role_permissions rp
  where rp.role_id = r.id
    and rp.permission_id = p.id
);

commit;
