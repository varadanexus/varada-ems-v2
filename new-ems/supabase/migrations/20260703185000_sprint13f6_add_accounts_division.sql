-- Sprint 13F.6: add the Accounts business division.
--
-- The divisions table only had Construction, Interiors, and Transportation.
-- Accounts is a first-class business unit (WORKSPACES.ACCOUNTS / Central Accounts)
-- and should be assignable to users. Insert it if not already present.

insert into public.divisions (code, name, is_active)
select 'ACCOUNTS', 'Accounts', true
where not exists (
  select 1 from public.divisions where lower(name) = 'accounts' or upper(code) = 'ACCOUNTS'
);
