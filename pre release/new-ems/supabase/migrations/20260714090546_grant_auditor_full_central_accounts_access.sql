-- The Auditor is fully empowered inside Central Accounts while remaining
-- strictly excluded from every other business and administration module.

delete from public.role_permissions rp
using public.roles r, public.permissions p
where rp.role_id = r.id
  and rp.permission_id = p.id
  and lower(r.code) = 'auditor'
  and not (
    (p.module_code = 'dashboard' and p.action_code = 'view')
    or p.module_code = 'accounts'
    or p.module_code like 'central-accounts-%'
  );

insert into public.role_permissions (role_id, permission_id, allow)
select r.id, p.id, true
from public.roles r
join public.permissions p
  on p.is_active = true
 and (
      (p.module_code = 'dashboard' and p.action_code = 'view')
      or p.module_code = 'accounts'
      or p.module_code like 'central-accounts-%'
 )
where lower(r.code) = 'auditor'
on conflict (role_id, permission_id) do update
set allow = true;
