-- Remove the current Transportation test finance chain while retaining trips
-- and master data. Dependent central-account and transport-ledger rows are
-- removed first to satisfy restrictive foreign keys.

create temporary table _transport_test_documents on commit drop as
select fd.id
from public.financial_documents fd
where fd.source_module = 'TRANSPORT'
  and (
    fd.source_document_id in (select id from public.transport_client_bills)
    or fd.source_document_id in (select id from public.transport_gst_invoices)
    or fd.source_document_id in (select id from public.transport_client_credit_notes)
    or fd.source_document_id in (select id from public.transport_client_receipts)
    or fd.source_document_id in (select id from public.transport_transporter_statements)
    or fd.source_document_id in (select id from public.transport_transporter_payments)
  );

create temporary table _transport_test_journals on commit drop as
select je.id
from public.journal_entries je
where je.financial_document_id in (select id from _transport_test_documents)
   or (
     je.source_module = 'TRANSPORT'
     and je.source_document_id in (
       select source_document_id
       from public.financial_documents
       where id in (select id from _transport_test_documents)
     )
   );

create temporary table _transport_test_posting_queue on commit drop as
select q.id
from public.posting_queue q
where q.financial_document_id in (select id from _transport_test_documents);

delete from public.central_accounts_audit_events
where financial_document_id in (select id from _transport_test_documents)
   or journal_entry_id in (select id from _transport_test_journals)
   or posting_queue_id in (select id from _transport_test_posting_queue);

delete from public.receivable_allocations
where receivable_item_id in (
  select id from public.receivable_open_items
  where financial_document_id in (select id from _transport_test_documents)
)
or applied_document_id in (select id from _transport_test_documents);

delete from public.payable_allocations
where payable_item_id in (
  select id from public.payable_open_items
  where financial_document_id in (select id from _transport_test_documents)
)
or applied_document_id in (select id from _transport_test_documents);

delete from public.receivable_open_items
where financial_document_id in (select id from _transport_test_documents);

delete from public.payable_open_items
where financial_document_id in (select id from _transport_test_documents);

delete from public.document_postings
where financial_document_id in (select id from _transport_test_documents)
   or journal_entry_id in (select id from _transport_test_journals)
   or reversal_journal_entry_id in (select id from _transport_test_journals);

delete from public.posting_queue
where id in (select id from _transport_test_posting_queue);

delete from public.journal_lines
where journal_entry_id in (select id from _transport_test_journals);

update public.journal_entries
set reversal_of_journal_id = null
where id in (select id from _transport_test_journals)
  and reversal_of_journal_id in (select id from _transport_test_journals);

delete from public.journal_entries
where id in (select id from _transport_test_journals);

delete from public.financial_documents
where id in (select id from _transport_test_documents);

delete from public.transport_ledger_entries
where source_id in (
  select id from public.transport_client_bills
  union select id from public.transport_gst_invoices
  union select id from public.transport_client_credit_notes
  union select id from public.transport_client_receipts
  union select id from public.transport_transporter_statements
  union select id from public.transport_transporter_payments
);

-- Child/source documents before their parent bills and statements.
delete from public.transport_client_credit_notes;
delete from public.transport_client_receipts;
delete from public.transport_transporter_payments;
delete from public.transport_gst_invoices;
delete from public.transport_client_bill_trips;
delete from public.transport_transporter_statement_trips;
delete from public.transport_client_bills;
delete from public.transport_transporter_statements;

-- Reset document numbering because all corresponding test documents are gone.
delete from public.transport_client_bill_number_sequences;
delete from public.transport_client_credit_note_number_sequences;
delete from public.transport_client_receipt_number_sequences;
delete from public.transport_transporter_statement_number_sequences;
delete from public.transport_transporter_payment_number_sequences;
delete from public.transport_ledger_entry_number_sequences;
