-- ARCHIVED DIRECT-PRODUCTION SQL: not part of the active migration chain.
-- Sprint 13E.9 (applied to remote via MCP: unified_invoice_sequence_and_purge_bill)
-- 1) ONE shared invoice sequence per division per FY across GST invoices and client
--    bills: INV/GB/<yy-yy>/<nn>; both generators scan the union under a shared lock.
-- 2) purge_transport_client_bill: hard delete draft/cancelled bills into the vault
--    (blocked when GST invoices, receipts, or credit notes reference the bill).
-- 3) Existing bill INVC/260630/001 renumbered to INV/GB/26-27/01 (+ financial_documents).
-- See remote migration for full definitions of:
--   next_unified_invoice_no(uuid, date)
--   generate_transport_gst_invoice_no(uuid, date)  -> next_unified_invoice_no
--   generate_transport_client_bill_no(uuid, date)  -> next_unified_invoice_no
--   purge_transport_client_bill(uuid)

create or replace function public.next_unified_invoice_no(p_division_id uuid, p_doc_date date)
returns text
language plpgsql
as $fn$
declare
  v_fy text;
  v_next integer;
begin
  if p_division_id is null then raise exception 'division_id is required'; end if;
  if p_doc_date is null then raise exception 'document date is required'; end if;

  v_fy := public.get_transport_fy_short_label(p_doc_date);
  perform pg_advisory_xact_lock(hashtext('gen_inv_gb:' || p_division_id::text || ':' || v_fy));

  select coalesce(max(seq), 0) + 1 into v_next
  from (
    select (regexp_match(invoice_no, '([0-9]+)$'))[1]::integer as seq
    from public.transport_gst_invoices
    where division_id = p_division_id and deleted_at is null
      and invoice_no like ('INV/GB/' || v_fy || '/%')
    union all
    select (regexp_match(bill_no, '([0-9]+)$'))[1]::integer
    from public.transport_client_bills
    where division_id = p_division_id and deleted_at is null
      and bill_no like ('INV/GB/' || v_fy || '/%')
  ) s;

  return 'INV/GB/' || v_fy || '/' || lpad(v_next::text, greatest(2, length(v_next::text)), '0');
end;
$fn$;

create or replace function public.generate_transport_gst_invoice_no(p_division_id uuid, p_invoice_date date)
returns text language plpgsql as $fn$
begin
  return public.next_unified_invoice_no(p_division_id, p_invoice_date);
end;
$fn$;

create or replace function public.generate_transport_client_bill_no(p_division_id uuid, p_bill_date date)
returns text language plpgsql as $fn$
begin
  return public.next_unified_invoice_no(p_division_id, p_bill_date);
end;
$fn$;

create or replace function public.purge_transport_client_bill(p_bill_id uuid)
returns text
language plpgsql
security definer
set search_path = public, internal
as $fn$
declare
  v_bill jsonb;
  v_no text;
  v_status text;
  v_division uuid;
  v_children jsonb;
  v_user uuid;
begin
  v_user := public.current_app_user_id();
  if v_user is null then raise exception 'Not authorized'; end if;

  select to_jsonb(b), b.bill_no, b.status, b.division_id into v_bill, v_no, v_status, v_division
  from public.transport_client_bills b where b.id = p_bill_id;
  if v_bill is null then raise exception 'Bill not found'; end if;
  if v_status = 'approved' then raise exception 'Approved bill cannot be deleted'; end if;

  if exists (select 1 from public.transport_gst_invoices where client_bill_id = p_bill_id and deleted_at is null) then
    raise exception 'Bill % has a GST invoice and cannot be deleted', v_no;
  end if;
  if exists (select 1 from public.transport_client_receipts where client_bill_id = p_bill_id and deleted_at is null) then
    raise exception 'Bill % has receipts and cannot be deleted', v_no;
  end if;
  if exists (select 1 from public.transport_client_credit_notes where client_bill_id = p_bill_id and deleted_at is null) then
    raise exception 'Bill % has credit notes and cannot be deleted', v_no;
  end if;

  v_children := jsonb_build_object(
    'bill_trips', coalesce((select jsonb_agg(to_jsonb(t)) from public.transport_client_bill_trips t where t.bill_id = p_bill_id), '[]'::jsonb)
  );

  insert into internal.archived_records (entity_type, entity_id, entity_no, division_id, payload, children, purged_by)
  values ('transport_client_bill', p_bill_id, v_no, v_division, v_bill, v_children, v_user);

  delete from public.transport_client_bill_trips where bill_id = p_bill_id;
  delete from public.transport_client_bills where id = p_bill_id;
  return v_no;
end;
$fn$;

update public.transport_client_bills
set bill_no = 'INV/GB/26-27/01', updated_at = now()
where bill_no = 'INVC/260630/001' and deleted_at is null;

update public.financial_documents
set source_document_no = 'INV/GB/26-27/01'
where source_document_no = 'INVC/260630/001';
