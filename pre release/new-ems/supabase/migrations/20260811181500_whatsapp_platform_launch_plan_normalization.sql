-- Retire the legacy `starter` tenant code in favour of the public catalog's
-- canonical Launch package. Existing workspaces retain the same entitlement.

alter table public.whatsapp_platform_tenants
  alter column plan_code set default 'launch';

update public.whatsapp_platform_tenants
set plan_code = 'launch', updated_at = now()
where plan_code = 'starter';

create or replace function public.whatsapp_platform_admin_update_tenant(
  p_tenant_id uuid,
  p_status text,
  p_plan_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant public.whatsapp_platform_tenants;
  v_plan_code text := case when p_plan_code = 'starter' then 'launch' else p_plan_code end;
begin
  if not public.has_permission('whatsapp-platform', 'edit') then
    raise exception 'Not authorized to manage WhatsApp Platform customers'
      using errcode = '42501';
  end if;
  if p_status not in ('active', 'suspended', 'closed') then
    raise exception 'Invalid customer status' using errcode = '22023';
  end if;
  if v_plan_code not in ('launch', 'growth', 'enterprise') then
    raise exception 'Invalid plan code' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.whatsapp_platform_plans
    where code = v_plan_code and is_active
  ) then
    raise exception 'Selected package is not active' using errcode = '22023';
  end if;

  update public.whatsapp_platform_tenants
  set status = p_status,
      plan_code = v_plan_code,
      updated_at = now()
  where id = p_tenant_id
  returning * into v_tenant;

  if v_tenant.id is null then
    raise exception 'Customer workspace not found' using errcode = 'P0002';
  end if;

  if p_status <> 'active' then
    update public.whatsapp_platform_sessions s
    set revoked_at = coalesce(s.revoked_at, now())
    where s.user_id in (
      select u.id from public.whatsapp_platform_users u where u.tenant_id = p_tenant_id
    ) and s.revoked_at is null;
  end if;

  return jsonb_build_object(
    'id', v_tenant.id,
    'status', v_tenant.status,
    'planCode', v_tenant.plan_code,
    'updatedAt', v_tenant.updated_at
  );
end;
$$;

revoke all on function public.whatsapp_platform_admin_update_tenant(uuid, text, text) from public, anon;
grant execute on function public.whatsapp_platform_admin_update_tenant(uuid, text, text) to authenticated, service_role;

notify pgrst, 'reload schema';
