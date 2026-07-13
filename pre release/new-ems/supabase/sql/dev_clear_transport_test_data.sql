-- DEV ONLY: Clear transportation operational test data.
-- Do NOT run in production.
-- Master/reference tables are intentionally untouched.

begin;

do $$
begin
  -- transport_trip_documents: prefer soft delete if deleted_at exists
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'transport_trip_documents' and column_name = 'deleted_at'
  ) then
    execute 'update public.transport_trip_documents set deleted_at = now(), updated_at = now(), is_active = false where deleted_at is null';
  else
    execute 'delete from public.transport_trip_documents';
  end if;

  -- transport_trip_expenses: prefer soft delete if deleted_at exists
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'transport_trip_expenses' and column_name = 'deleted_at'
  ) then
    execute 'update public.transport_trip_expenses set deleted_at = now(), updated_at = now(), is_active = false where deleted_at is null';
  else
    execute 'delete from public.transport_trip_expenses';
  end if;

  -- transport_trips: prefer soft delete if deleted_at exists
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'transport_trips' and column_name = 'deleted_at'
  ) then
    execute 'update public.transport_trips set deleted_at = now(), updated_at = now(), is_active = false where deleted_at is null';
  else
    execute 'delete from public.transport_trips';
  end if;

  -- transport_trip_timeline: generally operational event data, hard clear for dev reset
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'transport_trip_timeline'
  ) then
    execute 'delete from public.transport_trip_timeline';
  end if;

  -- reset test number sequences if present
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'transport_trip_number_sequences'
  ) then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'transport_trip_number_sequences' and column_name = 'last_number'
    ) then
      execute 'update public.transport_trip_number_sequences set last_number = 0, updated_at = now()';
    elsif exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'transport_trip_number_sequences' and column_name = 'current_value'
    ) then
      execute 'update public.transport_trip_number_sequences set current_value = 0, updated_at = now()';
    end if;
  end if;

  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'transport_trip_expense_sequences'
  ) then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'transport_trip_expense_sequences' and column_name = 'last_number'
    ) then
      execute 'update public.transport_trip_expense_sequences set last_number = 0, updated_at = now()';
    elsif exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'transport_trip_expense_sequences' and column_name = 'current_value'
    ) then
      execute 'update public.transport_trip_expense_sequences set current_value = 0, updated_at = now()';
    end if;
  end if;
end $$;

commit;
