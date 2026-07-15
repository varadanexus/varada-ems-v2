begin;

-- The designated Chief of Operations account has broad operational
-- visibility, but administration of identities and access remains reserved
-- for the company's administrative authorities.
create or replace function public.is_coo_restricted_module(p_module_code text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(p_module_code, '') ~* '(^users$|^roles$|^divisions$|^portal-access$|^accounts$|^central-accounts|billing|invoice|payment|receipt|credit-notes?|finance|ledger|rate-master|trip-expenses|transporter-statements|withdrawals|commission|penalt|^interiors-(boq|estimates|quotations|variation-requests|change-orders)$|settings$|^settings$|tax|treasury|payables|receivables|posting|journals|vouchers|budgets|fixed-assets)';
$$;

-- Keep the role matrix consistent with the identity-level hard stop used by
-- get_my_allowed_modules(), get_my_permissions(), and has_permission().
insert into public.role_permissions (role_id, permission_id, allow)
select r.id, p.id, false
from public.roles r
join public.permissions p
  on p.module_code in ('users', 'roles', 'divisions', 'portal-access')
 and coalesce(p.is_active, true) = true
where r.code = 'coo'
on conflict (role_id, permission_id) do update set allow = false;

comment on function public.is_coo_restricted_module(text) is
  'Returns true for finance, settings, and identity/access-administration modules denied to the designated COO account.';

notify pgrst, 'reload schema';

commit;
