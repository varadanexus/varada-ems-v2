-- Explicit user-requested hard reset of Transportation and Central Accounts
-- transactional/test data. Master data, users, permissions, roles, divisions,
-- company profile, GST registrations, COA, fiscal years, periods, bank/cash
-- masters, and rate/party/vehicle masters are intentionally retained.

-- Statutory/compliance working data.
delete from public.gst_2b_items;
delete from public.gst_2b_import_batches;
delete from public.gst_document_classifications;
delete from public.gst_return_periods;
delete from public.statutory_filing_records;
delete from public.annual_tax_workpapers;

-- Central Accounts dependent records before source financial documents.
delete from public.central_accounts_audit_events;
delete from public.receivable_allocations;
delete from public.payable_allocations;
delete from public.receivable_open_items;
delete from public.payable_open_items;
delete from public.document_postings;
delete from public.posting_queue;
delete from public.journal_lines;
update public.journal_entries set reversal_of_journal_id = null where reversal_of_journal_id is not null;
delete from public.journal_entries;
delete from public.financial_documents;

-- Transportation finance chain.
delete from public.transport_ledger_entries;
delete from public.transport_client_credit_notes;
delete from public.transport_client_receipts;
delete from public.transport_transporter_payments;
delete from public.transport_gst_invoices;
delete from public.transport_client_bill_trips;
delete from public.transport_transporter_statement_trips;
delete from public.transport_client_bills;
delete from public.transport_transporter_statements;

-- Transportation operational transactions.
delete from public.transport_agent_withdrawal_requests;
delete from public.transport_agent_penalties;
delete from public.transport_trip_documents;
delete from public.transport_trip_expenses;
delete from public.transport_trip_timeline;
delete from public.transport_trips;

-- Reset transactional document numbering.
delete from public.transport_trip_number_sequences;
delete from public.transport_trip_expense_sequences;
delete from public.transport_client_bill_number_sequences;
delete from public.transport_client_credit_note_number_sequences;
delete from public.transport_client_receipt_number_sequences;
delete from public.transport_transporter_statement_number_sequences;
delete from public.transport_transporter_payment_number_sequences;
delete from public.transport_gst_invoice_number_sequences;
delete from public.transport_ledger_entry_number_sequences;
delete from public.central_accounts_posting_number_sequences;

do $$
begin
  if exists (select 1 from public.transport_trips)
     or exists (select 1 from public.transport_client_bills)
     or exists (select 1 from public.transport_transporter_statements)
     or exists (select 1 from public.transport_ledger_entries)
     or exists (select 1 from public.financial_documents)
     or exists (select 1 from public.journal_entries)
     or exists (select 1 from public.posting_queue)
     or exists (select 1 from public.gst_document_classifications)
  then
    raise exception 'Transportation / Central Accounts test-data reset verification failed';
  end if;
end;
$$;
