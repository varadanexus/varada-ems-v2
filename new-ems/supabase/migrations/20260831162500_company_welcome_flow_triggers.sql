-- Natural entry phrases for the live Varada Nexus company welcome journey.
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

notify pgrst, 'reload schema';
