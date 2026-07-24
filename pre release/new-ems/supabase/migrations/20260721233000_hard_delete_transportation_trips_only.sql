-- Irreversibly remove Transportation trips and records owned directly by those
-- trips. Preserve all Transportation masters, portal accounts, rates, mappings,
-- and standalone finance headers.

begin;

lock table public.transport_trips in share row exclusive mode;

create temporary table _transport_trip_ids on commit drop as
select id
from public.transport_trips;

-- Remove shared-service records that point specifically to the trips being
-- cleared. Notification recipients cascade from notification_events.
delete from public.audit_logs
where entity_id in (select id::text from _transport_trip_ids)
  and lower(coalesce(entity_type, '')) like '%trip%';

delete from public.notification_events
where entity_id in (select id::text from _transport_trip_ids)
  and lower(coalesce(entity_type, '')) like '%trip%';

delete from public.drive_documents
where trip_id in (select id from _transport_trip_ids)
   or (
     entity_id in (select id from _transport_trip_ids)
     and lower(coalesce(entity_type, '')) like '%trip%'
   );

delete from public.transport_ledger_entries
where source_id in (select id from _transport_trip_ids)
  and lower(coalesce(source_type, '')) like '%trip%';

-- Remove relational dependants before deleting the trips.
delete from public.transport_client_bill_trips
where trip_id in (select id from _transport_trip_ids);

delete from public.transport_transporter_statement_trips
where trip_id in (select id from _transport_trip_ids);

delete from public.transport_trip_documents
where trip_id in (select id from _transport_trip_ids);

delete from public.transport_trip_expenses
where trip_id in (select id from _transport_trip_ids);

delete from public.transport_trip_timeline
where trip_id in (select id from _transport_trip_ids);

delete from public.transport_trips
where id in (select id from _transport_trip_ids);

-- Start fresh numbering only for new trips and trip expenses.
delete from public.transport_trip_number_sequences;
delete from public.transport_trip_expense_sequences;

-- Fail atomically if any trip or trip-owned record survives.
do $$
begin
  if exists (select 1 from public.transport_trips)
     or exists (select 1 from public.transport_client_bill_trips)
     or exists (select 1 from public.transport_transporter_statement_trips)
     or exists (select 1 from public.transport_trip_documents)
     or exists (select 1 from public.transport_trip_expenses)
     or exists (select 1 from public.transport_trip_timeline)
     or exists (select 1 from public.transport_trip_number_sequences)
     or exists (select 1 from public.transport_trip_expense_sequences)
     or exists (
       select 1 from public.audit_logs
       where entity_id in (select id::text from _transport_trip_ids)
         and lower(coalesce(entity_type, '')) like '%trip%'
     )
     or exists (
       select 1 from public.notification_events
       where entity_id in (select id::text from _transport_trip_ids)
         and lower(coalesce(entity_type, '')) like '%trip%'
     )
     or exists (
       select 1 from public.drive_documents
       where trip_id in (select id from _transport_trip_ids)
          or (
            entity_id in (select id from _transport_trip_ids)
            and lower(coalesce(entity_type, '')) like '%trip%'
          )
     )
     or exists (
       select 1 from public.transport_ledger_entries
       where source_id in (select id from _transport_trip_ids)
         and lower(coalesce(source_type, '')) like '%trip%'
     )
  then
    raise exception 'Transportation trips-only cleanup verification failed';
  end if;
end;
$$;

commit;
