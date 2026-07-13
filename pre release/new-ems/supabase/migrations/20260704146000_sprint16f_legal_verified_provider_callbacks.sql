-- Sprint 16F: verified provider callbacks for court-grade legal signing evidence.

alter table public.legal_signing_requests
  add column if not exists whatsapp_status text,
  add column if not exists whatsapp_payload jsonb not null default '{}'::jsonb;

insert into public.permissions(module_code, action_code, label, is_active)
values
  ('legal-audit', 'create', 'Legal - Receive Provider Webhooks', true)
on conflict (module_code, action_code) do update
set label = excluded.label,
    is_active = true;

with seed_role_permissions(role_code, module_code, action_code) as (
  values
    ('super_admin', 'legal-audit', 'create'),
    ('admin', 'legal-audit', 'create'),
    ('advocate', 'legal-audit', 'create')
)
insert into public.role_permissions(role_id, permission_id, allow)
select r.id, p.id, true
from seed_role_permissions s
join public.roles r on r.code = s.role_code
join public.permissions p on p.module_code = s.module_code and p.action_code = s.action_code
on conflict (role_id, permission_id) do update
set allow = true;

notify pgrst, 'reload schema';
