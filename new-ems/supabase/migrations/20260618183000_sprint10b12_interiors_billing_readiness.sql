-- Sprint 10B.12: Interiors billing readiness

create extension if not exists pgcrypto;

create table if not exists public.interior_billing_headers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  bill_number text not null,
  bill_type text not null,
  bill_date date not null default current_date,
  amount numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null default 0,
  status text not null default 'draft',
  remarks text,
  created_by uuid references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bill_number),
  check (bill_type in ('advance', 'progress', 'change', 'final')),
  check (status in ('draft', 'submitted', 'approved', 'rejected', 'ready_for_accounts'))
);

create table if not exists public.interior_billing_lines (
  id uuid primary key default gen_random_uuid(),
  billing_header_id uuid not null references public.interior_billing_headers(id) on delete cascade,
  description text not null,
  quantity numeric(14,3) not null default 0,
  rate numeric(14,2) not null default 0,
  amount numeric(14,2) not null default 0,
  source_type text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_type in ('quote', 'change', 'manual'))
);

create index if not exists idx_interior_billing_headers_project_id on public.interior_billing_headers(project_id);
create index if not exists idx_interior_billing_headers_status on public.interior_billing_headers(status, bill_type);
create index if not exists idx_interior_billing_lines_header_id on public.interior_billing_lines(billing_header_id);

drop trigger if exists trg_interior_billing_headers_touch_updated_at on public.interior_billing_headers;
create trigger trg_interior_billing_headers_touch_updated_at
before update on public.interior_billing_headers
for each row execute function public.touch_interior_entity_updated_at();

drop trigger if exists trg_interior_billing_lines_touch_updated_at on public.interior_billing_lines;
create trigger trg_interior_billing_lines_touch_updated_at
before update on public.interior_billing_lines
for each row execute function public.touch_interior_entity_updated_at();

create or replace function public.handle_interior_billing_line_amount()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.amount := round((coalesce(new.quantity, 0) * coalesce(new.rate, 0))::numeric, 2);
  return new;
end;
$$;

drop trigger if exists trg_interior_billing_line_amount on public.interior_billing_lines;
create trigger trg_interior_billing_line_amount
before insert or update on public.interior_billing_lines
for each row execute function public.handle_interior_billing_line_amount();

create or replace function public.recalc_interior_billing_header_total(p_billing_header_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.interior_billing_headers h
  set amount = coalesce((select round(sum(coalesce(l.amount, 0))::numeric, 2) from public.interior_billing_lines l where l.billing_header_id = h.id), 0),
      total_amount = round(coalesce(amount, 0) + coalesce(tax_amount, 0), 2),
      updated_at = now()
  where h.id = p_billing_header_id;
end;
$$;

create or replace function public.handle_interior_billing_line_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_header_id uuid;
begin
  v_header_id := case when tg_op = 'DELETE' then old.billing_header_id else new.billing_header_id end;
  perform public.recalc_interior_billing_header_total(v_header_id);
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_interior_billing_line_totals on public.interior_billing_lines;
create trigger trg_interior_billing_line_totals
after insert or update or delete on public.interior_billing_lines
for each row execute function public.handle_interior_billing_line_totals();

create or replace function public.next_interior_bill_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
begin
  select coalesce(max(nullif(regexp_replace(bill_number, '^.*-', ''), '')::integer), 0) + 1
  into v_next
  from public.interior_billing_headers
  where bill_number like 'INT-BILL-%';

  return 'INT-BILL-26-27-' || lpad(v_next::text, 6, '0');
end;
$$;

create or replace function public.can_manage_interior_billing_project(p_project_id uuid, p_action text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_edit_project_by_id(p_project_id)
    and public.has_permission('interiors-billing', p_action);
$$;

grant execute on function public.recalc_interior_billing_header_total(uuid) to authenticated;
grant execute on function public.next_interior_bill_number() to authenticated;
grant execute on function public.can_manage_interior_billing_project(uuid, text) to authenticated;

with seed_permissions(module_code, action_code, label) as (
  values
    ('interiors-billing', 'view', 'Interiors Billing View'),
    ('interiors-billing', 'create', 'Interiors Billing Create'),
    ('interiors-billing', 'edit', 'Interiors Billing Edit'),
    ('interiors-billing', 'delete', 'Interiors Billing Delete'),
    ('interiors-billing', 'approve', 'Interiors Billing Approve')
)
insert into public.permissions (module_code, action_code, label, is_active)
select sp.module_code, sp.action_code, sp.label, true
from seed_permissions sp
where not exists (
  select 1 from public.permissions p
  where p.module_code = sp.module_code and p.action_code = sp.action_code
);

with seed_role_permissions(role_code, module_code, action_code) as (
  values
    ('super_admin','interiors-billing','view'),('super_admin','interiors-billing','create'),('super_admin','interiors-billing','edit'),('super_admin','interiors-billing','delete'),('super_admin','interiors-billing','approve'),
    ('admin','interiors-billing','view'),('admin','interiors-billing','create'),('admin','interiors-billing','edit'),('admin','interiors-billing','delete'),('admin','interiors-billing','approve'),
    ('manager','interiors-billing','view'),('manager','interiors-billing','create'),('manager','interiors-billing','edit'),('manager','interiors-billing','approve'),
    ('operator','interiors-billing','view'),('operator','interiors-billing','create'),('operator','interiors-billing','edit'),
    ('accounts','interiors-billing','view'),('accounts_manager','interiors-billing','view'),('accounts_executive','interiors-billing','view'),('ca','interiors-billing','view'),('cfo','interiors-billing','view'),('ceo','interiors-billing','view'),('auditor','interiors-billing','view')
)
insert into public.role_permissions (role_id, permission_id, allow)
select r.id, p.id, true
from seed_role_permissions srp
join public.roles r on r.code = srp.role_code
join public.permissions p on p.module_code = srp.module_code and p.action_code = srp.action_code
where not exists (
  select 1 from public.role_permissions rp where rp.role_id = r.id and rp.permission_id = p.id
);

alter table public.interior_billing_headers enable row level security;
alter table public.interior_billing_lines enable row level security;

drop policy if exists interior_billing_headers_select_hardened on public.interior_billing_headers;
drop policy if exists interior_billing_headers_insert_hardened on public.interior_billing_headers;
drop policy if exists interior_billing_headers_update_hardened on public.interior_billing_headers;
drop policy if exists interior_billing_headers_delete_hardened on public.interior_billing_headers;
create policy interior_billing_headers_select_hardened on public.interior_billing_headers for select to authenticated
using (public.can_view_project_by_id(project_id) and public.has_permission('interiors-billing', 'view'));
create policy interior_billing_headers_insert_hardened on public.interior_billing_headers for insert to authenticated
with check (public.can_manage_interior_billing_project(project_id, 'create'));
create policy interior_billing_headers_update_hardened on public.interior_billing_headers for update to authenticated
using (public.can_manage_interior_billing_project(project_id, 'edit') or public.can_manage_interior_billing_project(project_id, 'approve'))
with check (public.can_manage_interior_billing_project(project_id, 'edit') or public.can_manage_interior_billing_project(project_id, 'approve'));
create policy interior_billing_headers_delete_hardened on public.interior_billing_headers for delete to authenticated
using (public.can_manage_interior_billing_project(project_id, 'delete'));

drop policy if exists interior_billing_lines_select_hardened on public.interior_billing_lines;
drop policy if exists interior_billing_lines_insert_hardened on public.interior_billing_lines;
drop policy if exists interior_billing_lines_update_hardened on public.interior_billing_lines;
drop policy if exists interior_billing_lines_delete_hardened on public.interior_billing_lines;
create policy interior_billing_lines_select_hardened on public.interior_billing_lines for select to authenticated
using (exists (
  select 1 from public.interior_billing_headers h
  where h.id = billing_header_id
    and public.can_view_project_by_id(h.project_id)
    and public.has_permission('interiors-billing', 'view')
));
create policy interior_billing_lines_insert_hardened on public.interior_billing_lines for insert to authenticated
with check (exists (
  select 1 from public.interior_billing_headers h
  where h.id = billing_header_id
    and public.can_manage_interior_billing_project(h.project_id, 'create')
));
create policy interior_billing_lines_update_hardened on public.interior_billing_lines for update to authenticated
using (exists (
  select 1 from public.interior_billing_headers h
  where h.id = billing_header_id
    and public.can_manage_interior_billing_project(h.project_id, 'edit')
))
with check (exists (
  select 1 from public.interior_billing_headers h
  where h.id = billing_header_id
    and public.can_manage_interior_billing_project(h.project_id, 'edit')
));
create policy interior_billing_lines_delete_hardened on public.interior_billing_lines for delete to authenticated
using (exists (
  select 1 from public.interior_billing_headers h
  where h.id = billing_header_id
    and public.can_manage_interior_billing_project(h.project_id, 'delete')
));