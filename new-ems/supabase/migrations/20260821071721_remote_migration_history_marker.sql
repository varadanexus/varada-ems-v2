-- Production migration-history marker.
-- Version 20260821071721 was applied remotely during the Package Master
-- pricing rollout before its SQL was checked into this workspace. Its schema
-- effects are represented by the adjacent versioned-catalog migrations.
-- This no-op file keeps local and linked migration histories aligned without
-- rewriting or reverting the already-applied production migration.

select 1;
