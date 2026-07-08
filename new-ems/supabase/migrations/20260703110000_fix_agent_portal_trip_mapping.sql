-- Agent portal trips are related to an agent through the effective
-- truck-agent commission mapping. transport_trips has no transport_agent_id.

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
begin
  select s.portal_user_id
  into v_portal_user_id
  from public.transport_portal_validate_session(p_session_token) s;

  if not exists (
    select 1
    from public.transport_agent_portal_access a
    where a.portal_user_id = v_portal_user_id
      and a.transport_agent_id = p_transport_agent_id
      and a.is_active
  ) then
    raise exception 'Access denied for this agent';
  end if;

  return query
  with agent_trips as (
    select
      t.id,
      t.status,
      t.quantity_mt,
      mapping.commission_amount
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
  )
  select
    count(*)::bigint,
    count(*) filter (where agent_trips.status <> 'completed')::bigint,
    count(*) filter (where agent_trips.status = 'completed')::bigint,
    coalesce(sum(agent_trips.quantity_mt), 0)::numeric,
    coalesce(sum(agent_trips.commission_amount), 0)::numeric,
    (
      select count(distinct m.truck_id)
      from public.transport_truck_agent_commission_mapping m
      where m.transport_agent_id = p_transport_agent_id
        and m.is_active
        and m.deleted_at is null
    )::bigint;
end;
$$;

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
begin
  select s.portal_user_id
  into v_portal_user_id
  from public.transport_portal_validate_session(p_session_token) s;

  if not exists (
    select 1
    from public.transport_agent_portal_access a
    where a.portal_user_id = v_portal_user_id
      and a.transport_agent_id = p_transport_agent_id
      and a.is_active
  ) then
    raise exception 'Access denied for this agent';
  end if;

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
    mapping.commission_type,
    mapping.commission_value,
    mapping.commission_amount
  from public.transport_trips t
  join lateral (
    select
      m.commission_type,
      m.commission_value,
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
  left join public.transport_route_master r on r.id = t.route_id
  left join public.transport_commodities cm on cm.id = t.transport_commodity_id
  left join public.transport_trucks tk on tk.id = t.truck_id
  left join public.transport_drivers d on d.id = t.driver_id
  left join public.transport_transporters tr on tr.id = t.transport_transporter_id
  where t.deleted_at is null
  order by t.trip_date desc nulls last, t.created_at desc;
end;
$$;

grant execute on function public.transport_agent_portal_dashboard(text, uuid) to anon, authenticated;
grant execute on function public.transport_agent_portal_trips(text, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
