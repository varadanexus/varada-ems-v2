begin;

insert into public.roles (code, name, is_active)
values ('google_play_reviewer', 'Google Play Reviewer', true)
on conflict (code) do update
set name = excluded.name,
    is_active = true,
    updated_at = now();

-- Reviewers need to open every screen, but never receive create/edit/delete,
-- approval, posting, export or audit permissions.
insert into public.role_permissions (role_id, permission_id, allow)
select r.id, p.id, true
from public.roles r
join public.permissions p
  on p.action_code = 'view'
 and coalesce(p.is_active, true) = true
where r.code = 'google_play_reviewer'
on conflict (role_id, permission_id) do update
set allow = true;

delete from public.role_permissions rp
using public.roles r, public.permissions p
where rp.role_id = r.id
  and rp.permission_id = p.id
  and r.code = 'google_play_reviewer'
  and p.action_code <> 'view';

create or replace function public.is_google_play_reviewer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_users au
    join public.user_roles ur on ur.user_id = au.id
    join public.roles r on r.id = ur.role_id
    where au.auth_user_id = auth.uid()
      and au.status = 'active'
      and coalesce(au.is_locked, false) = false
      and au.deleted_at is null
      and coalesce(r.is_active, true) = true
      and r.code = 'google_play_reviewer'
  );
$$;

revoke all on function public.is_google_play_reviewer() from public, anon;
grant execute on function public.is_google_play_reviewer() to authenticated, service_role;

-- Preserve the historical behaviour of legacy tables that did not yet use
-- RLS, then add a restrictive reviewer policy. Existing grants remain the
-- outer access boundary, so this does not broaden access for any role.
do $$
declare
  t record;
  had_rls boolean;
begin
  for t in
    select c.oid, n.nspname as schema_name, c.relname as table_name, c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relname not in (
        'app_users', 'app_user_sessions', 'roles', 'permissions',
        'user_roles', 'role_permissions', 'divisions', 'user_divisions',
        'legal_terms_versions', 'legal_terms_acceptances',
        'legal_terms_acceptance_evidence'
      )
  loop
    had_rls := t.relrowsecurity;
    if not had_rls then
      execute format('alter table %I.%I enable row level security', t.schema_name, t.table_name);
      if not exists (
        select 1 from pg_policies
        where schemaname = t.schema_name
          and tablename = t.table_name
          and policyname = 'legacy_access_preserved'
      ) then
        execute format(
          'create policy legacy_access_preserved on %I.%I for all to anon, authenticated using (true) with check (true)',
          t.schema_name, t.table_name
        );
      end if;
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = t.schema_name
        and tablename = t.table_name
        and policyname = 'google_play_reviewer_empty_data'
    ) then
      execute format(
        'create policy google_play_reviewer_empty_data on %I.%I as restrictive for all to authenticated using (not public.is_google_play_reviewer()) with check (not public.is_google_play_reviewer())',
        t.schema_name, t.table_name
      );
    end if;
  end loop;
end;
$$;

comment on function public.is_google_play_reviewer() is
  'True only for the dedicated Google Play review identity; used by restrictive RLS policies to expose empty business datasets.';

notify pgrst, 'reload schema';

commit;
