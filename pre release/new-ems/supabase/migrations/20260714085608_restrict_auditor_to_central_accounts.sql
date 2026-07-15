-- Keep the Auditor role strictly inside the Accounts division and make its
-- Central Accounts access read-only. This replaces historical grants that
-- unintentionally exposed Interiors and administration modules.

insert into public.permissions (module_code, action_code, label, is_active)
values
  ('central-accounts-reporting', 'view', 'Central Accounts Reporting View', true),
  ('central-accounts-reporting', 'export', 'Central Accounts Reporting Export', true)
on conflict (module_code, action_code) do update
set label = excluded.label,
    is_active = true;

delete from public.role_permissions rp
using public.roles r
where rp.role_id = r.id
  and lower(r.code) = 'auditor';

insert into public.role_permissions (role_id, permission_id, allow)
select r.id, p.id, true
from public.roles r
join public.permissions p
  on p.is_active = true
 and (
      (p.module_code = 'dashboard' and p.action_code = 'view')
      or (p.module_code = 'accounts' and p.action_code = 'view')
      or (
        p.module_code like 'central-accounts-%'
        and p.action_code in ('view', 'export')
      )
 )
where lower(r.code) = 'auditor'
on conflict (role_id, permission_id) do update
set allow = true;

-- Auditor is an Accounts role. Remove stale division memberships and ensure
-- every Auditor user has the Accounts division assigned.
delete from public.user_divisions ud
using public.user_roles ur, public.roles r, public.divisions d
where ud.user_id = ur.user_id
  and ur.role_id = r.id
  and ud.division_id = d.id
  and lower(r.code) = 'auditor'
  and lower(d.code) <> 'accounts';

insert into public.user_divisions (user_id, division_id, scope)
select distinct ur.user_id, d.id, 'assigned'
from public.user_roles ur
join public.roles r on r.id = ur.role_id
cross join public.divisions d
where lower(r.code) = 'auditor'
  and lower(d.code) = 'accounts'
on conflict (user_id, division_id) do update
set scope = 'assigned';
