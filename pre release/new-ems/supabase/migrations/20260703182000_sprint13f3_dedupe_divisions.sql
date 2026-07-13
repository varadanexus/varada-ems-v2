-- Sprint 13F.3: remove duplicate division rows.
--
-- Two parallel division sets were seeded a day apart. The app resolves divisions
-- by the UPPERCASE codes (e.g. resolveWorkspaceDivision -> getDivisionByCode('TRANSPORT')),
-- so CONSTR / INTER / TRANSPORT are canonical. The lowercase seed rows
-- (construction / interior / transport) are duplicates and were verified to have
-- ZERO foreign-key references anywhere in the schema on 2026-07-03, so a hard
-- delete is safe.
--
-- Canonical rows kept: CONSTR (Construction), INTER (Interiors), TRANSPORT (Transportation).

delete from public.divisions
where code in ('construction', 'interior', 'transport');
