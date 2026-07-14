-- Unified EMS email sender identities.
-- All outbound mail uses one centrally branded HTML shell; only the message
-- content and the verified departmental sender identity vary.

insert into public.email_senders
  (sender_key, label, from_name, from_email, reply_to_email, reply_to_name, is_active, sort_order, updated_at)
values
  ('admin', 'Administration', 'Varada Nexus Administration', 'admin@varadanexus.com', 'admin@varadanexus.com', 'Varada Nexus Administration', true, 10, now()),
  ('support', 'Customer Care', 'Varada Nexus Customer Care', 'support@varadanexus.com', 'support@varadanexus.com', 'Varada Nexus Customer Care', true, 20, now()),
  ('legal', 'Legal Department', 'Varada Nexus Legal', 'legal@varadanexus.com', 'legal@varadanexus.com', 'Varada Nexus Legal', true, 30, now()),
  ('transport', 'Transportation', 'Varada Nexus Transportation', 'transport@varadanexus.com', 'transport@varadanexus.com', 'Varada Nexus Transportation', true, 40, now()),
  ('digitalmarketing', 'Digital Marketing & Services', 'Varada Nexus Digital Marketing & Services', 'digitalmarketing@varadanexus.com', 'digitalmarketing@varadanexus.com', 'Varada Nexus Digital Marketing & Services', true, 50, now()),
  ('hr', 'Human Resources', 'Varada Nexus HR', 'hr@varadanexus.com', 'hr@varadanexus.com', 'Varada Nexus HR', true, 60, now()),
  ('noreply', 'No Reply', 'Varada Nexus', 'noreply@varadanexus.com', null, null, true, 70, now())
on conflict (sender_key) do update set
  label = excluded.label,
  from_name = excluded.from_name,
  from_email = excluded.from_email,
  reply_to_email = excluded.reply_to_email,
  reply_to_name = excluded.reply_to_name,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  updated_at = now();

-- COO can compose with any configured sender identity, but cannot administer
-- provider settings or create arbitrary sender addresses.
with coo_email_permissions(module_code, action_code) as (
  values
    ('email', 'view'),
    ('email-command-center', 'view'),
    ('email-compose', 'view'),
    ('email-compose', 'create')
)
insert into public.role_permissions(role_id, permission_id, allow)
select r.id, p.id, true
from coo_email_permissions wanted
join public.roles r on r.code = 'coo'
join public.permissions p
  on p.module_code = wanted.module_code
 and p.action_code = wanted.action_code
on conflict (role_id, permission_id) do update set allow = true;
