begin;

insert into public.roles (code, name, is_active)
values ('meta_reviewer', 'Meta App Reviewer', true)
on conflict (code) do update
set
  name = excluded.name,
  is_active = true,
  updated_at = now();

with requested_grants(module_code, action_code) as (
  values
    ('dashboard', 'view'),
    ('social-media-manager', 'view'),
    ('social-media-manager', 'create'),
    ('social-media-manager', 'edit'),
    ('social-media-manager', 'approve'),
    ('social-media-manager', 'post'),
    ('social-media-manager', 'export'),
    ('social-media-manager', 'view_audit')
)
insert into public.role_permissions (role_id, permission_id, allow)
select r.id, p.id, true
from public.roles r
cross join requested_grants rg
join public.permissions p
  on p.module_code = rg.module_code
 and p.action_code = rg.action_code
where r.code = 'meta_reviewer'
on conflict (role_id, permission_id) do update
set allow = true;

commit;
