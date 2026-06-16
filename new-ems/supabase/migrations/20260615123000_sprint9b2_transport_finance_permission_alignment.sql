-- Sprint 9B.2: backend permission seed alignment for separated transport finance modules
-- Non-destructive and idempotent. No RLS changes.

insert into public.roles (code, name)
select 'operator', 'Operator'
where not exists (select 1 from public.roles where code = 'operator');

insert into public.roles (code, name)
select 'accounts', 'Accounts'
where not exists (select 1 from public.roles where code = 'accounts');

insert into public.roles (code, name)
select 'ca', 'CA'
where not exists (select 1 from public.roles where code = 'ca');

with seed_permissions(module_code, action_code, label) as (
  values
    ('transport-ledger', 'view', 'Transport Ledger View'),
    ('transport-ledger', 'export', 'Transport Ledger Export'),
    ('transport-ledger', 'view_audit', 'Transport Ledger View Audit'),

    ('transport-finance-approval', 'view', 'Transport Finance Approval View'),
    ('transport-finance-approval', 'approve', 'Transport Finance Approval Approve'),
    ('transport-finance-approval', 'export', 'Transport Finance Approval Export'),

    ('transport-finance-posting', 'view', 'Transport Finance Posting View'),
    ('transport-finance-posting', 'post', 'Transport Finance Posting Post'),
    ('transport-finance-posting', 'view_audit', 'Transport Finance Posting View Audit')
)
insert into public.permissions (module_code, action_code, label, is_active)
select sp.module_code, sp.action_code, sp.label, true
from seed_permissions sp
where not exists (
  select 1
  from public.permissions p
  where p.module_code = sp.module_code
    and p.action_code = sp.action_code
);

with seed_role_permissions(role_code, module_code, action_code) as (
  values
    -- super_admin: all actions on all three modules
    ('super_admin', 'transport-ledger', 'view'),
    ('super_admin', 'transport-ledger', 'export'),
    ('super_admin', 'transport-ledger', 'view_audit'),
    ('super_admin', 'transport-finance-approval', 'view'),
    ('super_admin', 'transport-finance-approval', 'approve'),
    ('super_admin', 'transport-finance-approval', 'export'),
    ('super_admin', 'transport-finance-posting', 'view'),
    ('super_admin', 'transport-finance-posting', 'post'),
    ('super_admin', 'transport-finance-posting', 'view_audit'),

    -- admin
    ('admin', 'transport-ledger', 'view'),
    ('admin', 'transport-ledger', 'export'),
    ('admin', 'transport-finance-approval', 'view'),
    ('admin', 'transport-finance-approval', 'approve'),
    ('admin', 'transport-finance-posting', 'view'),
    ('admin', 'transport-finance-posting', 'post'),

    -- accounts
    ('accounts', 'transport-ledger', 'view'),
    ('accounts', 'transport-ledger', 'export'),
    ('accounts', 'transport-finance-approval', 'view'),
    ('accounts', 'transport-finance-approval', 'approve'),
    ('accounts', 'transport-finance-posting', 'view'),
    ('accounts', 'transport-finance-posting', 'post'),

    -- manager
    ('manager', 'transport-ledger', 'view'),
    ('manager', 'transport-finance-approval', 'view'),

    -- ca
    ('ca', 'transport-ledger', 'view'),
    ('ca', 'transport-ledger', 'export'),
    ('ca', 'transport-finance-approval', 'view'),
    ('ca', 'transport-finance-approval', 'export')
)
insert into public.role_permissions (role_id, permission_id, allow)
select r.id, p.id, true
from seed_role_permissions srp
join public.roles r
  on r.code = srp.role_code
join public.permissions p
  on p.module_code = srp.module_code
 and p.action_code = srp.action_code
where not exists (
  select 1
  from public.role_permissions rp
  where rp.role_id = r.id
    and rp.permission_id = p.id
);