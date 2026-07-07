-- Sprint 13F.10: grant Dashboard (Home / Control Center) view to every role.
--
-- The Dashboard 'view' permission is the gate for entering the internal EMS
-- workspace at login. Granting it to all existing roles ensures every provisioned
-- user can sign in and reach the dashboard; finer module access is still governed
-- per role on the Roles & Permissions page.
--
-- Idempotent via UNIQUE (role_id, permission_id); flips any existing deny to allow.

insert into public.role_permissions (role_id, permission_id, allow)
select r.id, p.id, true
from public.roles r
cross join public.permissions p
where p.module_code = 'dashboard' and p.action_code = 'view'
on conflict (role_id, permission_id) do update set allow = true;
