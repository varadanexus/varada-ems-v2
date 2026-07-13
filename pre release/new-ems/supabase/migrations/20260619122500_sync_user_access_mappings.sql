create or replace function public.sync_user_access_mappings(
  p_user_id uuid,
  p_role_ids uuid[],
  p_division_ids uuid[] default '{}'::uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_ids uuid[];
  v_division_ids uuid[];
begin
  if not (public.is_super_admin() or public.has_permission('users', 'edit')) then
    raise exception 'Insufficient permission to update user access mappings';
  end if;

  if p_user_id is null then
    raise exception 'User id is required';
  end if;

  select coalesce(array_agg(distinct role_id), '{}'::uuid[])
    into v_role_ids
  from unnest(coalesce(p_role_ids, '{}'::uuid[])) as role_id
  where role_id is not null;

  if coalesce(array_length(v_role_ids, 1), 0) = 0 then
    raise exception 'At least one role is required';
  end if;

  select coalesce(array_agg(distinct division_id), '{}'::uuid[])
    into v_division_ids
  from unnest(coalesce(p_division_ids, '{}'::uuid[])) as division_id
  where division_id is not null;

  delete from public.user_roles
  where user_id = p_user_id
    and role_id <> all(v_role_ids);

  insert into public.user_roles (user_id, role_id)
  select p_user_id, role_id
  from unnest(v_role_ids) as role_id
  where not exists (
    select 1
    from public.user_roles ur
    where ur.user_id = p_user_id
      and ur.role_id = role_id
  );

  delete from public.user_divisions
  where user_id = p_user_id
    and division_id <> all(v_division_ids);

  insert into public.user_divisions (user_id, division_id, scope)
  select p_user_id, division_id, 'assigned'
  from unnest(v_division_ids) as division_id
  where not exists (
    select 1
    from public.user_divisions ud
    where ud.user_id = p_user_id
      and ud.division_id = division_id
  );
end;
$$;

grant execute on function public.sync_user_access_mappings(uuid, uuid[], uuid[]) to authenticated;
