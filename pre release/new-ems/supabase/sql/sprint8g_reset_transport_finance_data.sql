begin;

delete from public.transport_ledger_entries;
delete from public.transport_client_credit_notes;
delete from public.transport_transporter_payments;
delete from public.transport_client_receipts;
delete from public.transport_gst_invoices;
delete from public.transport_transporter_statement_trips;
delete from public.transport_transporter_statements;
delete from public.transport_client_bill_trips;
delete from public.transport_client_bills;

commit;

select 'transport_ledger_entries' as table_name, count(*) as remaining_count from public.transport_ledger_entries
union all
select 'transport_client_credit_notes' as table_name, count(*) as remaining_count from public.transport_client_credit_notes
union all
select 'transport_transporter_payments' as table_name, count(*) as remaining_count from public.transport_transporter_payments
union all
select 'transport_client_receipts' as table_name, count(*) as remaining_count from public.transport_client_receipts
union all
select 'transport_gst_invoices' as table_name, count(*) as remaining_count from public.transport_gst_invoices
union all
select 'transport_transporter_statement_trips' as table_name, count(*) as remaining_count from public.transport_transporter_statement_trips
union all
select 'transport_transporter_statements' as table_name, count(*) as remaining_count from public.transport_transporter_statements
union all
select 'transport_client_bill_trips' as table_name, count(*) as remaining_count from public.transport_client_bill_trips
union all
select 'transport_client_bills' as table_name, count(*) as remaining_count from public.transport_client_bills
order by table_name;