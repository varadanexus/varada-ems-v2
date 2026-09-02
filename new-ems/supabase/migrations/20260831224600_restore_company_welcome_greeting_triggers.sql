-- Restore the intended natural-language entry phrases after an older builder
-- draft saved only the original "menu" keyword.
update public.whatsapp_platform_flows
set trigger_type = 'keyword',
    trigger_config = jsonb_set(
      coalesce(trigger_config, '{}'::jsonb),
      '{keywords}',
      '["hi","hello","hey","start","menu"]'::jsonb,
      true
    ),
    nodes = (
      select jsonb_agg(
        case
          when node->>'type' = 'start' then
            jsonb_set(node, '{config,keywords}', to_jsonb('hi,hello,hey,start,menu'::text), true)
          else node
        end
        order by ordinal
      )
      from jsonb_array_elements(nodes) with ordinality as item(node, ordinal)
    ),
    updated_at = now()
where id = 'bb009413-5aa1-4aa4-9320-47cc7141727d'::uuid;
do $$
declare
  configured_keywords jsonb;
  start_keywords text;
begin
  select flow.trigger_config->'keywords', start_node.node->'config'->>'keywords'
  into configured_keywords, start_keywords
  from public.whatsapp_platform_flows as flow
  left join lateral (
    select node from jsonb_array_elements(flow.nodes) as node where node->>'type' = 'start' limit 1
  ) as start_node on true
  where flow.id = 'bb009413-5aa1-4aa4-9320-47cc7141727d'::uuid;

  if not configured_keywords @> '["hi","hello","hey","start","menu"]'::jsonb
     or start_keywords <> 'hi,hello,hey,start,menu' then
    raise exception 'Company welcome greeting triggers were not restored';
  end if;
end $$;
