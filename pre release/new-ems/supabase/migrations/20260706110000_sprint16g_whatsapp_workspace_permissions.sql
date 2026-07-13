insert into public.permissions(module_code, action_code, label, is_active)
values
  ('whatsapp', 'view', 'WhatsApp - Workspace Access', true),
  ('whatsapp-command-center', 'view', 'WhatsApp - Dashboard', true),
  ('whatsapp-command-center', 'export', 'WhatsApp - Export Dashboard', true),
  ('whatsapp-inbox', 'view', 'WhatsApp - Inbox', true),
  ('whatsapp-inbox', 'create', 'WhatsApp - Start Chat', true),
  ('whatsapp-inbox', 'edit', 'WhatsApp - Send Messages', true),
  ('whatsapp-templates', 'view', 'WhatsApp - Templates', true),
  ('whatsapp-templates', 'export', 'WhatsApp - Export Templates', true),
  ('whatsapp-settings', 'view', 'WhatsApp - Twilio Settings', true),
  ('whatsapp-settings', 'edit', 'WhatsApp - Update Twilio Settings', true),
  ('whatsapp-settings', 'view_audit', 'WhatsApp - View Provider Audit', true)
on conflict (module_code, action_code) do update
set label = excluded.label,
    is_active = true;

with seed_role_permissions(role_code, module_code, action_code) as (
  values
    ('super_admin', 'whatsapp', 'view'),
    ('super_admin', 'whatsapp-command-center', 'view'),
    ('super_admin', 'whatsapp-command-center', 'export'),
    ('super_admin', 'whatsapp-inbox', 'view'),
    ('super_admin', 'whatsapp-inbox', 'create'),
    ('super_admin', 'whatsapp-inbox', 'edit'),
    ('super_admin', 'whatsapp-templates', 'view'),
    ('super_admin', 'whatsapp-templates', 'export'),
    ('super_admin', 'whatsapp-settings', 'view'),
    ('super_admin', 'whatsapp-settings', 'edit'),
    ('super_admin', 'whatsapp-settings', 'view_audit'),
    ('admin', 'whatsapp', 'view'),
    ('admin', 'whatsapp-command-center', 'view'),
    ('admin', 'whatsapp-command-center', 'export'),
    ('admin', 'whatsapp-inbox', 'view'),
    ('admin', 'whatsapp-inbox', 'create'),
    ('admin', 'whatsapp-inbox', 'edit'),
    ('admin', 'whatsapp-templates', 'view'),
    ('admin', 'whatsapp-templates', 'export'),
    ('admin', 'whatsapp-settings', 'view'),
    ('admin', 'whatsapp-settings', 'edit'),
    ('admin', 'whatsapp-settings', 'view_audit')
)
insert into public.role_permissions(role_id, permission_id, allow)
select r.id, p.id, true
from seed_role_permissions s
join public.roles r on r.code = s.role_code
join public.permissions p on p.module_code = s.module_code and p.action_code = s.action_code
where not exists (
  select 1
  from public.role_permissions rp
  where rp.role_id = r.id
    and rp.permission_id = p.id
);
