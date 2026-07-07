-- ARCHIVED DIRECT-PRODUCTION SQL: not part of the active migration chain.
-- Sprint 13E.8c (applied to remote via MCP: client_bill_legacy_format_and_renumber)
-- Client bills use legacy format INVC/<YYMMDD>/<nnn> (per division, per day);
-- existing bill CB/26-27/0007 (2026-06-30) renumbered to INVC/260630/001 incl.
-- its financial_documents reference.

create or replace function public.generate_transport_client_bill_no(p_division_id uuid, p_bill_date date)
returns text
language plpgsql
as $fn$
declare
  v_day text;
  v_next integer;
begin
  if p_division_id is null then raise exception 'division_id is required'; end if;
  if p_bill_date is null then raise exception 'bill_date is required'; end if;

  v_day := to_char(p_bill_date, 'YYMMDD');
  perform pg_advisory_xact_lock(hashtext('gen_client_bill_no:' || p_division_id::text || ':' || v_day));

  select coalesce(max((regexp_match(bill_no, '([0-9]+)$'))[1]::integer), 0) + 1
  into v_next
  from public.transport_client_bills
  where division_id = p_division_id
    and deleted_at is null
    and bill_no like ('INVC/' || v_day || '/%');

  return 'INVC/' || v_day || '/' || lpad(v_next::text, greatest(3, length(v_next::text)), '0');
end;
$fn$;

update public.transport_client_bills
set bill_no = 'INVC/' || to_char(bill_date, 'YYMMDD') || '/001',
    updated_at = now()
where bill_no = 'CB/26-27/0007' and deleted_at is null;

update public.financial_documents
set source_document_no = 'INVC/260630/001'
where source_document_no = 'CB/26-27/0007';
