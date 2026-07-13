-- Sprint 13F.18: centralized, page-authorized lookup helper.
--
-- Any protected page with VIEW permission may read the small id/name option
-- lists it needs from these explicitly allowlisted sources. This does not grant
-- access to the source/master page or expose full records. Division-scoped
-- sources remain restricted to the user's assigned division.

create table if not exists public.page_lookup_sources (
  source_code text primary key,
  table_name text not null unique,
  value_column text not null default 'id',
  label_column text not null default 'name',
  division_scoped boolean not null default true,
  is_active boolean not null default true
);

alter table public.page_lookup_sources enable row level security;
revoke all on table public.page_lookup_sources from anon, authenticated;

insert into public.page_lookup_sources
  (source_code, table_name, value_column, label_column, division_scoped, is_active)
values
  ('divisions', 'divisions', 'id', 'name', false, true),
  ('transport-clients', 'transport_clients', 'id', 'name', true, true),
  ('transport-transporters', 'transport_transporters', 'id', 'name', true, true),
  ('transport-trucks', 'transport_trucks', 'id', 'name', true, true),
  ('transport-drivers', 'transport_drivers', 'id', 'name', true, true),
  ('transport-routes', 'transport_route_master', 'id', 'name', true, true),
  ('transport-commodities', 'transport_commodities', 'id', 'name', true, true),
  ('transport-rates', 'transport_rate_master', 'id', 'name', true, true),
  ('transport-agents', 'transport_agents', 'id', 'name', true, true)
on conflict (source_code) do update
set table_name = excluded.table_name,
    value_column = excluded.value_column,
    label_column = excluded.label_column,
    division_scoped = excluded.division_scoped,
    is_active = true;

create or replace function public.get_page_lookup_options(
  p_page_module text,
  p_table_name text,
  p_division_id uuid default null
)
returns table(value text, label text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_source public.page_lookup_sources%rowtype;
  v_sql text;
begin
  if p_page_module is null
     or not (
       public.has_permission(p_page_module, 'view')
       or public.is_super_admin()
       or public.has_role_code('admin')
     ) then
    raise exception 'Page view permission is required for lookup data';
  end if;

  select *
  into v_source
  from public.page_lookup_sources s
  where s.table_name = p_table_name
    and s.is_active = true;

  if not found then
    raise exception 'Lookup source is not allowlisted: %', p_table_name;
  end if;

  if v_source.division_scoped then
    if p_division_id is null
       or not public.has_division_access_by_id(p_division_id) then
      raise exception 'Division access is required for lookup data';
    end if;

    v_sql := format(
      'select %I::text, %I::text from public.%I '
      || 'where division_id = $1 and deleted_at is null and is_active = true '
      || 'order by %I',
      v_source.value_column,
      v_source.label_column,
      v_source.table_name,
      v_source.label_column
    );
    return query execute v_sql using p_division_id;
  else
    -- The only current global source is divisions. Keep its rows assignment-
    -- scoped even though callers do not provide a division filter.
    v_sql := format(
      'select %I::text, %I::text from public.%I '
      || 'where is_active = true and public.has_division_access_by_id(%I) '
      || 'order by %I',
      v_source.value_column,
      v_source.label_column,
      v_source.table_name,
      v_source.value_column,
      v_source.label_column
    );
    return query execute v_sql;
  end if;
end;
$$;

revoke all on function public.get_page_lookup_options(text, text, uuid) from public;
grant execute on function public.get_page_lookup_options(text, text, uuid) to authenticated;
