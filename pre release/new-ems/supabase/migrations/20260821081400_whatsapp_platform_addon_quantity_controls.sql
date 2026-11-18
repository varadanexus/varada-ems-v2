-- Package Master controls whether customers buy an add-on once or choose a
-- quantity. The server remains authoritative even if a browser is modified.

alter table public.whatsapp_platform_addon_master
  add column if not exists quantity_enabled boolean not null default true;

update public.whatsapp_platform_addon_master
set quantity_enabled=false, minimum_quantity=1, maximum_quantity=1, quantity_step=1, updated_at=now()
where code in ('flow','priority_support');

update public.whatsapp_platform_addon_master
set quantity_enabled=true, updated_at=now()
where code in ('extra_agent_seat','extra_whatsapp_number','extra_integration');

alter table public.whatsapp_platform_addon_master
  drop constraint if exists whatsapp_platform_addon_master_fixed_quantity_check;
alter table public.whatsapp_platform_addon_master
  add constraint whatsapp_platform_addon_master_fixed_quantity_check
  check (quantity_enabled or (minimum_quantity=1 and maximum_quantity=1 and quantity_step=1));

create or replace function public.whatsapp_platform_admin_set_tenant_addon(p_tenant_id uuid,p_addon_code text,p_quantity integer,p_status text default 'active')
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_plan text; v_eligible jsonb; v_effects jsonb; v_quantity_enabled boolean;
begin
  if not public.has_permission('whatsapp-platform','edit') then raise exception 'Not authorized to assign Package Master add-ons' using errcode='42501'; end if;
  if p_quantity<0 then raise exception 'Add-on quantity cannot be negative.'; end if;
  if p_status not in ('pending','active','paused','cancelled') then raise exception 'Invalid add-on status.'; end if;
  select case when plan_code='starter' then 'launch' else plan_code end into v_plan from public.whatsapp_platform_tenants where id=p_tenant_id;
  if v_plan is null then raise exception 'Customer workspace not found.'; end if;
  select eligible_plan_codes,entitlement_effects,quantity_enabled into v_eligible,v_effects,v_quantity_enabled from public.whatsapp_platform_addon_master where code=p_addon_code and status='active';
  if v_eligible is null then raise exception 'Active Package Master add-on not found.'; end if;
  if not v_quantity_enabled and p_quantity not in (0,1) then raise exception 'This add-on is a single-purchase item; quantity must be one.'; end if;
  if v_eligible<>'[]'::jsonb and not (v_eligible ? v_plan) then raise exception 'This add-on is not eligible for the customer package.'; end if;
  insert into public.whatsapp_platform_tenant_addons as a(tenant_id,addon_code,quantity,status,billing_starts_at,updated_at)
  values(p_tenant_id,p_addon_code,p_quantity,case when p_quantity=0 then 'cancelled' else p_status end,case when p_quantity>0 and p_status='active' then now() else null end,now())
  on conflict(tenant_id,addon_code) do update set quantity=excluded.quantity,status=excluded.status,billing_starts_at=coalesce(a.billing_starts_at,excluded.billing_starts_at),billing_ends_at=case when excluded.status='cancelled' then now() else null end,updated_at=now()
  returning id into v_id;
  if p_addon_code='extra_agent_seat' then update public.whatsapp_platform_tenants set additional_team_seats=case when p_status='active' then p_quantity else 0 end,updated_at=now() where id=p_tenant_id; end if;
  return v_id;
end; $$;

create or replace function public.whatsapp_platform_admin_save_master_addon(p_id uuid,p_payload jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_id uuid;
  v_code text:=lower(trim(p_payload->>'code'));
  v_before public.whatsapp_platform_addon_master;
  v_previous_version_id uuid;
  v_new_version_id uuid;
  v_price_changed boolean:=false;
  v_quantity_enabled boolean:=coalesce((p_payload->>'quantityEnabled')::boolean,true);
begin
  if not public.has_permission('whatsapp-platform','edit') then raise exception 'Not authorized to manage Package Master' using errcode='42501'; end if;
  if v_code !~ '^[a-z0-9][a-z0-9_-]{1,79}$' then raise exception 'Enter a valid immutable add-on code.'; end if;
  if p_id is not null then
    select * into v_before from public.whatsapp_platform_addon_master where id=p_id for update;
    if v_before.id is null then raise exception 'Add-on Master record not found.' using errcode='P0002'; end if;
    if v_before.code<>v_code then raise exception 'Add-on code is immutable.' using errcode='22023'; end if;
    v_previous_version_id:=v_before.current_price_version_id;
    v_price_changed:=v_before.currency is distinct from upper(coalesce(p_payload->>'currency','INR'))
      or v_before.unit_amount is distinct from coalesce((p_payload->>'unitAmount')::numeric,0);
  end if;

  insert into public.whatsapp_platform_addon_master as m
    (id,code,name,description,status,billing_model,billing_interval,currency,unit_amount,unit_name,quantity_enabled,minimum_quantity,maximum_quantity,quantity_step,eligible_plan_codes,entitlement_effects,is_self_service,sort_order,updated_at)
  values (coalesce(p_id,gen_random_uuid()),v_code,trim(p_payload->>'name'),coalesce(p_payload->>'description',''),coalesce(p_payload->>'status','draft'),coalesce(p_payload->>'billingModel','recurring'),coalesce(p_payload->>'billingInterval','month'),upper(coalesce(p_payload->>'currency','INR')),coalesce((p_payload->>'unitAmount')::numeric,0),coalesce(p_payload->>'unitName','unit'),v_quantity_enabled,case when v_quantity_enabled then coalesce((p_payload->>'minimumQuantity')::integer,1) else 1 end,case when v_quantity_enabled then nullif(p_payload->>'maximumQuantity','')::integer else 1 end,case when v_quantity_enabled then coalesce((p_payload->>'quantityStep')::integer,1) else 1 end,coalesce(p_payload->'eligiblePlanCodes','[]'::jsonb),coalesce(p_payload->'entitlementEffects','{}'::jsonb),coalesce((p_payload->>'isSelfService')::boolean,false),coalesce((p_payload->>'sortOrder')::integer,0),now())
  on conflict (id) do update set name=excluded.name,description=excluded.description,status=excluded.status,billing_model=excluded.billing_model,billing_interval=excluded.billing_interval,currency=excluded.currency,unit_amount=excluded.unit_amount,unit_name=excluded.unit_name,quantity_enabled=excluded.quantity_enabled,minimum_quantity=excluded.minimum_quantity,maximum_quantity=excluded.maximum_quantity,quantity_step=excluded.quantity_step,eligible_plan_codes=excluded.eligible_plan_codes,entitlement_effects=excluded.entitlement_effects,is_self_service=excluded.is_self_service,sort_order=excluded.sort_order,updated_at=now()
  returning id into v_id;

  if p_id is null or v_before.current_price_version_id is null or v_price_changed then
    insert into public.whatsapp_platform_addon_price_versions(addon_id,version_no,currency,unit_base_paise,gst_rate_bps,effective_from,created_by_auth_user_id)
    select v_id,coalesce(max(version_no),0)+1,upper(coalesce(p_payload->>'currency','INR')),round(coalesce((p_payload->>'unitAmount')::numeric,0)*100)::bigint,1800,now(),auth.uid()
    from public.whatsapp_platform_addon_price_versions where addon_id=v_id
    returning id into v_new_version_id;
    update public.whatsapp_platform_addon_master set current_price_version_id=v_new_version_id where id=v_id;

    if v_price_changed and v_previous_version_id is not null then
      update public.whatsapp_platform_billing_addon_price_changes c set status='superseded',updated_at=now()
      where c.tenant_addon_id in (select ta.id from public.whatsapp_platform_tenant_addons ta where ta.addon_code=v_code)
        and c.status in ('pending_consent','accepted','processing');
      insert into public.whatsapp_platform_billing_addon_price_changes(tenant_id,tenant_addon_id,from_price_version_id,target_price_version_id,effective_at)
      select ta.tenant_id,ta.id,coalesce(ta.addon_price_version_id,v_previous_version_id),v_new_version_id,
        coalesce((select max(s.current_end) from public.whatsapp_platform_billing_subscriptions s where s.tenant_id=ta.tenant_id and s.status in ('authenticated','active')),now()+interval '1 month')
      from public.whatsapp_platform_tenant_addons ta
      where ta.addon_code=v_code and ta.status='active' and coalesce(ta.addon_price_version_id,v_previous_version_id)<>v_new_version_id;
    end if;
  end if;
  return v_id;
end; $$;

revoke all on function public.whatsapp_platform_admin_set_tenant_addon(uuid,text,integer,text) from public,anon;
revoke all on function public.whatsapp_platform_admin_save_master_addon(uuid,jsonb) from public,anon;
grant execute on function public.whatsapp_platform_admin_set_tenant_addon(uuid,text,integer,text) to authenticated,service_role;
grant execute on function public.whatsapp_platform_admin_save_master_addon(uuid,jsonb) to authenticated,service_role;

comment on column public.whatsapp_platform_addon_master.quantity_enabled is
  'When true customers choose units; when false checkout and assignments enforce a single unit.';

notify pgrst, 'reload schema';
