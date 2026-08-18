-- Follow-up for environments that recorded the team-capacity migration before
-- the member reactivation guard was added to its fresh-install definition.
create or replace function public.whatsapp_platform_update_member_access(
  p_tenant_id uuid,p_actor_user_id uuid,p_member_id uuid,p_role_code text,p_status text
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_actor public.whatsapp_platform_users;
  v_member public.whatsapp_platform_users;
  v_plan_code text;
  v_included integer;
  v_additional integer;
  v_used integer;
begin
  select * into v_actor from public.whatsapp_platform_users where id=p_actor_user_id and tenant_id=p_tenant_id and status='active';
  if v_actor.id is null or v_actor.role_code not in ('owner','admin') then raise exception 'Workspace administrator access is required.'; end if;
  if p_member_id=p_actor_user_id then raise exception 'You cannot change your own role or access status.'; end if;
  select * into v_member from public.whatsapp_platform_users where id=p_member_id and tenant_id=p_tenant_id for update;
  if v_member.id is null then raise exception 'Workspace member not found.'; end if;
  if v_member.role_code='owner' then raise exception 'The workspace owner cannot be changed here.'; end if;
  if v_actor.role_code='admin' and v_member.role_code='admin' then raise exception 'Only the workspace owner can manage administrators.'; end if;
  if p_role_code not in ('admin','agent','viewer') or p_status not in ('active','invited','disabled') then raise exception 'Select a valid member role and status.'; end if;
  if p_role_code='admin' and v_actor.role_code<>'owner' then raise exception 'Only the workspace owner can assign administrator access.'; end if;
  if p_status='active' and v_member.status='invited' then raise exception 'An invited member must accept their secure link before activation.'; end if;

  if v_member.status='disabled' and p_status in ('active','invited') then
    select plan_code,additional_team_seats into v_plan_code,v_additional from public.whatsapp_platform_tenants where id=p_tenant_id for update;
    select team_member_limit into v_included from public.whatsapp_platform_plans where code=case when v_plan_code='starter' then 'launch' else v_plan_code end;
    if not found then v_included:=case v_plan_code when 'growth' then 10 when 'enterprise' then null else 3 end; end if;
    select count(*) into v_used from public.whatsapp_platform_users where tenant_id=p_tenant_id and status in ('active','invited');
    if v_included is not null and v_used >= v_included+v_additional then raise exception 'This workspace has reached its package team limit.'; end if;
  end if;

  update public.whatsapp_platform_users set role_code=p_role_code,status=p_status,updated_at=now(),
    invite_token_hash=case when p_status='disabled' then null else invite_token_hash end,
    invite_expires_at=case when p_status='disabled' then null else invite_expires_at end
  where id=p_member_id returning * into v_member;
  return jsonb_build_object('id',v_member.id,'display_name',v_member.display_name,'email',v_member.email,
    'role_code',v_member.role_code,'status',v_member.status,'last_login_at',v_member.last_login_at,
    'created_at',v_member.created_at,'invited_at',v_member.invited_at,'invite_expires_at',v_member.invite_expires_at);
end; $$;

revoke all on function public.whatsapp_platform_update_member_access(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.whatsapp_platform_update_member_access(uuid,uuid,uuid,text,text) to service_role;
notify pgrst, 'reload schema';
