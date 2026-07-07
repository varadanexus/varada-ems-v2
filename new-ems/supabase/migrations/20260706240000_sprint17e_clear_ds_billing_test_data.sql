-- Sprint 17e: Clear Digital Services billing test data
-- Removes all DS invoices, line items, payments, and retainers, plus their
-- not-yet-posted Central Accounts staging rows, and resets the shared invoice
-- register so numbering restarts at INV/GB/<FY>/001.
-- Run only on a clean slate (no live invoices in any module).

-- Central Accounts staging for DS invoices (skip anything already posted to journals).
delete from public.posting_queue
where financial_document_id in (
  select id from public.financial_documents
  where source_module = 'digital-services' and status <> 'posted'
);
delete from public.financial_documents
where source_module = 'digital-services' and status <> 'posted';

-- Digital Services billing data.
delete from public.ds_payments;
delete from public.ds_invoice_items;
delete from public.ds_invoices;
delete from public.ds_subscriptions;

-- Reset the shared central invoice register (also used by Transport / Interiors).
delete from public.central_invoice_number_sequences;
