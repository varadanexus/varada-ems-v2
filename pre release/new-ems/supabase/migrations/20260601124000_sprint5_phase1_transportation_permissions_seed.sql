-- Sprint 5 Phase 1: transportation workspace permission seeds

with seed_modules(module_code) as (
  values
    ('transport-dashboard'),
    ('transport-truck-owners'),
    ('transport-trucks'),
    ('transport-drivers'),
    ('transport-rate-master'),
    ('transport-route-master'),
    ('transport-client-mapping'),
    ('transport-transporter-mapping')
),
seed_actions(action_code) as (
  values ('view'), ('edit')
)
insert into public.permissions (module_code, action_code, label, is_active)
select m.module_code, a.action_code,
       initcap(replace(m.module_code, '-', ' ')) || ' ' || initcap(a.action_code),
       true
from seed_modules m
cross join seed_actions a
where not exists (
  select 1 from public.permissions p
  where p.module_code = m.module_code and p.action_code = a.action_code
);

insert into public.role_permissions (role_id, permission_id, allow)
select r.id, p.id, true
from public.roles r
join public.permissions p on p.module_code in (
  'transport-dashboard','transport-truck-owners','transport-trucks','transport-drivers',
  'transport-rate-master','transport-route-master','transport-client-mapping','transport-transporter-mapping'
) and p.action_code in ('view','edit')
where r.code = 'super_admin'
and not exists (
  select 1 from public.role_permissions rp
  where rp.role_id = r.id and rp.permission_id = p.id
);