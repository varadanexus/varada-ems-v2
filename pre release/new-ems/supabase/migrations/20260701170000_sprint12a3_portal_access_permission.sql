-- Sprint 12A.3 follow-up: register the portal-access module's own permission entry.
--
-- Every routable module in this codebase declares its own module_code for RBAC, even when
-- it shares underlying data/RPCs with another module (e.g. interiors-client-portal and
-- interiors-client-app are separate permission entries over the same tables). Portal Access
-- follows that same convention: it calls the exact same RPCs as Portal Management (zero
-- backend duplication) but is a distinct route, so it needs its own 'portal-access'
-- permission rather than silently failing bootstrapProtectedPage's view check (which looks
-- up permissions by the route's own module_code) or incorrectly reusing 'portal-management'
-- permission rows for a different route.

with seed_permissions(module_code, action_code, label) as (
  values
    ('portal-access', 'view', 'Portal Access View'),
    ('portal-access', 'create', 'Portal Access Create'),
    ('portal-access', 'edit', 'Portal Access Edit'),
    ('portal-access', 'delete', 'Portal Access Delete'),
    ('portal-access', 'approve', 'Portal Access Approve'),
    ('portal-access', 'export', 'Portal Access Export')
)
insert into public.permissions (module_code, action_code, label, is_active)
select sp.module_code, sp.action_code, sp.label, true
from seed_permissions sp
where not exists (select 1 from public.permissions p where p.module_code = sp.module_code and p.action_code = sp.action_code);
with seed_role_permissions(role_code, module_code, action_code) as (
  values
    ('super_admin', 'portal-access', 'view'), ('super_admin', 'portal-access', 'create'), ('super_admin', 'portal-access', 'edit'), ('super_admin', 'portal-access', 'delete'), ('super_admin', 'portal-access', 'approve'), ('super_admin', 'portal-access', 'export'),
    ('admin', 'portal-access', 'view'), ('admin', 'portal-access', 'create'), ('admin', 'portal-access', 'edit'), ('admin', 'portal-access', 'delete'), ('admin', 'portal-access', 'approve'), ('admin', 'portal-access', 'export'),
    ('manager', 'portal-access', 'view'), ('manager', 'portal-access', 'create'), ('manager', 'portal-access', 'edit'),
    ('accounts_manager', 'portal-access', 'view'),
    ('auditor', 'portal-access', 'view')
)
insert into public.role_permissions (role_id, permission_id, allow)
select r.id, p.id, true
from seed_role_permissions srp
join public.roles r on r.code = srp.role_code
join public.permissions p on p.module_code = srp.module_code and p.action_code = srp.action_code
where not exists (select 1 from public.role_permissions rp where rp.role_id = r.id and rp.permission_id = p.id);
