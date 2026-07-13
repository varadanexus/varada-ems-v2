-- Sprint 6A.1 permission seed for truck-agent commission mapping page
insert into public.permissions (module_code, action_code, label, is_active)
select 'transport-truck-agent-commission-mapping', a.action_code,
       'Truck Agent Commission Mapping ' || initcap(a.action_code), true
from (values ('view'), ('edit')) as a(action_code)
where not exists (
  select 1 from public.permissions p
  where p.module_code = 'transport-truck-agent-commission-mapping'
    and p.action_code = a.action_code
);

insert into public.role_permissions (role_id, permission_id, allow)
select r.id, p.id, true
from public.roles r
join public.permissions p
  on p.module_code = 'transport-truck-agent-commission-mapping'
 and p.action_code in ('view','edit')
where r.code = 'super_admin'
and not exists (
  select 1 from public.role_permissions rp
  where rp.role_id = r.id and rp.permission_id = p.id
);