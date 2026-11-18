-- Refuse deployment if the production company welcome flow is incomplete.
-- This keeps the visual builder, saved graph and runtime button routing aligned.
do $$
declare
  target_flow public.whatsapp_platform_flows%rowtype;
  node_count integer;
  edge_count integer;
  button_count integer;
  routed_button_count integer;
  invalid_edge_count integer;
  invalid_incoming_count integer;
  invalid_leaf_count integer;
  handoff_count integer;
begin
  select * into target_flow
  from public.whatsapp_platform_flows
  where id = 'bb009413-5aa1-4aa4-9320-47cc7141727d'::uuid;
  if not found then
    raise exception 'Company welcome flow is missing';
  end if;

  node_count := jsonb_array_length(target_flow.nodes);
  edge_count := jsonb_array_length(target_flow.edges);
  if target_flow.status <> 'active' or node_count <> 17 or edge_count <> 16 then
    raise exception 'Company welcome flow has invalid status or graph size: status %, nodes %, edges %',
      target_flow.status, node_count, edge_count;
  end if;

  if target_flow.trigger_type <> 'keyword'
     or not coalesce(target_flow.trigger_config->'keywords', '[]'::jsonb)
       @> '["hi","hello","hey","start","menu"]'::jsonb then
    raise exception 'Company welcome flow entry keywords are incomplete';
  end if;

  select count(*) into invalid_edge_count
  from jsonb_array_elements(target_flow.edges) as edge
  where not exists (
    select 1 from jsonb_array_elements(target_flow.nodes) as node where node->>'id' = edge->>'from'
  ) or not exists (
    select 1 from jsonb_array_elements(target_flow.nodes) as node where node->>'id' = edge->>'to'
  );
  if invalid_edge_count <> 0 then
    raise exception 'Company welcome flow contains % edge(s) with missing endpoints', invalid_edge_count;
  end if;

  select count(*) into button_count
  from jsonb_array_elements(target_flow.nodes) as node
  cross join lateral jsonb_array_elements(coalesce(node->'config'->'buttons', '[]'::jsonb))
    with ordinality as button(value, ordinal)
  where nullif(btrim(button.value->>'label'), '') is not null;

  select count(*) into routed_button_count
  from jsonb_array_elements(target_flow.nodes) as node
  cross join lateral jsonb_array_elements(coalesce(node->'config'->'buttons', '[]'::jsonb))
    with ordinality as button(value, ordinal)
  where nullif(btrim(button.value->>'label'), '') is not null
    and nullif(button.value->>'next', '') is not null
    and exists (
      select 1
      from jsonb_array_elements(target_flow.edges) as edge
      where edge->>'from' = node->>'id'
        and edge->>'to' = button.value->>'next'
        and (edge->>'fromButton')::integer = button.ordinal - 1
    );
  if button_count <> 15 or routed_button_count <> button_count then
    raise exception 'Company welcome flow has unrouted buttons: total %, routed %', button_count, routed_button_count;
  end if;

  select count(*) into invalid_incoming_count
  from jsonb_array_elements(target_flow.nodes) as node
  where node->>'type' <> 'start'
    and 1 <> (
      select count(*) from jsonb_array_elements(target_flow.edges) as edge
      where edge->>'to' = node->>'id'
    );
  if invalid_incoming_count <> 0 then
    raise exception 'Company welcome flow contains % disconnected or multiply-parented block(s)', invalid_incoming_count;
  end if;

  select count(*) into invalid_leaf_count
  from jsonb_array_elements(target_flow.nodes) as node
  where not exists (
    select 1 from jsonb_array_elements(target_flow.edges) as edge where edge->>'from' = node->>'id'
  ) and node->>'type' <> 'handoff';
  select count(*) into handoff_count
  from jsonb_array_elements(target_flow.nodes) as node
  where node->>'type' = 'handoff';
  if invalid_leaf_count <> 0 or handoff_count <> 11 then
    raise exception 'Company welcome flow leaf actions are invalid: invalid leaves %, handoffs %',
      invalid_leaf_count, handoff_count;
  end if;

  if exists (
    select 1 from jsonb_array_elements(target_flow.nodes) as node
    where (node->>'x')::integer < 0 or (node->>'y')::integer < 0
  ) then
    raise exception 'Company welcome flow contains out-of-canvas coordinates';
  end if;
end $$;
