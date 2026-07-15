begin;

-- Trip expense capture is an operational COO responsibility. Keep the rest
-- of the finance boundary intact while allowing this one Transportation page.
create or replace function public.is_coo_restricted_module(p_module_code text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case
    when coalesce(p_module_code, '') = 'transport-trip-expenses' then false
    else coalesce(p_module_code, '') ~* '(^users$|^roles$|^divisions$|^portal-access$|^accounts$|^central-accounts|billing|invoice|payment|receipt|credit-notes?|finance|ledger|rate-master|trip-expenses|transporter-statements|withdrawals|commission|penalt|^interiors-(boq|estimates|quotations|variation-requests|change-orders)$|settings$|^settings$|tax|treasury|payables|receivables|posting|journals|vouchers|budgets|fixed-assets)'
  end;
$$;

-- The COO may view, create, and correct trip expense entries. Deletion,
-- approval, posting, and export remain denied unless separately authorized.
insert into public.role_permissions (role_id, permission_id, allow)
select
  r.id,
  p.id,
  p.action_code in ('view', 'create', 'edit')
from public.roles r
join public.permissions p
  on p.module_code = 'transport-trip-expenses'
 and coalesce(p.is_active, true) = true
where r.code = 'coo'
on conflict (role_id, permission_id) do update set allow = excluded.allow;

comment on function public.is_coo_restricted_module(text) is
  'Returns true for COO-denied administration and finance modules, except operational Transportation trip expense entry.';

notify pgrst, 'reload schema';

commit;
