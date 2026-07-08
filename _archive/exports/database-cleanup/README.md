# Sprint RC1 — Test Data Hard Delete: Backup & Scripts

Generated 2026-06-30 against the linked Supabase project `VARADA EMS 2.0` (`ftejxcycoiagbslnzaab`).

## Files

- `test-data-backup-20260630.json` — complete row-level backup of every table in scope for
  deletion. One JSON key per table, value is an array of full row objects (`jsonb_agg(to_jsonb(row))`
  per row, so every column including timestamps/jsonb/null values is preserved losslessly).
  **78 tables, 391 rows total** at time of backup (65 transaction tables + 13 Transportation/
  Interiors business master tables added in the final scope expansion).
- `hard-delete-test-data-20260630.sql` — the generated DELETE script (NOT yet executed).

`supabase db dump` (the normal backup path) was unavailable in this environment — it requires
Docker Desktop to pull a matching Postgres image, and Docker wasn't running. The JSON snapshot
above was generated directly via SQL (`jsonb_agg`) as a Docker-free equivalent and is complete
and restorable.

## Restore procedure

For any table `t` that needs restoring, the row array under `parsed["t"]` can be re-inserted via:

```sql
insert into public.<table_name>
select * from jsonb_populate_recordset(null::public.<table_name>, $1::jsonb);
```

passing that table's JSON array as the `$1` parameter (e.g. via `supabase db query` with the
array embedded inline, or via any Postgres client). Restore in the **reverse** of the delete
order documented at the top of `hard-delete-test-data-20260630.sql` — parents before children
(e.g. `projects` first, `central_accounts_audit_events` last) — since the same FK constraints
that govern deletion order also govern insertion order.
