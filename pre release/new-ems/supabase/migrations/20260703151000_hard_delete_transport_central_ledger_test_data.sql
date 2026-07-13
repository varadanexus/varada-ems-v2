-- Complete the requested test-ledger cleanup. The central bridge stores its
-- source module as lowercase "transportation".

create temporary table _transport_documents on commit drop as
select id
from public.financial_documents
where lower(source_module) in ('transport', 'transportation');

create temporary table _transport_journals on commit drop as
select id
from public.journal_entries
where financial_document_id in (select id from _transport_documents)
   or lower(source_module) in ('transport', 'transportation');

create temporary table _transport_queues on commit drop as
select id
from public.posting_queue
where financial_document_id in (select id from _transport_documents);

delete from public.central_accounts_audit_events
where financial_document_id in (select id from _transport_documents)
   or journal_entry_id in (select id from _transport_journals)
   or posting_queue_id in (select id from _transport_queues)
   or lower(entity_type) like '%transport%';

delete from public.receivable_allocations
where receivable_item_id in (
  select id from public.receivable_open_items
  where financial_document_id in (select id from _transport_documents)
)
or applied_document_id in (select id from _transport_documents);

delete from public.payable_allocations
where payable_item_id in (
  select id from public.payable_open_items
  where financial_document_id in (select id from _transport_documents)
)
or applied_document_id in (select id from _transport_documents);

delete from public.receivable_open_items
where financial_document_id in (select id from _transport_documents);

delete from public.payable_open_items
where financial_document_id in (select id from _transport_documents);

delete from public.document_postings
where financial_document_id in (select id from _transport_documents)
   or journal_entry_id in (select id from _transport_journals)
   or reversal_journal_entry_id in (select id from _transport_journals);

delete from public.posting_queue
where id in (select id from _transport_queues);

delete from public.journal_lines
where journal_entry_id in (select id from _transport_journals);

update public.journal_entries
set reversal_of_journal_id = null
where id in (select id from _transport_journals)
  and reversal_of_journal_id in (select id from _transport_journals);

delete from public.journal_entries
where id in (select id from _transport_journals);

delete from public.financial_documents
where id in (select id from _transport_documents);

delete from public.transport_ledger_entries;

do $$
begin
  if exists (select 1 from public.transport_client_bills)
     or exists (select 1 from public.transport_client_receipts)
     or exists (select 1 from public.transport_transporter_statements)
     or exists (select 1 from public.transport_transporter_payments)
     or exists (select 1 from public.transport_ledger_entries)
     or exists (
       select 1 from public.financial_documents
       where lower(source_module) in ('transport', 'transportation')
     )
  then
    raise exception 'Transportation test finance cleanup verification failed';
  end if;
end;
$$;
