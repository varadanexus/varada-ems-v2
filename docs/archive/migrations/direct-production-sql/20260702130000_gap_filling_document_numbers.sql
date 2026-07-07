-- ARCHIVED DIRECT-PRODUCTION SQL: not part of the active migration chain.
-- Sprint 13E.7: gap-filling document numbers.
-- Generators derive the next number from the highest ACTIVE (non-deleted) document
-- instead of an ever-incrementing counter, so deleting the latest entry frees its
-- number for reuse. Advisory xact locks prevent duplicates under concurrency.
-- Counter tables are kept in sync for backward compatibility.
-- Applied to remote via MCP migrations: gap_filling_document_numbers,
-- fix_trip_expense_no_extraction (this file is the consolidated final state).

-- 1) Trips: TRYYMM###
create or replace function public.generate_transport_trip_no(p_division_id uuid)
returns text
language plpgsql
as $fn$
declare
  v_yymm text;
  v_seq integer;
begin
  if p_division_id is null then
    raise exception 'division_id is required for trip number generation';
  end if;

  v_yymm := to_char(current_date, 'YYMM');
  perform pg_advisory_xact_lock(hashtext('gen_trip_no:' || p_division_id::text || ':' || v_yymm));

  select coalesce(max(nullif(substring(trip_no from 7), '')::integer), 0) + 1
  into v_seq
  from public.transport_trips
  where division_id = p_division_id
    and deleted_at is null
    and trip_no ~ ('^TR' || v_yymm || '[0-9]+$');

  insert into public.transport_trip_number_sequences (division_id, yymm, last_seq)
  values (p_division_id, v_yymm, v_seq)
  on conflict (division_id, yymm)
  do update set last_seq = excluded.last_seq, updated_at = now();

  return 'TR' || v_yymm || lpad(v_seq::text, 3, '0');
end;
$fn$;

-- 2) Trip expenses: EXYYMM### (unique index relaxed to active rows only)
alter table public.transport_trip_expenses
  drop constraint if exists transport_trip_expenses_expense_no_key;
drop index if exists public.transport_trip_expenses_expense_no_key;
create unique index if not exists uq_transport_trip_expenses_expense_no_active
  on public.transport_trip_expenses (expense_no)
  where (deleted_at is null);

create or replace function public.generate_transport_trip_expense_no(p_division_id uuid)
returns text
language plpgsql
as $fn$
declare
  v_yymm text;
  v_seq integer;
begin
  if p_division_id is null then
    raise exception 'division_id is required for expense number generation';
  end if;

  v_yymm := to_char(current_date, 'YYMM');
  perform pg_advisory_xact_lock(hashtext('gen_expense_no:' || p_division_id::text || ':' || v_yymm));

  select coalesce(max(nullif(substring(expense_no from 7), '')::integer), 0) + 1
  into v_seq
  from public.transport_trip_expenses
  where division_id = p_division_id
    and deleted_at is null
    and expense_no ~ ('^EX' || v_yymm || '[0-9]+$');

  insert into public.transport_trip_expense_sequences (division_id, yymm, last_seq)
  values (p_division_id, v_yymm, v_seq)
  on conflict (division_id, yymm)
  do update set last_seq = excluded.last_seq, updated_at = now();

  return 'EX' || v_yymm || lpad(v_seq::text, 3, '0');
end;
$fn$;

-- 3) Client bills: CB/<FY>/####
create or replace function public.generate_transport_client_bill_no(p_division_id uuid, p_bill_date date)
returns text
language plpgsql
as $fn$
declare
  v_fy text;
  v_next_number integer;
begin
  if p_division_id is null then raise exception 'division_id is required'; end if;
  if p_bill_date is null then raise exception 'bill_date is required'; end if;

  v_fy := public.get_transport_financial_year_label(p_bill_date);
  perform pg_advisory_xact_lock(hashtext('gen_client_bill_no:' || p_division_id::text || ':' || v_fy));

  select coalesce(max((regexp_match(bill_no, '([0-9]+)$'))[1]::integer), 0) + 1
  into v_next_number
  from public.transport_client_bills
  where division_id = p_division_id
    and deleted_at is null
    and bill_no like ('CB/' || v_fy || '/%');

  insert into public.transport_client_bill_number_sequences (division_id, financial_year_label, last_number)
  values (p_division_id, v_fy, v_next_number)
  on conflict (division_id, financial_year_label)
  do update set last_number = excluded.last_number, updated_at = now();

  return 'CB/' || v_fy || '/' || lpad(v_next_number::text, 4, '0');
end;
$fn$;

-- 4) GST invoices: INV/<FY>/####
create or replace function public.generate_transport_gst_invoice_no(p_division_id uuid, p_invoice_date date)
returns text
language plpgsql
as $fn$
declare
  v_fy text;
  v_next_number integer;
begin
  if p_division_id is null then raise exception 'division_id is required'; end if;
  if p_invoice_date is null then raise exception 'invoice_date is required'; end if;

  v_fy := public.get_transport_financial_year_label(p_invoice_date);
  perform pg_advisory_xact_lock(hashtext('gen_gst_invoice_no:' || p_division_id::text || ':' || v_fy));

  select coalesce(max((regexp_match(invoice_no, '([0-9]+)$'))[1]::integer), 0) + 1
  into v_next_number
  from public.transport_gst_invoices
  where division_id = p_division_id
    and deleted_at is null
    and invoice_no like ('INV/' || v_fy || '/%');

  insert into public.transport_gst_invoice_number_sequences (division_id, financial_year_label, last_number)
  values (p_division_id, v_fy, v_next_number)
  on conflict (division_id, financial_year_label)
  do update set last_number = excluded.last_number, updated_at = now();

  return 'INV/' || v_fy || '/' || lpad(v_next_number::text, 4, '0');
end;
$fn$;
