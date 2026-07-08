-- ARCHIVED DIRECT-PRODUCTION SQL: not part of the active migration chain.
-- Sprint 13E.8 (applied to remote via MCP: purge_vault_and_legacy_number_formats)
-- 1) internal.archived_records: restricted vault schema (not exposed via PostgREST).
-- 2) purge_transport_trip / purge_transport_gst_invoice: hard delete + JSON snapshot.
-- 3) list_system_maintenance_entries: super-admin-only vault reader.
-- 4) legacy number formats: INV/GB/<yy-yy>/<nn>, TSTAT/<YYMMDD>/<nnn>.

create schema if not exists internal;

create table if not exists internal.archived_records (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  entity_no text,
  division_id uuid,
  payload jsonb not null,
  children jsonb,
  purged_by uuid,
  purged_at timestamptz not null default now()
);
create index if not exists idx_internal_archived_records_type on internal.archived_records (entity_type, purged_at desc);

revoke all on schema internal from public, anon, authenticated;
revoke all on internal.archived_records from public, anon, authenticated;

create or replace function public.purge_transport_trip(p_trip_id uuid)
returns text
language plpgsql
security definer
set search_path = public, internal
as $fn$
declare
  v_trip jsonb;
  v_trip_no text;
  v_division uuid;
  v_children jsonb;
  v_user uuid;
begin
  v_user := public.current_app_user_id();
  if v_user is null then raise exception 'Not authorized'; end if;

  select to_jsonb(t), t.trip_no, t.division_id into v_trip, v_trip_no, v_division
  from public.transport_trips t where t.id = p_trip_id;
  if v_trip is null then raise exception 'Trip not found'; end if;

  if exists (select 1 from public.transport_client_bill_trips where trip_id = p_trip_id) then
    raise exception 'Trip % is linked to client bills and cannot be deleted', v_trip_no;
  end if;
  if exists (select 1 from public.transport_transporter_statement_trips where trip_id = p_trip_id) then
    raise exception 'Trip % is linked to transporter statements and cannot be deleted', v_trip_no;
  end if;

  v_children := jsonb_build_object(
    'documents', coalesce((select jsonb_agg(to_jsonb(d)) from public.transport_trip_documents d where d.trip_id = p_trip_id), '[]'::jsonb),
    'expenses',  coalesce((select jsonb_agg(to_jsonb(e)) from public.transport_trip_expenses e where e.trip_id = p_trip_id), '[]'::jsonb),
    'timeline',  coalesce((select jsonb_agg(to_jsonb(l)) from public.transport_trip_timeline l where l.trip_id = p_trip_id), '[]'::jsonb)
  );

  insert into internal.archived_records (entity_type, entity_id, entity_no, division_id, payload, children, purged_by)
  values ('transport_trip', p_trip_id, v_trip_no, v_division, v_trip, v_children, v_user);

  delete from public.transport_trip_expenses where trip_id = p_trip_id;
  delete from public.transport_trip_documents where trip_id = p_trip_id;
  delete from public.transport_trips where id = p_trip_id;

  return v_trip_no;
end;
$fn$;

create or replace function public.purge_transport_gst_invoice(p_invoice_id uuid)
returns text
language plpgsql
security definer
set search_path = public, internal
as $fn$
declare
  v_inv jsonb;
  v_no text;
  v_division uuid;
  v_user uuid;
begin
  v_user := public.current_app_user_id();
  if v_user is null then raise exception 'Not authorized'; end if;

  select to_jsonb(i), i.invoice_no, i.division_id into v_inv, v_no, v_division
  from public.transport_gst_invoices i where i.id = p_invoice_id;
  if v_inv is null then raise exception 'Invoice not found'; end if;

  insert into internal.archived_records (entity_type, entity_id, entity_no, division_id, payload, children, purged_by)
  values ('transport_gst_invoice', p_invoice_id, v_no, v_division, v_inv, null, v_user);

  delete from public.transport_gst_invoices where id = p_invoice_id;
  return v_no;
end;
$fn$;

create or replace function public.list_system_maintenance_entries(p_entity_type text default null, p_limit integer default 100)
returns table (id uuid, entity_type text, entity_id uuid, entity_no text, division_id uuid, payload jsonb, children jsonb, purged_by uuid, purged_at timestamptz)
language plpgsql
security definer
set search_path = public, internal
as $fn$
begin
  if not public.is_super_admin() then
    raise exception 'Not authorized';
  end if;
  return query
  select a.id, a.entity_type, a.entity_id, a.entity_no, a.division_id, a.payload, a.children, a.purged_by, a.purged_at
  from internal.archived_records a
  where (p_entity_type is null or a.entity_type = p_entity_type)
  order by a.purged_at desc
  limit least(coalesce(p_limit, 100), 500);
end;
$fn$;

create or replace function public.get_transport_fy_short_label(p_date date)
returns text
language sql
immutable
as $fn$
  select lpad(((case when extract(month from p_date) >= 4 then extract(year from p_date) else extract(year from p_date) - 1 end)::int % 100)::text, 2, '0')
      || '-'
      || lpad((((case when extract(month from p_date) >= 4 then extract(year from p_date) else extract(year from p_date) - 1 end)::int + 1) % 100)::text, 2, '0');
$fn$;

create or replace function public.generate_transport_gst_invoice_no(p_division_id uuid, p_invoice_date date)
returns text
language plpgsql
as $fn$
declare
  v_fy text;
  v_next integer;
begin
  if p_division_id is null then raise exception 'division_id is required'; end if;
  if p_invoice_date is null then raise exception 'invoice_date is required'; end if;

  v_fy := public.get_transport_fy_short_label(p_invoice_date);
  perform pg_advisory_xact_lock(hashtext('gen_gst_invoice_no:' || p_division_id::text || ':' || v_fy));

  select coalesce(max((regexp_match(invoice_no, '([0-9]+)$'))[1]::integer), 0) + 1
  into v_next
  from public.transport_gst_invoices
  where division_id = p_division_id
    and deleted_at is null
    and invoice_no like ('INV/GB/' || v_fy || '/%');

  insert into public.transport_gst_invoice_number_sequences (division_id, financial_year_label, last_number)
  values (p_division_id, 'GB-' || v_fy, v_next)
  on conflict (division_id, financial_year_label)
  do update set last_number = excluded.last_number, updated_at = now();

  return 'INV/GB/' || v_fy || '/' || lpad(v_next::text, greatest(2, length(v_next::text)), '0');
end;
$fn$;

create or replace function public.generate_transport_transporter_statement_no(p_division_id uuid, p_statement_date date)
returns text
language plpgsql
as $fn$
declare
  v_day text;
  v_next integer;
begin
  if p_division_id is null then raise exception 'division_id is required'; end if;
  if p_statement_date is null then raise exception 'statement_date is required'; end if;

  v_day := to_char(p_statement_date, 'YYMMDD');
  perform pg_advisory_xact_lock(hashtext('gen_tstat_no:' || p_division_id::text || ':' || v_day));

  select coalesce(max((regexp_match(statement_no, '([0-9]+)$'))[1]::integer), 0) + 1
  into v_next
  from public.transport_transporter_statements
  where division_id = p_division_id
    and deleted_at is null
    and statement_no like ('TSTAT/' || v_day || '/%');

  return 'TSTAT/' || v_day || '/' || lpad(v_next::text, greatest(3, length(v_next::text)), '0');
end;
$fn$;
