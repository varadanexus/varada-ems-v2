-- Irreversibly remove all transportation-module test data.
--
-- The environment owner confirmed that the transportation clients and all other
-- transportation records are test data. Shared EMS configuration (users,
-- divisions, roles, permissions, and accounting setup) is intentionally kept.

-- Capture central-accounting records before deleting their transportation
-- source documents. These temporary tables disappear when the migration ends.
create temporary table _transport_documents on commit drop as
select id
from public.financial_documents
where lower(coalesce(source_module, '')) in ('transport', 'transportation');

create temporary table _transport_journals on commit drop as
select id
from public.journal_entries
where financial_document_id in (select id from _transport_documents)
   or lower(coalesce(source_module, '')) in ('transport', 'transportation');

create temporary table _transport_queues on commit drop as
select id
from public.posting_queue
where financial_document_id in (select id from _transport_documents);

-- Remove central-accounting dependants first so the source documents can be
-- deleted without weakening foreign-key constraints.
delete from public.central_accounts_audit_events
where financial_document_id in (select id from _transport_documents)
   or journal_entry_id in (select id from _transport_journals)
   or posting_queue_id in (select id from _transport_queues)
   or lower(coalesce(entity_type, '')) like '%transport%';

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

delete from public.gst_document_classifications
where financial_document_id in (select id from _transport_documents);

delete from public.purchase_bills
where financial_document_id in (select id from _transport_documents);

delete from public.tds_deductions
where financial_document_id in (select id from _transport_documents)
   or journal_entry_id in (select id from _transport_journals);

delete from public.accounting_vouchers
where journal_entry_id in (select id from _transport_journals);

delete from public.fixed_asset_depreciation_runs
where journal_entry_id in (select id from _transport_journals);

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

-- Current transportation finance and trip dependants.
delete from public.transport_client_bill_trips;
delete from public.transport_transporter_statement_trips;
delete from public.transport_client_credit_notes;
delete from public.transport_client_receipts;
delete from public.transport_gst_invoices;
delete from public.transport_transporter_payments;
delete from public.transport_client_bills;
delete from public.transport_transporter_statements;
delete from public.transport_ledger_entries;
delete from public.transport_trip_documents;
delete from public.transport_trip_expenses;
delete from public.transport_trip_timeline;

-- Current transportation portal, agent, mapping, and trip records.
delete from public.transport_portal_audit_logs;
delete from public.transport_portal_sessions;
delete from public.transport_agent_portal_access;
delete from public.transport_client_portal_access;
delete from public.transport_transporter_portal_access;
delete from public.transport_agent_withdrawal_requests;
delete from public.transport_agent_penalties;
delete from public.transport_profit_share_partners;
delete from public.transport_truck_agent_commission_mapping;
delete from public.transport_client_mapping;
delete from public.transport_transporter_mapping;
delete from public.transport_rate_master;
delete from public.transport_trips;
delete from public.transport_portal_users;

-- Current transportation master data.
delete from public.transport_drivers;
delete from public.transport_trucks;
delete from public.transport_truck_owners;
delete from public.transport_clients;
delete from public.transport_transporters;
delete from public.transport_agents;
delete from public.transport_commodities;
delete from public.transport_route_master;
delete from public.transport_ledger_accounts;

-- Current transportation business-number state.
delete from public.transport_client_bill_number_sequences;
delete from public.transport_client_credit_note_number_sequences;
delete from public.transport_client_receipt_number_sequences;
delete from public.transport_gst_invoice_number_sequences;
delete from public.transport_transporter_payment_number_sequences;
delete from public.transport_transporter_statement_number_sequences;
delete from public.transport_ledger_entry_number_sequences;
delete from public.transport_trip_expense_sequences;
delete from public.transport_trip_number_sequences;
delete from public.transport_code_sequences;

-- Retired transportation schema retained for compatibility. It contains test
-- masters as well, so clear it child-first rather than leaving stale data.
delete from public.agent_trip_ledger;
delete from public.agent_commissions;
delete from public.agent_withdraw_requests;
delete from public.client_payments;
delete from public.gst_credit_notes;
delete from public.gst_payments;
delete from public.invoice_trip_breakdown;
delete from public.invoice_trip_breakdown_gst;
delete from public.transporter_adjustments;
delete from public.transporter_invoices;
delete from public.transporter_ledger;
delete from public.transporter_payments;
delete from public.trip_agents;
delete from public.trip_documents;
delete from public.expenses;
delete from public.truck_agents;
delete from public.company_ledger;
delete from public.client_invoices;
delete from public.client_invoices_gst;
delete from public.trips;
delete from public.rates;
delete from public.trucks;
delete from public.agents;
delete from public.clients;
delete from public.commodities;
delete from public.routes;
delete from public.transporters;

-- Remove transportation-tagged traces from shared operational services without
-- touching the services' global configuration or other modules' records.
delete from public.notification_events
where lower(coalesce(module_code, '')) like 'transport%';

delete from public.email_outbox
where lower(coalesce(source_module, '')) like 'transport%';

delete from public.external_portal_access
where lower(coalesce(source_module, '')) like 'transport%';

delete from public.whatsapp_logs
where lower(coalesce(source_module, '')) like 'transport%';

delete from public.whatsapp_messages
where lower(coalesce(source_module, '')) like 'transport%';

delete from public.drive_documents
where lower(coalesce(entity_type, '')) like 'transport%';

delete from public.audit_logs
where lower(coalesce(module_code, '')) like 'transport%';

-- Fail atomically if any transportation-owned record survives.
do $$
declare
  table_to_check text;
  remaining_rows bigint;
  legacy_tables constant text[] := array[
    'agent_commissions', 'agent_trip_ledger', 'agent_withdraw_requests',
    'agents', 'client_invoices', 'client_invoices_gst', 'client_payments',
    'clients', 'commodities', 'company_ledger', 'expenses', 'gst_credit_notes',
    'gst_payments', 'invoice_trip_breakdown', 'invoice_trip_breakdown_gst',
    'rates', 'routes', 'transporter_adjustments', 'transporter_invoices',
    'transporter_ledger', 'transporter_payments', 'transporters', 'trip_agents',
    'trip_documents', 'trips', 'truck_agents', 'trucks'
  ];
begin
  for table_to_check in
    select tablename
    from pg_catalog.pg_tables
    where schemaname = 'public'
      and tablename like 'transport\_%' escape '\'
  loop
    execute format('select count(*) from public.%I', table_to_check)
      into remaining_rows;
    if remaining_rows <> 0 then
      raise exception 'Transportation cleanup verification failed: %.% has % rows',
        'public', table_to_check, remaining_rows;
    end if;
  end loop;

  foreach table_to_check in array legacy_tables
  loop
    execute format('select count(*) from public.%I', table_to_check)
      into remaining_rows;
    if remaining_rows <> 0 then
      raise exception 'Legacy transportation cleanup verification failed: %.% has % rows',
        'public', table_to_check, remaining_rows;
    end if;
  end loop;

  if exists (
       select 1 from public.financial_documents
       where lower(coalesce(source_module, '')) in ('transport', 'transportation')
     )
     or exists (
       select 1 from public.journal_entries
       where lower(coalesce(source_module, '')) in ('transport', 'transportation')
     )
     or exists (
       select 1 from public.central_accounts_audit_events
       where lower(coalesce(entity_type, '')) like '%transport%'
     )
     or exists (
       select 1 from public.notification_events
       where lower(coalesce(module_code, '')) like 'transport%'
     )
     or exists (
       select 1 from public.email_outbox
       where lower(coalesce(source_module, '')) like 'transport%'
     )
     or exists (
       select 1 from public.external_portal_access
       where lower(coalesce(source_module, '')) like 'transport%'
     )
     or exists (
       select 1 from public.whatsapp_logs
       where lower(coalesce(source_module, '')) like 'transport%'
     )
     or exists (
       select 1 from public.whatsapp_messages
       where lower(coalesce(source_module, '')) like 'transport%'
     )
     or exists (
       select 1 from public.drive_documents
       where lower(coalesce(entity_type, '')) like 'transport%'
     )
     or exists (
       select 1 from public.audit_logs
       where lower(coalesce(module_code, '')) like 'transport%'
     )
  then
    raise exception 'Transportation shared-service cleanup verification failed';
  end if;
end;
$$;
