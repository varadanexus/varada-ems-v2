# Varada EMS database workflow

## Canonical Supabase source

- The only active Supabase project root is `new-ems/supabase`.
- The only active migration directory is `new-ems/supabase/migrations`.
- Never create migrations under the repository-root `supabase/` directory.
- Files in `docs/archive/migrations` are historical evidence and must never be applied.

## Required workflow for every database change

1. Create a uniquely timestamped SQL migration in `new-ems/supabase/migrations`.
2. Run `npm run check:migrations`.
3. Run `npm run db:dry-run` and verify that only the intended migration is pending.
4. Apply with `npm run db:push` only when the user has authorized the production change.
5. Run `npm run db:status` and confirm local and remote versions match.

Do not make direct schema or data changes through Supabase integrations, SQL Editor,
MCP, or ad-hoc database commands. Integrations may be used read-only for inspection.
If an emergency direct change is unavoidable, save the exact SQL as a canonical
migration first and use that migration to deploy it.

Never reuse a migration timestamp, even when filenames differ.
