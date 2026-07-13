-- Agent penalties reduce withdrawable commission and can be maintained by admin staff.

create table if not exists public.transport_agent_penalties (
  id uuid primary key default gen_random_uuid(),
  penalty_no text not null unique,
  transport_agent_id uuid not null references public.transport_agents(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  reason text not null,
  status text not null default 'active'
    check (status in ('active','waived','reversed')),
  effective_date date not null default current_date,
  remarks text,
  created_by uuid references public.app_users(id),
  updated_by uuid references public.app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_transport_agent_penalties_agent
  on public.transport_agent_penalties(transport_agent_id, effective_date desc, created_at desc);
create index if not exists idx_transport_agent_penalties_status
  on public.transport_agent_penalties(status, effective_date desc);

alter table public.transport_agent_penalties enable row level security;

with seed_permissions(module_code, action_code, label) as (
  values
    ('transport-agent-penalties', 'view', 'Agent Penalties View'),
    ('transport-agent-penalties', 'create', 'Agent Penalties Create'),
    ('transport-agent-penalties', 'edit', 'Agent Penalties Edit'),
    ('transport-agent-penalties', 'export', 'Agent Penalties Export')
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
    ('super_admin','view'), ('super_admin','create'), ('super_admin','edit'), ('super_admin','export'),
    ('admin','view'), ('admin','create'), ('admin','edit'), ('admin','export'),
    ('accounts','view'), ('accounts','create'), ('accounts','edit'), ('accounts','export'),
    ('accounts_manager','view'), ('accounts_manager','create'), ('accounts_manager','edit'), ('accounts_manager','export'),
    ('cfo','view'), ('cfo','create'), ('cfo','edit'), ('cfo','export'),
    ('manager','view'), ('manager','export'),
    ('auditor','view'), ('auditor','export')
)
insert into public.role_permissions(role_id, permission_id, allow)
select r.id, p.id, true
from grants g
join public.roles r on r.code = g.role_code
join public.permissions p
  on p.module_code = 'transport-agent-penalties'
 and p.action_code = g.action_code
where not exists (
  select 1 from public.role_permissions rp
  where rp.role_id = r.id and rp.permission_id = p.id
);

create policy transport_agent_penalties_staff_select
on public.transport_agent_penalties
for select to authenticated
using (public.has_permission('transport-agent-penalties', 'view'));

create or replace function public.transport_agent_penalty_total(p_transport_agent_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(p.amount), 0)::numeric
  from public.transport_agent_penalties p
  where p.transport_agent_id = p_transport_agent_id
    and p.status = 'active';
$$;

revoke all on function public.transport_agent_penalty_total(uuid) from public, anon, authenticated;

drop function if exists public.transport_agent_portal_withdrawal_summary(text, uuid);

create or replace function public.transport_agent_portal_withdrawal_summary(
  p_session_token text,
  p_transport_agent_id uuid
)
returns table(
  earned_commission numeric,
  penalty_amount numeric,
  committed_amount numeric,
  available_amount numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_portal_user_id uuid;
  v_earned numeric;
  v_penalties numeric;
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
  v_penalties := public.transport_agent_penalty_total(p_transport_agent_id);
  select coalesce(sum(w.amount), 0) into v_committed
  from public.transport_agent_withdrawal_requests w
  where w.transport_agent_id = p_transport_agent_id
    and w.status in ('pending','approved','paid');

  return query select v_earned, v_penalties, v_committed, greatest(v_earned - v_penalties - v_committed, 0);
end;
$$;

create or replace function public.transport_agent_penalty_list_admin(p_status text default null)
returns table(
  id uuid, penalty_no text, transport_agent_id uuid, agent_name text, agent_code text,
  amount numeric, reason text, status text, effective_date date, remarks text,
  created_at timestamptz, updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('transport-agent-penalties', 'view') then
    raise exception 'Not authorized to view agent penalties';
  end if;
  return query
  select p.id, p.penalty_no, p.transport_agent_id, a.name, a.code, p.amount,
         p.reason, p.status, p.effective_date, p.remarks, p.created_at, p.updated_at
  from public.transport_agent_penalties p
  join public.transport_agents a on a.id = p.transport_agent_id
  where p_status is null or p_status = '' or p.status = p_status
  order by case when p.status = 'active' then 0 when p.status = 'waived' then 1 else 2 end,
           p.effective_date desc, p.created_at desc;
end;
$$;

create or replace function public.transport_agent_penalty_upsert_admin(
  p_penalty_id uuid,
  p_transport_agent_id uuid,
  p_amount numeric,
  p_reason text,
  p_effective_date date default current_date,
  p_status text default 'active',
  p_remarks text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public.current_app_user_id();
  v_id uuid;
  v_status text := lower(coalesce(nullif(trim(p_status), ''), 'active'));
begin
  if p_transport_agent_id is null then raise exception 'Agent is required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Penalty amount must be greater than zero'; end if;
  if nullif(trim(p_reason), '') is null then raise exception 'Penalty reason is required'; end if;
  if v_status not in ('active','waived','reversed') then raise exception 'Invalid penalty status'; end if;

  if p_penalty_id is null then
    if not public.has_permission('transport-agent-penalties', 'create') then
      raise exception 'Not authorized to create agent penalties';
    end if;
    insert into public.transport_agent_penalties(
      penalty_no, transport_agent_id, amount, reason, status, effective_date, remarks, created_by, updated_by
    ) values (
      public.next_transport_code('agent_penalty', 'APN'),
      p_transport_agent_id,
      round(p_amount, 2),
      trim(p_reason),
      v_status,
      coalesce(p_effective_date, current_date),
      nullif(trim(p_remarks), ''),
      v_actor,
      v_actor
    ) returning id into v_id;
  else
    if not public.has_permission('transport-agent-penalties', 'edit') then
      raise exception 'Not authorized to update agent penalties';
    end if;
    update public.transport_agent_penalties
    set transport_agent_id = p_transport_agent_id,
        amount = round(p_amount, 2),
        reason = trim(p_reason),
        status = v_status,
        effective_date = coalesce(p_effective_date, effective_date),
        remarks = nullif(trim(p_remarks), ''),
      updated_by = v_actor,
      updated_at = now()
    where id = p_penalty_id;
    if not found then raise exception 'Penalty record not found'; end if;
    v_id := p_penalty_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.transport_agent_penalty_update_status_admin(
  p_penalty_id uuid,
  p_status text,
  p_remarks text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public.current_app_user_id();
  v_status text := lower(coalesce(nullif(trim(p_status), ''), ''));
begin
  if not public.has_permission('transport-agent-penalties', 'edit') then
    raise exception 'Not authorized to update agent penalties';
  end if;
  if v_status not in ('active','waived','reversed') then
    raise exception 'Invalid penalty status';
  end if;
  update public.transport_agent_penalties
  set status = v_status,
      remarks = coalesce(nullif(trim(p_remarks), ''), remarks),
      updated_by = v_actor,
      updated_at = now()
  where id = p_penalty_id;
  if not found then raise exception 'Penalty record not found'; end if;
end;
$$;

grant execute on function public.transport_agent_penalty_total(uuid) to anon, authenticated;
grant execute on function public.transport_agent_portal_withdrawal_summary(text, uuid) to anon, authenticated;
grant execute on function public.transport_agent_penalty_list_admin(text) to authenticated;
grant execute on function public.transport_agent_penalty_upsert_admin(uuid, uuid, numeric, text, date, text, text) to authenticated;
grant execute on function public.transport_agent_penalty_update_status_admin(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
