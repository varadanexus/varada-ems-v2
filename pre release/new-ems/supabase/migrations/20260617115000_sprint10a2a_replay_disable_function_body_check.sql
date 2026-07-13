-- Sprint 10A.2A replay shim
-- Local replay safety only: disable function body validation before Project Engine function-first migration.
-- This avoids false ordering failures when functions are defined before dependent tables in the same later migration.

set check_function_bodies = off;