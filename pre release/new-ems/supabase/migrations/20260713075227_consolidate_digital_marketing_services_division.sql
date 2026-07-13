-- Consolidate Digital Services and Marketing into one business division while
-- retaining stable internal codes and delivery tables for portal isolation.

do $$
declare
  v_division_id uuid;
  v_legacy_marketing_id uuid;
  ref record;
begin
  select id into v_division_id
  from public.divisions
  where code = 'DIGITAL_SERVICES';

  if v_division_id is null then
    insert into public.divisions (code, name)
    values ('DIGITAL_SERVICES', 'Digital Marketing & Services')
    returning id into v_division_id;
  else
    update public.divisions
    set name = 'Digital Marketing & Services'
    where id = v_division_id;
  end if;

  select id into v_legacy_marketing_id
  from public.divisions
  where code = 'MARKETING';

  if v_legacy_marketing_id is not null then
    -- Avoid a duplicate membership if a user was assigned to both old rows.
    delete from public.user_divisions legacy
    where legacy.division_id = v_legacy_marketing_id
      and exists (
        select 1
        from public.user_divisions current_membership
        where current_membership.user_id = legacy.user_id
          and current_membership.division_id = v_division_id
      );

    -- Repoint every foreign key that references divisions. This keeps the
    -- migration safe if another EMS feature used the legacy Marketing row.
    for ref in
      select n.nspname as schema_name,
             t.relname as table_name,
             a.attname as column_name
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      join unnest(c.conkey) with ordinality keys(attnum, ord) on true
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = keys.attnum
      where c.contype = 'f'
        and c.confrelid = 'public.divisions'::regclass
    loop
      execute format(
        'update %I.%I set %I = $1 where %I = $2',
        ref.schema_name, ref.table_name, ref.column_name, ref.column_name
      ) using v_division_id, v_legacy_marketing_id;
    end loop;

    delete from public.divisions where id = v_legacy_marketing_id;
  end if;
end;
$$;

-- Delivery/portal tables are now mandatory one-to-one extensions of the
-- Digital Marketing & Services client and project masters. They cannot be used
-- to create a second independent client or project register.
alter table public.marketing_clients
  alter column ds_client_id set not null;

alter table public.marketing_projects
  alter column ds_project_id set not null;

drop policy if exists marketing_clients_staff_insert on public.marketing_clients;
drop policy if exists marketing_clients_staff_delete on public.marketing_clients;
drop policy if exists marketing_projects_staff_insert on public.marketing_projects;
drop policy if exists marketing_projects_staff_delete on public.marketing_projects;

revoke insert, delete on public.marketing_clients from authenticated;
revoke insert, delete on public.marketing_projects from authenticated;

update public.permissions
set label = replace(label, 'Digital Services', 'Digital Marketing & Services')
where module_code like 'digital-services%'
  and label like '%Digital Services%';

update public.permissions
set label = replace(label, 'Marketing', 'Digital Marketing & Services')
where module_code in ('marketing', 'marketing-command-center')
  and label like '%Marketing%';
