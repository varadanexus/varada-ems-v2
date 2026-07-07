-- VARADA EMS 2.0 — Sprint RC1 FINAL hard delete of test business data
-- (Transportation + Interiors business masters/transactions, Central Accounts transactional data)
-- Generated 2026-06-30. Backed up in full to test-data-backup-20260630.json (78 tables, 391 rows)
-- before this script was finalized.
--
-- Explicitly preserved (not touched by this script): users, app_users, auth mappings
-- (user_roles/user_divisions), roles, permissions, role_permissions, divisions,
-- system_settings, all shared master_* tables (master_clients/transporters/agents/
-- commodities/routes/contractors/document_types/tax_codes/units), coa_accounts,
-- fiscal_years, accounting_periods, bank_accounts, cash_accounts, reporting_dimensions,
-- transport_ledger_accounts, every *_number_sequences / *_code_sequences table,
-- Project Engine templates (project_types/project_templates/project_template_*),
-- and audit_logs (general system audit trail).
--
-- reporting_dimensions is deliberately left untouched even though it is an FK parent of
-- deleted rows: leaving unreferenced dimension rows behind is harmless (no FK violation
-- results), and it is closer to master/reference data than to a test transaction.
--
-- This version supersedes the earlier draft: it additionally clears the Transportation and
-- Interiors BUSINESS MASTER tables (transport_clients/transporters/agents/drivers/trucks/
-- truck_owners/route_master/rate_master/client_mapping/transporter_mapping/
-- truck_agent_commission_mapping/commodities, interior_vendors) per explicit instruction
-- that these contain only test data. The shared master_* tables remain preserved as
-- generic platform configuration.
--
-- Order is children-before-parents, computed via topological sort of the live FK graph
-- (information_schema.table_constraints / key_column_usage / constraint_column_usage),
-- not guessed — 78 tables, no cycles. No TRUNCATE. No explicit CASCADE. No FK constraints
-- disabled.

begin;

delete from public.central_accounts_audit_events;
delete from public.document_postings;
delete from public.interior_billing_lines;
delete from public.interior_client_approvals;
delete from public.interior_client_project_access;
delete from public.interior_completion_certificates;
delete from public.interior_design_comments;
delete from public.interior_handover_items;
delete from public.interior_leads;
delete from public.interior_procurements;
delete from public.interior_project_photos;
delete from public.interior_project_team;
delete from public.interior_snag_items;
delete from public.interior_variation_lines;
delete from public.interior_warranty_items;
delete from public.journal_lines;
delete from public.payable_allocations;
delete from public.project_assignments;
delete from public.project_media;
delete from public.project_status_history;
delete from public.project_tasks;
delete from public.receivable_allocations;
delete from public.transport_client_bill_trips;
delete from public.transport_client_credit_notes;
delete from public.transport_client_mapping;
delete from public.transport_client_receipts;
delete from public.transport_gst_invoices;
delete from public.transport_ledger_entries;
delete from public.transport_transporter_mapping;
delete from public.transport_transporter_payments;
delete from public.transport_transporter_statement_trips;
delete from public.transport_trip_documents;
delete from public.transport_trip_expenses;
delete from public.transport_trip_timeline;
delete from public.transport_truck_agent_commission_mapping;
delete from public.posting_queue;
delete from public.interior_billing_headers;
delete from public.interior_client_portal_users;
delete from public.interior_designs;
delete from public.interior_material_plans;
delete from public.interior_site_updates;
delete from public.interior_vendors;
delete from public.interior_quotation_lines;
delete from public.interior_variation_headers;
delete from public.interior_project_closures;
delete from public.journal_entries;
delete from public.payable_open_items;
delete from public.project_site_updates;
delete from public.interior_projects;
delete from public.receivable_open_items;
delete from public.transport_rate_master;
delete from public.transport_client_bills;
delete from public.transport_transporter_statements;
delete from public.transport_trips;
delete from public.interior_estimate_lines;
delete from public.interior_quotation_headers;
delete from public.interior_clients;
delete from public.financial_documents;
delete from public.transport_agents;
delete from public.transport_clients;
delete from public.transport_commodities;
delete from public.transport_drivers;
delete from public.transport_route_master;
delete from public.transport_trucks;
delete from public.interior_boq_lines;
delete from public.interior_estimate_headers;
delete from public.transport_transporters;
delete from public.transport_truck_owners;
delete from public.interior_boq_headers;
delete from public.interior_finish_schedules;
delete from public.interior_material_specs;
delete from public.project_approval_requests;
delete from public.interior_design_packages;
delete from public.interior_spaces;
delete from public.project_documents;
delete from public.project_milestones;
delete from public.project_stages;
delete from public.projects;

-- central_accounts_audit_events.id uses a serial sequence (the only deleted table that
-- does — every other table in this script uses a uuid default, confirmed for all 78
-- tables including the 13 newly-added master tables). The table is now fully empty with
-- no FK or business logic depending on contiguous/historical id values.
alter sequence if exists public.central_accounts_audit_events_id_seq restart with 1;

-- Intentionally NOT touched: every *_number_sequences / *_code_sequences table — explicitly
-- listed as "Number Sequences" under DO NOT TOUCH / "Do NOT reset business numbering
-- sequences." Their current_value counters remain ahead of zero after this cleanup.

commit;
