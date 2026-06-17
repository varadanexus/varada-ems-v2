-- Sprint 2A: safety marker
-- Legacy IAM normalization was moved earlier to 20260601004000_sprint1z_legacy_iam_type_normalization.sql
-- so Sprint 2 can recreate canonical UUID-based IAM tables before Sprint 3 depends on them.

do $$
begin
  raise notice 'Legacy IAM normalization already handled by 20260601004000_sprint1z_legacy_iam_type_normalization.sql';
end $$;