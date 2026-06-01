-- SPRINT 6C.1 Integrity cleanup: soft-delete orphaned/deleted-trip support deductions and documents
-- Non-destructive: no hard deletes

DO $$
BEGIN
  UPDATE transport_trip_expenses e
  SET
    deleted_at = COALESCE(e.deleted_at, now()),
    updated_at = now(),
    is_active = false
  WHERE e.deleted_at IS NULL
    AND (
      NOT EXISTS (SELECT 1 FROM transport_trips t WHERE t.id = e.trip_id)
      OR EXISTS (SELECT 1 FROM transport_trips t WHERE t.id = e.trip_id AND t.deleted_at IS NOT NULL)
    );

  UPDATE transport_trip_documents d
  SET
    deleted_at = COALESCE(d.deleted_at, now()),
    updated_at = now(),
    is_active = false
  WHERE d.deleted_at IS NULL
    AND (
      NOT EXISTS (SELECT 1 FROM transport_trips t WHERE t.id = d.trip_id)
      OR EXISTS (SELECT 1 FROM transport_trips t WHERE t.id = d.trip_id AND t.deleted_at IS NOT NULL)
    );
END $$;
