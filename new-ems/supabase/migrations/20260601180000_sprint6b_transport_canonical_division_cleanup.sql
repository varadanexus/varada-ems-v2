-- Sprint 6B: canonical TRANSPORT division cleanup (non-destructive)
-- Goal: migrate references from code='transport' to code='TRANSPORT', then inactivate lowercase row.

do $$
declare
  v_canonical_id uuid;
  v_duplicate_id uuid;
begin
  select id into v_canonical_id
  from public.divisions
  where code = 'TRANSPORT' and name = 'Transportation'
  order by created_at asc
  limit 1;

  select id into v_duplicate_id
  from public.divisions
  where code = 'transport' and name = 'Transportation'
  order by created_at asc
  limit 1;

  if v_canonical_id is null or v_duplicate_id is null then
    return;
  end if;

  -- migrate references from duplicate -> canonical (transport-domain tables)
  update public.transport_trips set division_id = v_canonical_id where division_id = v_duplicate_id;
  update public.transport_rate_master set division_id = v_canonical_id where division_id = v_duplicate_id;
  update public.transport_client_mapping set division_id = v_canonical_id where division_id = v_duplicate_id;
  update public.transport_transporter_mapping set division_id = v_canonical_id where division_id = v_duplicate_id;
  update public.transport_truck_agent_commission_mapping set division_id = v_canonical_id where division_id = v_duplicate_id;
  update public.transport_truck_owners set division_id = v_canonical_id where division_id = v_duplicate_id;
  update public.transport_trucks set division_id = v_canonical_id where division_id = v_duplicate_id;
  update public.transport_drivers set division_id = v_canonical_id where division_id = v_duplicate_id;
  update public.transport_route_master set division_id = v_canonical_id where division_id = v_duplicate_id;
  update public.transport_clients set division_id = v_canonical_id where division_id = v_duplicate_id;
  update public.transport_transporters set division_id = v_canonical_id where division_id = v_duplicate_id;
  update public.transport_agents set division_id = v_canonical_id where division_id = v_duplicate_id;
  update public.transport_commodities set division_id = v_canonical_id where division_id = v_duplicate_id;

  -- if still referenced in user assignments, keep row active to avoid breaking admin mappings
  if exists (select 1 from public.user_divisions where division_id = v_duplicate_id) then
    return;
  end if;

  -- no delete; mark duplicate inactive
  update public.divisions
  set is_active = false
  where id = v_duplicate_id;
end $$;

-- Diagnostic query (run manually for reporting):
-- select id, code, name, is_active from divisions order by code, name;
