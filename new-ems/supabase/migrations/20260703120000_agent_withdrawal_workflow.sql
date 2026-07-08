-- Transportation Agent withdrawal requests and staff approval workflow.

create table if not exists public.transport_agent_withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  request_no text not null unique,
  transport_agent_id uuid not null references public.transport_agents(id),
  portal_user_id uuid not null references public.transport_portal_users(id),
  amount numeric(14,2) not null check (amount > 0),
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','paid','cancelled')),
  agent_note text,
  review_note text,
  payment_reference text,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.app_users(id),
  paid_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists idx_transport_agent_withdrawals_agent
  on public.transport_agent_withdrawal_requests(transport_agent_id, requested_at desc);
create index if not exists idx_transport_agent_withdrawals_status
  on public.transport_agent_withdrawal_requests(status, requested_at);

alter table public.transport_agent_withdrawal_requests enable row level security;

with seed_permissions(module_code, action_code, label) as (
  values
    ('transport-agent-withdrawals', 'view', 'Agent Withdrawals View'),
    ('transport-agent-withdrawals', 'approve', 'Agent Withdrawals Approve'),
    ('transport-agent-withdrawals', 'edit', 'Agent Withdrawals Mark Paid'),
    ('transport-agent-withdrawals', 'export', 'Agent Withdrawals Export')
)
insert into public.permissions(module_code, action_code, label, is_active)
select module_code, action_code, label, true
from seed_permissions s
where not exists (
  select 1 from public.permissions p
  where p.module_code = s.module_code and p.action_code = s.action_code
);

with grants(role_code, action_code) as (
  values
    ('super_admin','view'), ('super_admin','approve'), ('super_admin','edit'), ('super_admin','export'),
    ('admin','view'), ('admin','approve'), ('admin','edit'), ('admin','export'),
    ('manager','view'), ('manager','approve'),
    ('accounts','view'), ('accounts','approve'), ('accounts','edit'), ('accounts','export'),
    ('accounts_manager','view'), ('accounts_manager','approve'), ('accounts_manager','edit'), ('accounts_manager','export'),
    ('cfo','view'), ('cfo','approve'), ('cfo','edit'), ('cfo','export'),
    ('ca','view'), ('ca','export'),
    ('auditor','view'), ('auditor','export')
)
insert into public.role_permissions(role_id, permission_id, allow)
select r.id, p.id, true
from grants g
join public.roles r on r.code = g.role_code
join public.permissions p
  on p.module_code = 'transport-agent-withdrawals'
 and p.action_code = g.action_code
where not exists (
  select 1 from public.role_permissions rp
  where rp.role_id = r.id and rp.permission_id = p.id
);

create policy transport_agent_withdrawals_staff_select
on public.transport_agent_withdrawal_requests
for select to authenticated
using (public.has_permission('transport-agent-withdrawals', 'view'));

create or replace function public.transport_agent_completed_commission(p_transport_agent_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(mapping.commission_amount), 0)::numeric
  from public.transport_trips t
  join lateral (
    select
      case
        when m.commission_type = 'per_mt'
          then coalesce(m.commission_value, 0) * coalesce(t.quantity_mt, 0)
        when m.commission_type = 'percentage_margin'
          then coalesce(t.company_margin, 0) * coalesce(m.commission_value, 0) / 100
        else coalesce(m.commission_value, 0)
      end::numeric as commission_amount
    from public.transport_truck_agent_commission_mapping m
    where m.truck_id = t.truck_id
      and m.transport_agent_id = p_transport_agent_id
      and m.is_active
      and m.deleted_at is null
      and (m.effective_from is null or m.effective_from <= t.trip_date)
      and (m.effective_to is null or m.effective_to >= t.trip_date)
    order by m.effective_from desc nulls last, m.created_at desc
    limit 1
  ) mapping on true
  where t.deleted_at is null
    and t.status = 'completed';
$$;

revoke all on function public.transport_agent_completed_commission(uuid) from public, anon, authenticated;

create or replace function public.transport_agent_portal_withdrawal_summary(
  p_session_token text,
  p_transport_agent_id uuid
)
returns table(earned_commission numeric, committed_amount numeric, available_amount numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_portal_user_id uuid;
  v_earned numeric;
  v_committed numeric;
begin
  select s.portal_user_id into v_portal_user_id
  from public.transport_portal_validate_session(p_session_token) s;

  if not exists (
    select 1 from public.transport_agent_portal_access a
    where a.portal_user_id = v_portal_user_id
      and a.transport_agent_id = p_transport_agent_id
      and a.is_active
  ) then raise exception 'Access denied for this agent'; end if;

  v_earned := public.transport_agent_completed_commission(p_transport_agent_id);
  select coalesce(sum(w.amount), 0) into v_committed
  from public.transport_agent_withdrawal_requests w
  where w.transport_agent_id = p_transport_agent_id
    and w.status in ('pending','approved','paid');

  return query select v_earned, v_committed, greatest(v_earned - v_committed, 0);
end;
$$;

create or replace function public.transport_agent_portal_list_withdrawals(
  p_session_token text,
  p_transport_agent_id uuid
)
returns table(
  id uuid, request_no text, amount numeric, status text, agent_note text,
  review_note text, payment_reference text, requested_at timestamptz,
  reviewed_at timestamptz, paid_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare v_portal_user_id uuid;
begin
  select s.portal_user_id into v_portal_user_id
  from public.transport_portal_validate_session(p_session_token) s;
  if not exists (
    select 1 from public.transport_agent_portal_access a
    where a.portal_user_id = v_portal_user_id
      and a.transport_agent_id = p_transport_agent_id and a.is_active
  ) then raise exception 'Access denied for this agent'; end if;

  return query
  select w.id, w.request_no, w.amount, w.status, w.agent_note, w.review_note,
         w.payment_reference, w.requested_at, w.reviewed_at, w.paid_at
  from public.transport_agent_withdrawal_requests w
  where w.transport_agent_id = p_transport_agent_id
    and w.portal_user_id = v_portal_user_id
  order by w.requested_at desc;
end;
$$;

create or replace function public.transport_agent_portal_request_withdrawal(
  p_session_token text,
  p_transport_agent_id uuid,
  p_amount numeric,
  p_agent_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_portal_user_id uuid;
  v_available numeric;
  v_id uuid;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Withdrawal amount must be greater than zero'; end if;

  select s.portal_user_id into v_portal_user_id
  from public.transport_portal_validate_session(p_session_token) s;
  if not exists (
    select 1 from public.transport_agent_portal_access a
    where a.portal_user_id = v_portal_user_id
      and a.transport_agent_id = p_transport_agent_id and a.is_active
  ) then raise exception 'Access denied for this agent'; end if;

  perform pg_advisory_xact_lock(hashtext(p_transport_agent_id::text));
  select s.available_amount into v_available
  from public.transport_agent_portal_withdrawal_summary(p_session_token, p_transport_agent_id) s;
  if p_amount > v_available then raise exception 'Requested amount exceeds available commission'; end if;

  insert into public.transport_agent_withdrawal_requests(
    request_no, transport_agent_id, portal_user_id, amount, agent_note
  ) values (
    public.next_transport_code('agent_withdrawal', 'AWR'),
    p_transport_agent_id, v_portal_user_id, round(p_amount, 2), nullif(trim(p_agent_note), '')
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.transport_agent_portal_cancel_withdrawal(
  p_session_token text,
  p_request_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_portal_user_id uuid;
begin
  select s.portal_user_id into v_portal_user_id
  from public.transport_portal_validate_session(p_session_token) s;
  update public.transport_agent_withdrawal_requests
  set status = 'cancelled', updated_at = now()
  where id = p_request_id and portal_user_id = v_portal_user_id and status = 'pending';
  if not found then raise exception 'Pending withdrawal request not found'; end if;
end;
$$;

create or replace function public.transport_agent_withdrawal_list_admin(p_status text default null)
returns table(
  id uuid, request_no text, transport_agent_id uuid, agent_name text, agent_code text,
  amount numeric, status text, agent_note text, review_note text, payment_reference text,
  requested_at timestamptz, reviewed_at timestamptz, paid_at timestamptz,
  bank_name text, account_number text, ifsc_code text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('transport-agent-withdrawals', 'view') then
    raise exception 'Not authorized to view agent withdrawals';
  end if;
  return query
  select w.id, w.request_no, w.transport_agent_id, a.name, a.code, w.amount, w.status,
         w.agent_note, w.review_note, w.payment_reference, w.requested_at,
         w.reviewed_at, w.paid_at, a.bank_name, a.account_number, a.ifsc_code
  from public.transport_agent_withdrawal_requests w
  join public.transport_agents a on a.id = w.transport_agent_id
  where p_status is null or p_status = '' or w.status = p_status
  order by case when w.status = 'pending' then 0 when w.status = 'approved' then 1 else 2 end,
           w.requested_at desc;
end;
$$;

create or replace function public.transport_agent_withdrawal_decide_admin(
  p_request_id uuid,
  p_action text,
  p_review_note text default null,
  p_payment_reference text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_actor uuid := public.current_app_user_id();
begin
  if p_action in ('approve','reject') then
    if not public.has_permission('transport-agent-withdrawals', 'approve') then
      raise exception 'Not authorized to approve agent withdrawals';
    end if;
    update public.transport_agent_withdrawal_requests
    set status = case p_action when 'approve' then 'approved' else 'rejected' end,
        review_note = nullif(trim(p_review_note), ''),
        reviewed_at = now(), reviewed_by = v_actor, updated_at = now()
    where id = p_request_id and status = 'pending';
  elsif p_action = 'mark_paid' then
    if not public.has_permission('transport-agent-withdrawals', 'edit') then
      raise exception 'Not authorized to mark agent withdrawals paid';
    end if;
    if nullif(trim(p_payment_reference), '') is null then raise exception 'Payment reference is required'; end if;
    update public.transport_agent_withdrawal_requests
    set status = 'paid', payment_reference = trim(p_payment_reference),
        paid_at = now(), updated_at = now()
    where id = p_request_id and status = 'approved';
  else
    raise exception 'Invalid withdrawal action';
  end if;
  if not found then raise exception 'Withdrawal request is not in the required status'; end if;
end;
$$;

grant execute on function public.transport_agent_portal_withdrawal_summary(text, uuid) to anon, authenticated;
grant execute on function public.transport_agent_portal_list_withdrawals(text, uuid) to anon, authenticated;
grant execute on function public.transport_agent_portal_request_withdrawal(text, uuid, numeric, text) to anon, authenticated;
grant execute on function public.transport_agent_portal_cancel_withdrawal(text, uuid) to anon, authenticated;
grant execute on function public.transport_agent_withdrawal_list_admin(text) to authenticated;
grant execute on function public.transport_agent_withdrawal_decide_admin(uuid, text, text, text) to authenticated;

notify pgrst, 'reload schema';
