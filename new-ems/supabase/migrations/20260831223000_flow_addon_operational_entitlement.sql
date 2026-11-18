-- A paid Flow add-on must unlock both the workspace module and executable
-- automation capacity when the base package does not include Flow.
update public.whatsapp_platform_addon_master
set entitlement_effects = coalesce(entitlement_effects, '{}'::jsonb)
  || jsonb_build_object(
    'flows', true,
    'flow_limit', greatest(coalesce(nullif(entitlement_effects ->> 'flow_limit', '')::integer, 0), 25)
  ),
  updated_at = now()
where code = 'flow';

comment on column public.whatsapp_platform_addon_master.entitlement_effects is
  'Operational feature flags and additive limits granted by each active add-on assignment.';
