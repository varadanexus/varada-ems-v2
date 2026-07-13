-- Route Digital Marketing & Services portal users through the central Portal
-- Access login. Portal data remains isolated behind short-lived, revocable
-- external_portal_sessions; the publishable browser key never receives direct
-- table access for these token-authenticated operations.

create or replace function public.marketing_portal_resolve(p_session_token text)
returns table(portal_user_id uuid, actor_kind text, profile_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  select s.portal_user_id into v_user_id
  from public.external_portal_validate_session(p_session_token) s;

  return query
  select
    v_user_id,
    case a.access_scope
      when 'marketing_client_portal' then 'client'
      when 'marketing_vendor_portal' then 'vendor'
    end,
    a.record_id
  from public.external_portal_access a
  where a.portal_user_id = v_user_id
    and a.source_module = 'digital-services'
    and a.access_scope in ('marketing_client_portal', 'marketing_vendor_portal')
    and a.record_type in ('marketing_clients', 'marketing_vendors')
    and a.is_active
    and (a.expires_at is null or a.expires_at > now())
  order by a.granted_at desc
  limit 1;
end;
$$;

revoke all on function public.marketing_portal_resolve(text) from public, anon, authenticated;

create or replace function public.marketing_actor_kind()
returns text
language sql
stable
security invoker
set search_path = public
as $$
  select case
    when nullif(current_setting('app.marketing_portal_kind', true), '') in ('client', 'vendor')
      then nullif(current_setting('app.marketing_portal_kind', true), '')
    when public.has_permission('marketing','view') then 'staff'
    when exists (select 1 from public.marketing_clients c where c.auth_user_id = (select auth.uid()) and c.status in ('lead','active','paused')) then 'client'
    when exists (select 1 from public.marketing_vendors v where v.auth_user_id = (select auth.uid()) and v.status = 'active') then 'vendor'
    else null
  end;
$$;

create or replace function public.marketing_can_access_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission('marketing','view')
    or (
      nullif(current_setting('app.marketing_portal_kind', true), '') = 'client'
      and exists (
        select 1 from public.marketing_projects p
        where p.id = p_project_id
          and p.client_id = nullif(current_setting('app.marketing_portal_profile_id', true), '')::uuid
      )
    )
    or (
      nullif(current_setting('app.marketing_portal_kind', true), '') = 'vendor'
      and exists (
        select 1 from public.marketing_project_assignments a
        where a.project_id = p_project_id
          and a.vendor_id = nullif(current_setting('app.marketing_portal_profile_id', true), '')::uuid
          and a.assignment_status <> 'cancelled'
      )
    )
    or exists (
      select 1 from public.marketing_projects p
      join public.marketing_clients c on c.id = p.client_id
      where p.id = p_project_id and c.auth_user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.marketing_project_assignments a
      join public.marketing_vendors v on v.id = a.vendor_id
      where a.project_id = p_project_id
        and v.auth_user_id = (select auth.uid())
        and a.assignment_status <> 'cancelled'
    );
$$;

revoke all on function public.marketing_can_access_project(uuid) from public, anon;
grant execute on function public.marketing_can_access_project(uuid) to authenticated;

create or replace function public.marketing_record_message_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text := public.marketing_actor_kind();
  v_actor_id uuid := coalesce(
    (select auth.uid()),
    nullif(current_setting('app.marketing_portal_actor_id', true), '')::uuid
  );
begin
  if v_actor_id is null or v_kind is null then
    raise exception 'Message actor could not be verified';
  end if;
  insert into public.marketing_message_authorship(message_id, auth_user_id, actor_kind)
  values (new.id, v_actor_id, v_kind);
  update public.marketing_queries
  set last_message_at = new.created_at,
      status = case v_kind when 'client' then 'awaiting_delivery' when 'vendor' then 'awaiting_client' else status end,
      updated_at = now()
  where id = new.query_id;
  return new;
end;
$$;

revoke all on function public.marketing_record_message_actor() from public, anon, authenticated;

create or replace function public.marketing_portal_read(
  p_session_token text,
  p_resource text,
  p_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_result jsonb;
begin
  select * into v_ctx from public.marketing_portal_resolve(p_session_token);
  if v_ctx.profile_id is null then
    raise exception 'No Digital Marketing & Services portal access is linked to this account';
  end if;

  if p_resource = 'identity' then
    if v_ctx.actor_kind = 'client' then
      select jsonb_build_object('kind', 'client', 'profile', to_jsonb(c), 'user', jsonb_build_object('id', v_ctx.portal_user_id))
      into v_result from public.marketing_clients c where c.id = v_ctx.profile_id;
    else
      select jsonb_build_object('kind', 'vendor', 'profile', to_jsonb(v), 'user', jsonb_build_object('id', v_ctx.portal_user_id))
      into v_result from public.marketing_vendors v where v.id = v_ctx.profile_id;
    end if;
  elsif p_resource = 'projects' then
    if v_ctx.actor_kind = 'client' then
      select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb) into v_result
      from (
        select p.*, jsonb_build_object('company_name', c.company_name, 'contact_name', c.contact_name, 'email', c.email) as marketing_clients
        from public.marketing_projects p
        join public.marketing_clients c on c.id = p.client_id
        where p.client_id = v_ctx.profile_id
      ) x;
    else
      select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb) into v_result
      from (
        select p.*, jsonb_build_object('company_name', c.company_name, 'contact_name', c.contact_name, 'email', c.email) as marketing_clients
        from public.marketing_projects p
        join public.marketing_clients c on c.id = p.client_id
        join public.marketing_project_assignments a on a.project_id = p.id
        where a.vendor_id = v_ctx.profile_id and a.assignment_status <> 'cancelled'
      ) x;
    end if;
  elsif p_resource = 'assignments' then
    if v_ctx.actor_kind <> 'vendor' then return '[]'::jsonb; end if;
    select coalesce(jsonb_agg(to_jsonb(x) order by x.assigned_at desc), '[]'::jsonb) into v_result
    from (
      select a.*,
        jsonb_build_object('vendor_code', v.vendor_code, 'legal_name', v.legal_name, 'internal_alias', v.internal_alias, 'contact_name', v.contact_name) as marketing_vendors,
        jsonb_build_object('project_code', p.project_code, 'title', p.title, 'ds_project_id', p.ds_project_id) as marketing_projects
      from public.marketing_project_assignments a
      join public.marketing_vendors v on v.id = a.vendor_id
      join public.marketing_projects p on p.id = a.project_id
      where a.vendor_id = v_ctx.profile_id and a.assignment_status <> 'cancelled'
    ) x;
  elsif p_resource = 'deliverables' then
    select coalesce(jsonb_agg(to_jsonb(d) order by d.sort_order, d.due_date), '[]'::jsonb) into v_result
    from public.marketing_deliverables d
    where (p_id is null or d.project_id = p_id)
      and (v_ctx.actor_kind <> 'client' or d.client_visible)
      and (
        (v_ctx.actor_kind = 'client' and exists (select 1 from public.marketing_projects p where p.id = d.project_id and p.client_id = v_ctx.profile_id))
        or
        (v_ctx.actor_kind = 'vendor' and exists (select 1 from public.marketing_project_assignments a where a.project_id = d.project_id and a.vendor_id = v_ctx.profile_id and a.assignment_status <> 'cancelled'))
      );
  elsif p_resource = 'queries' then
    select coalesce(jsonb_agg(to_jsonb(q) order by q.last_message_at desc), '[]'::jsonb) into v_result
    from public.marketing_queries q
    where (p_id is null or q.project_id = p_id)
      and (
        (v_ctx.actor_kind = 'client' and exists (select 1 from public.marketing_projects p where p.id = q.project_id and p.client_id = v_ctx.profile_id))
        or
        (v_ctx.actor_kind = 'vendor' and exists (select 1 from public.marketing_project_assignments a where a.project_id = q.project_id and a.vendor_id = v_ctx.profile_id and a.assignment_status <> 'cancelled'))
      );
  elsif p_resource = 'messages' then
    if p_id is null then raise exception 'Query ID is required'; end if;
    if not exists (
      select 1 from public.marketing_queries q
      where q.id = p_id and (
        (v_ctx.actor_kind = 'client' and exists (select 1 from public.marketing_projects p where p.id = q.project_id and p.client_id = v_ctx.profile_id))
        or
        (v_ctx.actor_kind = 'vendor' and exists (select 1 from public.marketing_project_assignments a where a.project_id = q.project_id and a.vendor_id = v_ctx.profile_id and a.assignment_status <> 'cancelled'))
      )
    ) then raise exception 'Not authorized for this query'; end if;
    select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at), '[]'::jsonb) into v_result
    from public.marketing_query_messages m where m.query_id = p_id;
  else
    raise exception 'Unsupported portal resource';
  end if;

  return coalesce(v_result, case when p_resource = 'identity' then '{}'::jsonb else '[]'::jsonb end);
end;
$$;

revoke all on function public.marketing_portal_read(text, text, uuid) from public;
grant execute on function public.marketing_portal_read(text, text, uuid) to anon, authenticated;

create or replace function public.marketing_portal_write(
  p_session_token text,
  p_action text,
  p_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_project_id uuid;
  v_row jsonb;
begin
  select * into v_ctx from public.marketing_portal_resolve(p_session_token);
  if v_ctx.profile_id is null then
    raise exception 'No Digital Marketing & Services portal access is linked to this account';
  end if;

  perform set_config('app.marketing_portal_kind', v_ctx.actor_kind, true);
  perform set_config('app.marketing_portal_profile_id', v_ctx.profile_id::text, true);
  perform set_config('app.marketing_portal_actor_id', v_ctx.portal_user_id::text, true);

  if p_action = 'create_query' then
    v_project_id := nullif(p_payload->>'projectId', '')::uuid;
    if not public.marketing_can_access_project(v_project_id) then raise exception 'Not authorized for this project'; end if;
    insert into public.marketing_queries(query_number, project_id, subject, category, priority)
    values ('', v_project_id, btrim(p_payload->>'subject'), coalesce(nullif(p_payload->>'category',''), 'general'), coalesce(nullif(p_payload->>'priority',''), 'normal'))
    returning to_jsonb(marketing_queries.*) into v_row;
  elsif p_action = 'add_message' then
    if p_id is null or not exists (select 1 from public.marketing_queries q where q.id = p_id and public.marketing_can_access_project(q.project_id)) then
      raise exception 'Not authorized for this query';
    end if;
    insert into public.marketing_query_messages(query_id, body)
    values (p_id, btrim(p_payload->>'body'))
    returning to_jsonb(marketing_query_messages.*) into v_row;
  elsif p_action = 'resolve_query' then
    if p_id is null or not exists (select 1 from public.marketing_queries q where q.id = p_id and public.marketing_can_access_project(q.project_id)) then
      raise exception 'Not authorized for this query';
    end if;
    update public.marketing_queries set status = 'resolved', resolved_at = now(), updated_at = now()
    where id = p_id returning to_jsonb(marketing_queries.*) into v_row;
  elsif p_action = 'update_assignment' then
    if v_ctx.actor_kind <> 'vendor' then raise exception 'Only delivery users may update assignments'; end if;
    update public.marketing_project_assignments
    set assignment_status = p_payload->>'assignment_status',
        accepted_at = case when p_payload->>'assignment_status' = 'accepted' then now() else accepted_at end
    where id = p_id and vendor_id = v_ctx.profile_id and p_payload->>'assignment_status' in ('accepted','in_progress','completed')
    returning to_jsonb(marketing_project_assignments.*) into v_row;
  elsif p_action = 'update_deliverable' then
    if v_ctx.actor_kind <> 'vendor' then raise exception 'Only delivery users may update deliverables'; end if;
    update public.marketing_deliverables d
    set status = p_payload->>'status', updated_at = now()
    where d.id = p_id
      and p_payload->>'status' in ('todo','in_progress','vendor_review','client_review','revision','approved','done')
      and exists (select 1 from public.marketing_project_assignments a where a.project_id = d.project_id and a.vendor_id = v_ctx.profile_id and a.assignment_status <> 'cancelled')
    returning to_jsonb(d.*) into v_row;
  else
    raise exception 'Unsupported portal action';
  end if;

  if v_row is null then raise exception 'The requested portal record was not found or is not accessible'; end if;
  return v_row;
end;
$$;

revoke all on function public.marketing_portal_write(text, text, uuid, jsonb) from public;
grant execute on function public.marketing_portal_write(text, text, uuid, jsonb) to anon, authenticated;
