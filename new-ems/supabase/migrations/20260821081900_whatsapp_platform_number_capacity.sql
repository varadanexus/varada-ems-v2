-- Enforce paid WhatsApp-number capacity from Package Master and active add-ons.
-- Developer test numbers never consume production capacity. The oldest production
-- connection is the primary number and is never restricted by an add-on reduction.

create or replace function public.whatsapp_platform_reconcile_number_capacity(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base_limit integer;
  v_additional_limit integer := 0;
  v_allowed_limit integer;
  v_position integer := 0;
  v_active_count integer := 0;
  v_blocked_count integer := 0;
  v_primary_id uuid;
  v_blocked_ids jsonb := '[]'::jsonb;
  v_connection record;
  v_prior_status text;
begin
  select p.whatsapp_number_limit
    into v_base_limit
  from public.whatsapp_platform_tenants t
  left join public.whatsapp_platform_package_master p
    on p.code = case when t.plan_code = 'starter' then 'launch' else t.plan_code end
   and p.status = 'active'
  where t.id = p_tenant_id;

  if not found then
    raise exception 'Customer workspace not found.' using errcode = 'P0002';
  end if;

  select coalesce(sum(
    greatest(ta.quantity, 0)
    * greatest(coalesce(nullif(a.entitlement_effects ->> 'whatsapp_number_limit', '')::integer, 0), 0)
  ), 0)::integer
  into v_additional_limit
  from public.whatsapp_platform_tenant_addons ta
  join public.whatsapp_platform_addon_master a on a.code = ta.addon_code
  where ta.tenant_id = p_tenant_id
    and ta.status = 'active'
    and a.status = 'active';

  v_allowed_limit := case when v_base_limit is null then null else v_base_limit + v_additional_limit end;

  for v_connection in
    select c.id, c.status, coalesce(c.onboarding_metadata, '{}'::jsonb) as metadata
    from public.whatsapp_platform_connections c
    where c.tenant_id = p_tenant_id
      and c.status <> 'disconnected'
      and coalesce(c.onboarding_metadata ->> 'test_number', 'false') <> 'true'
    order by
      case when c.onboarding_metadata ->> 'billing_primary' = 'true' then 0 else 1 end,
      c.connected_at asc nulls last,
      c.created_at asc,
      c.id asc
  loop
    v_position := v_position + 1;
    if v_position = 1 then v_primary_id := v_connection.id; end if;

    if v_allowed_limit is null or v_position <= v_allowed_limit then
      v_active_count := v_active_count + 1;
      if v_connection.metadata ->> 'billing_restricted' = 'true' then
        v_prior_status := case v_connection.metadata ->> 'billing_prior_status'
          when 'connected' then 'connected'
          when 'pending' then 'pending'
          when 'not_connected' then 'not_connected'
          when 'restricted' then 'restricted'
          else 'connected'
        end;
        update public.whatsapp_platform_connections
        set status = v_prior_status,
            onboarding_metadata = (
              v_connection.metadata
              - 'billing_restricted_at'
              - 'billing_restriction_reason'
              - 'billing_prior_status'
            ) || jsonb_build_object(
              'billing_restricted', false,
              'billing_primary', v_position = 1
            ),
            updated_at = now()
        where id = v_connection.id;
      else
        update public.whatsapp_platform_connections
        set onboarding_metadata = v_connection.metadata || jsonb_build_object(
              'billing_restricted', false,
              'billing_primary', v_position = 1
            ),
            updated_at = now()
        where id = v_connection.id
          and (
            coalesce(v_connection.metadata ->> 'billing_primary', 'false') <> (v_position = 1)::text
            or v_connection.metadata ->> 'billing_restricted' is distinct from 'false'
          );
      end if;
    else
      v_blocked_count := v_blocked_count + 1;
      v_blocked_ids := v_blocked_ids || jsonb_build_array(v_connection.id);
      v_prior_status := case
        when v_connection.metadata ->> 'billing_restricted' = 'true'
          then coalesce(v_connection.metadata ->> 'billing_prior_status', 'connected')
        else v_connection.status
      end;
      update public.whatsapp_platform_connections
      set status = 'restricted',
          onboarding_metadata = v_connection.metadata || jsonb_build_object(
            'billing_restricted', true,
            'billing_restricted_at', now(),
            'billing_restriction_reason', 'additional_number_payment_required',
            'billing_prior_status', v_prior_status,
            'billing_primary', false
          ),
          updated_at = now()
      where id = v_connection.id;
    end if;
  end loop;

  return jsonb_build_object(
    'baseLimit', v_base_limit,
    'additionalLimit', v_additional_limit,
    'allowedLimit', v_allowed_limit,
    'productionCount', v_position,
    'activeCount', v_active_count,
    'blockedCount', v_blocked_count,
    'available', case when v_allowed_limit is null then null else greatest(v_allowed_limit - v_active_count, 0) end,
    'primaryConnectionId', v_primary_id,
    'blockedConnectionIds', v_blocked_ids,
    'addonCode', 'extra_whatsapp_number'
  );
end;
$$;
revoke all on function public.whatsapp_platform_reconcile_number_capacity(uuid) from public;
grant execute on function public.whatsapp_platform_reconcile_number_capacity(uuid) to service_role;

create or replace function public.whatsapp_platform_reconcile_number_capacity_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.whatsapp_platform_reconcile_number_capacity(coalesce(new.tenant_id, old.tenant_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists whatsapp_platform_tenant_addons_reconcile_numbers on public.whatsapp_platform_tenant_addons;
create trigger whatsapp_platform_tenant_addons_reconcile_numbers
after insert or update of quantity, status, addon_code or delete
on public.whatsapp_platform_tenant_addons
for each row execute function public.whatsapp_platform_reconcile_number_capacity_trigger();

create or replace function public.whatsapp_platform_reconcile_tenant_plan_number_capacity_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.whatsapp_platform_reconcile_number_capacity(new.id);
  return new;
end;
$$;

drop trigger if exists whatsapp_platform_tenant_plan_reconcile_numbers on public.whatsapp_platform_tenants;
create trigger whatsapp_platform_tenant_plan_reconcile_numbers
after update of plan_code on public.whatsapp_platform_tenants
for each row
when (old.plan_code is distinct from new.plan_code)
execute function public.whatsapp_platform_reconcile_tenant_plan_number_capacity_trigger();

create or replace function public.whatsapp_platform_reconcile_package_number_capacity_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_tenant record;
begin
  for v_tenant in
    select id from public.whatsapp_platform_tenants
    where case when plan_code = 'starter' then 'launch' else plan_code end = new.code
  loop
    perform public.whatsapp_platform_reconcile_number_capacity(v_tenant.id);
  end loop;
  return new;
end;
$$;

drop trigger if exists whatsapp_platform_package_limit_reconcile_numbers on public.whatsapp_platform_package_master;
create trigger whatsapp_platform_package_limit_reconcile_numbers
after update of whatsapp_number_limit, status on public.whatsapp_platform_package_master
for each row
when (
  old.whatsapp_number_limit is distinct from new.whatsapp_number_limit
  or old.status is distinct from new.status
)
execute function public.whatsapp_platform_reconcile_package_number_capacity_trigger();

do $$
declare v_tenant record;
begin
  for v_tenant in select id from public.whatsapp_platform_tenants loop
    perform public.whatsapp_platform_reconcile_number_capacity(v_tenant.id);
  end loop;
end;
$$;
