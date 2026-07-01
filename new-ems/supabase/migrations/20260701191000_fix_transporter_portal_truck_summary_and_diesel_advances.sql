-- Fix transporter portal truck summary labels and expose transporter-scoped diesel/advance expenses.

drop function if exists public.transport_transporter_portal_trips(text, uuid);

create or replace function public.transport_transporter_portal_trips(p_session_token text, p_transport_transporter_id uuid)
returns table(
  id uuid,
  trip_no text,
  status text,
  trip_date date,
  quantity_mt numeric,
  transporter_rate_per_mt numeric,
  transporter_gross_amount numeric,
  truck_id uuid,
  truck_no text,
  vehicle_no text,
  registration_no text,
  transporter_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_portal_user_id uuid;
begin
  select portal_user_id into v_portal_user_id from public.transport_portal_validate_session(p_session_token);
  if not exists (
    select 1
    from public.transport_transporter_portal_access a
    where a.portal_user_id = v_portal_user_id
      and a.transport_transporter_id = p_transport_transporter_id
      and a.is_active
  ) then
    raise exception 'Access denied for this transporter';
  end if;

  return query
  select
    t.id,
    t.trip_no,
    t.status,
    t.trip_date,
    t.quantity_mt,
    t.transporter_rate_per_mt,
    t.transporter_gross_amount,
    t.truck_id,
    trk.name as truck_no,
    trk.name as vehicle_no,
    trk.registration_no,
    tt.name as transporter_name
  from public.transport_trips t
  left join public.transport_trucks trk on trk.id = t.truck_id and trk.deleted_at is null
  left join public.transport_transporters tt on tt.id = t.transport_transporter_id and tt.deleted_at is null
  where t.transport_transporter_id = p_transport_transporter_id
    and t.deleted_at is null
  order by t.trip_date desc nulls last, t.created_at desc;
end;
$$;

grant execute on function public.transport_transporter_portal_trips(text, uuid) to anon, authenticated;

create or replace function public.transport_transporter_portal_diesel_advances(p_session_token text, p_transport_transporter_id uuid)
returns table(
  id uuid,
  expense_no text,
  expense_date date,
  trip_id uuid,
  trip_no text,
  truck_id uuid,
  truck_no text,
  vehicle_no text,
  registration_no text,
  driver_name text,
  category text,
  amount numeric,
  paid_by text,
  notes text,
  linked_statement_no text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_portal_user_id uuid;
begin
  select portal_user_id into v_portal_user_id from public.transport_portal_validate_session(p_session_token);
  if not exists (
    select 1
    from public.transport_transporter_portal_access a
    where a.portal_user_id = v_portal_user_id
      and a.transport_transporter_id = p_transport_transporter_id
      and a.is_active
  ) then
    raise exception 'Access denied for this transporter';
  end if;

  return query
  with linked_statements as (
    select distinct on (st.trip_id)
      st.trip_id,
      s.statement_no
    from public.transport_transporter_statement_trips st
    join public.transport_transporter_statements s on s.id = st.statement_id
    where s.transport_transporter_id = p_transport_transporter_id
      and s.deleted_at is null
      and st.deleted_at is null
    order by st.trip_id, s.statement_date desc nulls last, s.created_at desc
  )
  select
    e.id,
    e.expense_no,
    e.expense_date,
    t.id as trip_id,
    t.trip_no,
    t.truck_id,
    trk.name as truck_no,
    trk.name as vehicle_no,
    trk.registration_no,
    drv.name as driver_name,
    e.category,
    e.amount,
    e.paid_by,
    e.notes,
    ls.statement_no as linked_statement_no
  from public.transport_trip_expenses e
  join public.transport_trips t on t.id = e.trip_id
  left join public.transport_trucks trk on trk.id = t.truck_id and trk.deleted_at is null
  left join public.transport_drivers drv on drv.id = t.driver_id and drv.deleted_at is null
  left join linked_statements ls on ls.trip_id = t.id
  where t.transport_transporter_id = p_transport_transporter_id
    and t.deleted_at is null
    and e.deleted_at is null
    and (
      lower(coalesce(e.category, '')) in ('diesel', 'diesel advance', 'fuel', 'support', 'advance')
      or lower(coalesce(e.category, '')) like '%diesel%'
      or lower(coalesce(e.category, '')) like '%fuel%'
      or lower(coalesce(e.category, '')) like '%advance%'
      or lower(coalesce(e.category, '')) like '%support%'
    )
  order by e.expense_date desc nulls last, e.created_at desc;
end;
$$;

grant execute on function public.transport_transporter_portal_diesel_advances(text, uuid) to anon, authenticated;