-- Sprint 10C.3: seed EMS-backed client role for Interiors portal provisioning

insert into public.roles (code, name, is_active)
select 'client', 'Client', true
where not exists (
  select 1 from public.roles where code = 'client'
);

with seed_role_permissions(module_code, action_code) as (
  values
    ('interiors-client-portal', 'view')
)
insert into public.role_permissions (role_id, permission_id, allow)
select r.id, p.id, true
from public.roles r
join seed_role_permissions srp on true
join public.permissions p
  on p.module_code = srp.module_code
 and p.action_code = srp.action_code
where r.code = 'client'
  and not exists (
    select 1
    from public.role_permissions rp
    where rp.role_id = r.id
      and rp.permission_id = p.id
  );