-- Sprint 7C: GST invoices permissions seed

with seed_modules(module_code) as (
  values ('transport-gst-invoices')
),
seed_actions(action_code) as (
  values ('view'), ('edit')
)
insert into public.permissions (module_code, action_code, label, is_active)
select m.module_code,
       a.action_code,
       'Transport GST Invoices ' || initcap(a.action_code),
       true
from seed_modules m
cross join seed_actions a
where not exists (
  select 1 from public.permissions p
  where p.module_code = m.module_code
    and p.action_code = a.action_code
);

insert into public.role_permissions (role_id, permission_id, allow)
select r.id, p.id, true
from public.roles r
join public.permissions p
  on p.module_code = 'transport-gst-invoices'
 and p.action_code in ('view', 'edit')
where r.code = 'super_admin'
  and not exists (
    select 1 from public.role_permissions rp
    where rp.role_id = r.id
      and rp.permission_id = p.id
  );