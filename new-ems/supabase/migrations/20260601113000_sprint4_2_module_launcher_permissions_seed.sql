-- Sprint 4.2 module launcher permission seed (non-destructive)

with modules(module_code) as (
  values
    ('transportation'),
    ('construction'),
    ('interiors'),
    ('hospital-projects'),
    ('hospital-consultancy'),
    ('imports-exports'),
    ('trading'),
    ('hr-pr'),
    ('arbitrage'),
    ('e-commerce'),
    ('accounts')
)
insert into public.permissions (module_code, action_code, label, is_active)
select m.module_code, 'view', initcap(replace(m.module_code, '-', ' ')) || ' View', true
from modules m
where not exists (
  select 1 from public.permissions p
  where p.module_code = m.module_code and p.action_code = 'view'
);

insert into public.role_permissions (role_id, permission_id, allow)
select r.id, p.id, true
from public.roles r
join public.permissions p on p.module_code in (
  'transportation','construction','interiors','hospital-projects','hospital-consultancy',
  'imports-exports','trading','hr-pr','arbitrage','e-commerce','accounts'
) and p.action_code = 'view'
where r.code = 'super_admin'
and not exists (
  select 1 from public.role_permissions rp
  where rp.role_id = r.id and rp.permission_id = p.id
);
