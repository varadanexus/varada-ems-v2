-- Keep the production Varada Nexus welcome journey in a readable tree layout.
-- This is intentionally scoped to the flow created for the primary workspace.
update public.whatsapp_platform_flows
set nodes = (
  select jsonb_agg(
    jsonb_set(
      jsonb_set(node, '{x}', to_jsonb(layout.x), true),
      '{y}', to_jsonb(layout.y), true
    )
    order by ordinal
  )
  from jsonb_array_elements(nodes) with ordinality as item(node, ordinal)
  cross join lateral (
    select
      case node->>'id'
        when 'd22106ec-e918-4548-bf84-1f47cbdc4cad' then 80
        when '92056ea3-24f9-452f-8307-da7485af46a5' then 460
        when 'a4fc5909-46a6-4102-b719-5cb53e29d76d' then 840
        when '4bd72ada-2bf1-41d2-9ae2-b68e9ce430ac' then 840
        when '1aa3387d-0ee4-4762-89f6-63b1d2728823' then 840
        when 'a11e187f-e8e6-4392-9094-ff05d9ecd108' then 1220
        when 'a8ebe897-1758-4d4a-903e-eacd6dde0589' then 1220
        when '4f162a38-4dbd-4c40-b165-79c81f1e9cb5' then 1220
        when '477b0c1b-f113-4127-9b1f-599180bad8f0' then 1220
        when 'ed2a6a06-c907-4b3a-a060-e4d8f5fcd02d' then 1220
        when 'b0b7fd36-a8de-4daa-959f-585de7822f1f' then 1220
        when 'fd639722-f753-41e8-8a23-d34edde1ef57' then 1220
        when '6f134cd8-054a-4704-af8e-ec7a5ec64c90' then 1220
        when '363816c3-a04b-4908-bc1b-0bb6c45fa28d' then 1220
        when 'abb9b14d-444b-4c82-882c-2f76a0bd8f30' then 1600
        when '11b23127-5f1c-47f5-b21b-dd5b52224b42' then 1600
        when '99e793b1-c41e-4fe3-beba-2e46384f434e' then 1600
        else greatest(80, coalesce((node->>'x')::integer, 80))
      end as x,
      case node->>'id'
        when 'd22106ec-e918-4548-bf84-1f47cbdc4cad' then 1458
        when '92056ea3-24f9-452f-8307-da7485af46a5' then 1458
        when 'a4fc5909-46a6-4102-b719-5cb53e29d76d' then 400
        when '4bd72ada-2bf1-41d2-9ae2-b68e9ce430ac' then 1420
        when '1aa3387d-0ee4-4762-89f6-63b1d2728823' then 2553
        when 'a8ebe897-1758-4d4a-903e-eacd6dde0589' then 60
        when '4f162a38-4dbd-4c40-b165-79c81f1e9cb5' then 400
        when '477b0c1b-f113-4127-9b1f-599180bad8f0' then 740
        when 'ed2a6a06-c907-4b3a-a060-e4d8f5fcd02d' then 1080
        when 'b0b7fd36-a8de-4daa-959f-585de7822f1f' then 1420
        when 'fd639722-f753-41e8-8a23-d34edde1ef57' then 1760
        when '6f134cd8-054a-4704-af8e-ec7a5ec64c90' then 2100
        when '363816c3-a04b-4908-bc1b-0bb6c45fa28d' then 2440
        when 'a11e187f-e8e6-4392-9094-ff05d9ecd108' then 3120
        when 'abb9b14d-444b-4c82-882c-2f76a0bd8f30' then 2780
        when '11b23127-5f1c-47f5-b21b-dd5b52224b42' then 3120
        when '99e793b1-c41e-4fe3-beba-2e46384f434e' then 3460
        else greatest(40, coalesce((node->>'y')::integer, 40))
      end as y
  ) as layout
)
where id = 'bb009413-5aa1-4aa4-9320-47cc7141727d'::uuid;

notify pgrst, 'reload schema';
