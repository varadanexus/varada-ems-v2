-- Sprint 13E.10 (applied to remote via MCP: client_portal_trips_enriched)
-- Enrich client portal trips RPC with route, commodity, truck, driver.
drop function if exists public.transport_client_portal_trips(text, uuid);

create function public.transport_client_portal_trips(p_session_token text, p_transport_client_id uuid)
returns table(
  id uuid, trip_no text, status text, trip_date date,
  quantity_mt numeric, client_rate_per_mt numeric, client_gross_amount numeric,
  route_name text, commodity_name text, truck_no text, registration_no text, driver_name text
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_portal_user_id uuid;
begin
  select portal_user_id into v_portal_user_id from public.transport_portal_validate_session(p_session_token);
  if not exists (select 1 from public.transport_client_portal_access a where a.portal_user_id = v_portal_user_id and a.transport_client_id = p_transport_client_id and a.is_active) then
    raise exception 'Access denied for this client';
  end if;

  return query
  select t.id, t.trip_no, t.status, t.trip_date, t.quantity_mt, t.client_rate_per_mt, t.client_gross_amount,
         r.name as route_name,
         cm.name as commodity_name,
         tk.name as truck_no,
         tk.registration_no,
         d.name as driver_name
  from public.transport_trips t
  left join public.transport_route_master r on r.id = t.route_id
  left join public.transport_commodities cm on cm.id = t.transport_commodity_id
  left join public.transport_trucks tk on tk.id = t.truck_id
  left join public.transport_drivers d on d.id = t.driver_id
  where t.transport_client_id = p_transport_client_id and t.deleted_at is null
  order by t.trip_date desc nulls last, t.created_at desc;
end;
$function$;
