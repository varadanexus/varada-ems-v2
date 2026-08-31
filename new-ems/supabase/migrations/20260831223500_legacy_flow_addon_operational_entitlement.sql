-- Older billing catalogs used ad-flow for the Flow product. Preserve that
-- immutable billing identity while attaching the operational entitlement.
update public.whatsapp_platform_addon_master
set entitlement_effects = coalesce(entitlement_effects, '{}'::jsonb)
  || jsonb_build_object(
    'flows', true,
    'flow_limit', greatest(coalesce(nullif(entitlement_effects ->> 'flow_limit', '')::integer, 0), 25)
  ),
  updated_at = now()
where code in ('flow', 'ad-flow');
