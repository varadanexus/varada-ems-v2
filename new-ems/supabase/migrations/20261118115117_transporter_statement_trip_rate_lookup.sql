create or replace function public.list_transport_transporter_statementable_trips(p_division_id uuid, p_transport_transporter_id uuid)
returns table (trip_id uuid, trip_no text, trip_date date, quantity_mt numeric, transporter_rate_per_mt numeric,
               transporter_gross_payable numeric, support_deduction_amount numeric, transporter_net_payable numeric)
language sql stable security invoker
as $$
  with priced as (
    select t.id, t.trip_no, t.trip_date, coalesce(t.quantity_mt, 0) as qty,
           coalesce(t.transporter_rate_per_mt, (
             select coalesce(m.transporter_rate_per_mt, m.rate_per_mt)
             from public.transport_rate_master m
             where m.division_id = t.division_id and m.transport_client_id = t.transport_client_id
               and m.transport_transporter_id = t.transport_transporter_id
               and m.transport_commodity_id = t.transport_commodity_id and m.route_id = t.route_id
               and m.deleted_at is null and m.is_active
               and m.effective_from <= t.trip_date and (m.effective_to is null or m.effective_to >= t.trip_date)
               and m.truck_owner_id is null and (m.truck_id is null or m.truck_id = t.truck_id)
             order by (m.truck_id is not null) desc, m.effective_from desc, m.id
             limit 1
           )) as rate,
           coalesce((select round(sum(e.amount), 2) from public.transport_trip_expenses e
                     where e.trip_id = t.id and e.deleted_at is null and coalesce(e.is_active, true)), 0) as deduction
    from public.transport_trips t
    where t.deleted_at is null and t.division_id = p_division_id and t.transport_transporter_id = p_transport_transporter_id
      and t.status in ('completed','financial_review')
      and not exists (
        select 1 from public.transport_transporter_statement_trips st
        join public.transport_transporter_statements s on s.id = st.statement_id
        where st.trip_id = t.id and st.deleted_at is null and s.deleted_at is null and s.status <> 'cancelled'
      )
  )
  select id, trip_no, trip_date, round(qty, 3), round(rate, 3), round(qty * rate, 2), deduction,
         round(qty * rate - deduction, 2)
  from priced where rate is not null order by trip_date, trip_no;
$$;
