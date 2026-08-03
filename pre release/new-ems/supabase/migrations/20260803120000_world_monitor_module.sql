begin;

insert into public.permissions (module_code, action_code, label, is_active)
select 'world-monitor', 'view', 'Nexus Intelligence - View', true
where not exists (
  select 1 from public.permissions
  where module_code = 'world-monitor' and action_code = 'view'
);

with internal_roles(role_code) as (
  values
    ('chairman_managing_director'), ('super_admin'), ('admin'), ('coo'),
    ('cfo'), ('manager'), ('operator'), ('accounts'), ('accounts_manager'),
    ('accounts_executive'), ('ca'), ('auditor'), ('advocate'), ('agent')
)
insert into public.role_permissions (role_id, permission_id, allow)
select r.id, p.id, true
from internal_roles ir
join public.roles r on r.code = ir.role_code
join public.permissions p on p.module_code = 'world-monitor' and p.action_code = 'view'
where not exists (
  select 1 from public.role_permissions rp
  where rp.role_id = r.id and rp.permission_id = p.id
);

commit;
