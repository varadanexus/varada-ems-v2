-- Sprint 20B: Internal profit-share partners (residual margin tier).
--
-- Two (configurable) internal agents automatically ride on every truck and take
-- a percentage of the margin that is LEFT AFTER all other (outside) agents on the
-- trip are paid. Example: margin 10,000; outside agent per-MT = 500; residual =
-- 9,500; partner A 30% = 2,850; partner B 30% = 2,850; company keeps 3,800.
--
-- Design:
--   * transport_profit_share_partners : editable list of partner agents + share %.
--   * transport_trucks.profit_share_enabled : per-truck on/off toggle (default on).
--   * transport_trip_agent_commission(trip, agent) : single source of truth that
--     returns an agent's commission on a trip, handling BOTH the partner tier and
--     ordinary truck-agent mappings. All reporting funnels through it.
--
-- Partner earnings come only from the partner tier (not from ordinary mappings);
-- partners are internal and are not expected to also be mapped as outside agents.

-- 1. Per-truck toggle --------------------------------------------------------
alter table public.transport_trucks
  add column if not exists profit_share_enabled boolean not null default true;

-- 2. Editable partner config -------------------------------------------------
create table if not exists public.transport_profit_share_partners (
  id uuid primary key default gen_random_uuid(),
  transport_agent_id uuid not null references public.transport_agents(id),
  share_percentage numeric(6,3) not null default 30
    check (share_percentage >= 0 and share_percentage <= 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_profit_share_partner_active_agent
  on public.transport_profit_share_partners(transport_agent_id)
  where is_active;

-- Seed the two internal partners (Prudhvi, Jaswanth) at 30% each, matched by
-- agent code. Idempotent: only inserts if the agent exists and isn't already set.
do $$
declare
  v_agent record;
begin
  for v_agent in
    select id from public.transport_agents
    where upper(coalesce(code, '')) in ('AG-PRUD', 'AG-BODDU')
      and deleted_at is null
  loop
    if not exists (
      select 1 from public.transport_profit_share_partners p
      where p.transport_agent_id = v_agent.id and p.is_active
    ) then
      insert into public.transport_profit_share_partners (transport_agent_id, share_percentage, is_active)
      values (v_agent.id, 30, true);
    end if;
  end loop;
end;
$$;

-- 3. Sum of NON-partner agent commission on a trip (the amount deducted before
--    partners take their share). One row per non-partner agent (latest effective).
create or replace function public.transport_trip_non_partner_agent_commission(p_trip_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  with tr as (
    select id, truck_id, trip_date, quantity_mt, company_margin
    from public.transport_trips
    where id = p_trip_id and deleted_at is null
  ),
  per_agent as (
    select distinct on (m.transport_agent_id)
      (
        case
          when m.commission_type = 'per_mt'
            then coalesce(m.commission_value, 0) * coalesce((select quantity_mt from tr), 0)
          when m.commission_type = 'percentage_margin'
            then coalesce((select company_margin from tr), 0) * coalesce(m.commission_value, 0) / 100
          else coalesce(m.commission_value, 0)
        end
        * coalesce(m.commission_share_percentage, 100) / 100
      )::numeric as amt
    from public.transport_truck_agent_commission_mapping m
    where m.truck_id = (select truck_id from tr)
      and m.is_active and m.deleted_at is null
      and (m.effective_from is null or m.effective_from <= (select trip_date from tr))
      and (m.effective_to  is null or m.effective_to  >= (select trip_date from tr))
      and m.transport_agent_id not in (
        select transport_agent_id from public.transport_profit_share_partners where is_active
      )
    order by m.transport_agent_id, m.effective_from desc nulls last, m.created_at desc
  )
  select coalesce(sum(amt), 0)::numeric from per_agent;
$$;

-- 4. Unified per-trip, per-agent commission (partner tier OR ordinary mapping).
create or replace function public.transport_trip_agent_commission(p_trip_id uuid, p_transport_agent_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_trip public.transport_trips;
  v_partner_share numeric;
  v_is_partner boolean := false;
  v_toggle boolean;
  v_nonpartner numeric;
  v_residual numeric;
  v_map numeric;
begin
  select * into v_trip from public.transport_trips where id = p_trip_id and deleted_at is null;
  if v_trip.id is null then return 0; end if;

  select p.share_percentage into v_partner_share
  from public.transport_profit_share_partners p
  where p.transport_agent_id = p_transport_agent_id and p.is_active;
  v_is_partner := found;

  if v_is_partner then
    select coalesce(profit_share_enabled, true) into v_toggle
    from public.transport_trucks where id = v_trip.truck_id;
    if not coalesce(v_toggle, true) then return 0; end if;
    v_nonpartner := public.transport_trip_non_partner_agent_commission(p_trip_id);
    v_residual := greatest(coalesce(v_trip.company_margin, 0) - coalesce(v_nonpartner, 0), 0);
    return round((v_residual * coalesce(v_partner_share, 0) / 100)::numeric, 2);
  end if;

  select (
    case
      when m.commission_type = 'per_mt'
        then coalesce(m.commission_value, 0) * coalesce(v_trip.quantity_mt, 0)
      when m.commission_type = 'percentage_margin'
        then coalesce(v_trip.company_margin, 0) * coalesce(m.commission_value, 0) / 100
      else coalesce(m.commission_value, 0)
    end
    * coalesce(m.commission_share_percentage, 100) / 100
  )::numeric
  into v_map
  from public.transport_truck_agent_commission_mapping m
  where m.truck_id = v_trip.truck_id
    and m.transport_agent_id = p_transport_agent_id
    and m.is_active and m.deleted_at is null
    and (m.effective_from is null or m.effective_from <= v_trip.trip_date)
    and (m.effective_to  is null or m.effective_to  >= v_trip.trip_date)
  order by m.effective_from desc nulls last, m.created_at desc
  limit 1;

  return coalesce(v_map, 0);
end;
$$;

-- 5. Redefine earned commission to funnel through the unified calculator -----
create or replace function public.transport_agent_completed_commission(p_transport_agent_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(public.transport_trip_agent_commission(t.id, p_transport_agent_id)), 0)::numeric
  from public.transport_trips t
  where t.deleted_at is null and t.status = 'closed';
$$;

revoke all on function public.transport_agent_completed_commission(uuid) from public, anon, authenticated;

-- 6. Agent portal dashboard (partner-aware) ----------------------------------
create or replace function public.transport_agent_portal_dashboard(
  p_session_token text,
  p_transport_agent_id uuid
)
returns table(
  total_trips bigint,
  active_trips bigint,
  completed_trips bigint,
  total_quantity_mt numeric,
  total_commission numeric,
  mapped_trucks bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_portal_user_id uuid;
  v_is_partner boolean;
begin
  select s.portal_user_id into v_portal_user_id
  from public.transport_portal_validate_session(p_session_token) s;

  if not exists (
    select 1 from public.transport_agent_portal_access a
    where a.portal_user_id = v_portal_user_id
      and a.transport_agent_id = p_transport_agent_id
      and a.is_active
  ) then
    raise exception 'Access denied for this agent';
  end if;

  select exists (
    select 1 from public.transport_profit_share_partners p
    where p.transport_agent_id = p_transport_agent_id and p.is_active
  ) into v_is_partner;

  return query
  with agent_trips as (
    select
      t.id,
      t.status,
      t.quantity_mt,
      public.transport_trip_agent_commission(t.id, p_transport_agent_id) as commission_amount
    from public.transport_trips t
    left join public.transport_trucks tk on tk.id = t.truck_id
    where t.deleted_at is null
      and (
        (v_is_partner and coalesce(tk.profit_share_enabled, true))
        or exists (
          select 1 from public.transport_truck_agent_commission_mapping m
          where m.truck_id = t.truck_id
            and m.transport_agent_id = p_transport_agent_id
            and m.is_active and m.deleted_at is null
            and (m.effective_from is null or m.effective_from <= t.trip_date)
            and (m.effective_to  is null or m.effective_to  >= t.trip_date)
        )
      )
  )
  select
    count(*)::bigint,
    count(*) filter (where agent_trips.status <> 'completed' and agent_trips.status <> 'closed')::bigint,
    count(*) filter (where agent_trips.status in ('completed','closed'))::bigint,
    coalesce(sum(agent_trips.quantity_mt), 0)::numeric,
    coalesce(sum(agent_trips.commission_amount), 0)::numeric,
    (
      select count(distinct tk2.id)
      from public.transport_trucks tk2
      where tk2.deleted_at is null
        and (
          (v_is_partner and coalesce(tk2.profit_share_enabled, true))
          or exists (
            select 1 from public.transport_truck_agent_commission_mapping m
            where m.truck_id = tk2.id
              and m.transport_agent_id = p_transport_agent_id
              and m.is_active and m.deleted_at is null
          )
        )
    )::bigint;
end;
$$;

-- 7. Agent portal per-trip list (partner-aware) ------------------------------
create or replace function public.transport_agent_portal_trips(
  p_session_token text,
  p_transport_agent_id uuid
)
returns table(
  id uuid,
  trip_no text,
  status text,
  trip_date date,
  quantity_mt numeric,
  route_name text,
  commodity_name text,
  truck_no text,
  registration_no text,
  driver_name text,
  transporter_name text,
  commission_type text,
  commission_value numeric,
  commission_amount numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_portal_user_id uuid;
  v_is_partner boolean;
  v_partner_share numeric;
begin
  select s.portal_user_id into v_portal_user_id
  from public.transport_portal_validate_session(p_session_token) s;

  if not exists (
    select 1 from public.transport_agent_portal_access a
    where a.portal_user_id = v_portal_user_id
      and a.transport_agent_id = p_transport_agent_id
      and a.is_active
  ) then
    raise exception 'Access denied for this agent';
  end if;

  select p.share_percentage into v_partner_share
  from public.transport_profit_share_partners p
  where p.transport_agent_id = p_transport_agent_id and p.is_active;
  v_is_partner := found;

  return query
  select
    t.id,
    t.trip_no,
    t.status,
    t.trip_date,
    t.quantity_mt,
    r.name,
    cm.name,
    tk.name,
    tk.registration_no,
    d.name,
    tr.name,
    case when v_is_partner then 'profit_share' else map.commission_type end,
    case when v_is_partner then v_partner_share else map.commission_value end,
    public.transport_trip_agent_commission(t.id, p_transport_agent_id)
  from public.transport_trips t
  left join public.transport_trucks tk on tk.id = t.truck_id
  left join lateral (
    select m.commission_type, m.commission_value
    from public.transport_truck_agent_commission_mapping m
    where m.truck_id = t.truck_id
      and m.transport_agent_id = p_transport_agent_id
      and m.is_active and m.deleted_at is null
      and (m.effective_from is null or m.effective_from <= t.trip_date)
      and (m.effective_to  is null or m.effective_to  >= t.trip_date)
    order by m.effective_from desc nulls last, m.created_at desc
    limit 1
  ) map on true
  left join public.transport_route_master r on r.id = t.route_id
  left join public.transport_commodities cm on cm.id = t.transport_commodity_id
  left join public.transport_drivers d on d.id = t.driver_id
  left join public.transport_transporters tr on tr.id = t.transport_transporter_id
  where t.deleted_at is null
    and (
      (v_is_partner and coalesce(tk.profit_share_enabled, true))
      or map.commission_type is not null
    )
  order by t.trip_date desc nulls last, t.created_at desc;
end;
$$;

grant execute on function public.transport_agent_portal_dashboard(text, uuid) to anon, authenticated;
grant execute on function public.transport_agent_portal_trips(text, uuid) to anon, authenticated;

-- 8. RLS for the partner config (admin-managed; readable by authenticated) ----
alter table public.transport_profit_share_partners enable row level security;

drop policy if exists profit_share_partners_read on public.transport_profit_share_partners;
drop policy if exists profit_share_partners_write on public.transport_profit_share_partners;

-- Any authenticated staff user may read the partner config (the trip screen and
-- reporting need it). Writes are gated to admins / the mapping-page edit
-- permission, mirroring transport_truck_agent_commission_mapping.
create policy profit_share_partners_read on public.transport_profit_share_partners
  for select to authenticated using (true);

create policy profit_share_partners_write on public.transport_profit_share_partners
  for all to authenticated
  using (
    public.is_super_admin()
    or public.has_role_code('admin')
    or public.has_permission('transport-truck-agent-commission-mapping', 'edit')
  )
  with check (
    public.is_super_admin()
    or public.has_role_code('admin')
    or public.has_permission('transport-truck-agent-commission-mapping', 'edit')
  );

notify pgrst, 'reload schema';
