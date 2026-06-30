# Archived migrations

Files here are **not** part of the active Supabase migration chain (`new-ems/supabase/migrations/`) and must never be copied back into it or applied directly.

## 20260623111000_fix_interiors_posting_authorization.sql

Archived 2026-06-30 during migration history normalization. Its effect (the `has_permission('central-accounts-posting-queue','post')` / `can_emergency_post_central_accounts()` authorization check on `public.execute_central_accounts_interiors_posting`) was already live on the linked database — confirmed via a byte-level `pg_get_functiondef` comparison — but the remote migration history table had no record of this filename, due to it originally having been applied via an earlier root-level `supabase/` CLI context.

It is superseded by `new-ems/supabase/migrations/20260630120000_normalize_interiors_posting_function.sql`, which carries the identical canonical function body forward in correct chronological order. Kept here only for audit/provenance; not a candidate for re-application.
