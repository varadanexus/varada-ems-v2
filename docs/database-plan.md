# EMS 2.0 Database Plan (Proposed)

Documentation only. No application code.

## 1. Design Principles

- Preserve proven Old EMS transportation/accounting logic.
- Split by **division + module** with shared finance and IAM core.
- Avoid CSV foreign keys (e.g., old `trip_ids` string pattern).
- Enforce strong relational integrity and auditable accounting.
- Keep portal access driven by role/division/module assignment.
- Centralize billing logic across all divisions (single billing engine).
- Plan indexing and reporting strategy up front for SaaS-grade performance.
- Include soft-delete and activity-history strategy for sensitive entities.
- Keep schema future-ready for multi-tenant SaaS enablement without redesign.

---

## 2. Core Schema Domains

## A) Identity, Access, Organization

### `tenants` (future-ready, single-tenant active now)
- id
- tenant_code (unique)
- tenant_name
- status
- branding_config_json

Current mode:
- single tenant deployment (`Varada Nexus`) using one active tenant record.

Future mode:
- multi-tenant SaaS can be enabled by onboarding additional tenant records.

### `org_divisions`
- id (pk)
- tenant_id -> tenants.id
- code (unique): `transport`, `construction`, `interior`, `hospital_construction`, `hospital_consultancy`, `imports_exports`, `trading`, `hr_pr`, `arbitrage`, `ecommerce`
- name
- status

### `org_branches`
- id
- tenant_id -> tenants.id
- division_id -> org_divisions.id
- name, location

### `users`
- id
- tenant_id -> tenants.id
- auth_id (Supabase auth id)
- email, phone
- status (`active`, `disabled`)

### `roles`
- id
- tenant_id -> tenants.id
- role_code: `super_admin`, `admin`, `manager`, `operator`, `accounts`, `ca`, `agent`, `contractor`, `client`
- role_name

### `user_roles`
- id
- tenant_id -> tenants.id
- user_id -> users.id
- role_id -> roles.id

### `modules`
- id
- tenant_id -> tenants.id (nullable for global module catalog)
- module_code (unique)
- module_name
- portal_scope

### `permissions`
- id
- tenant_id -> tenants.id (nullable for global action catalog)
- permission_code (view/create/edit/delete/approve/export/post/reverse/upload/send)

### `role_module_permissions`
- id
- tenant_id -> tenants.id
- role_id -> roles.id
- module_id -> modules.id
- permission_id -> permissions.id
- allow (bool)

### `user_division_access`
- id
- tenant_id -> tenants.id
- user_id -> users.id
- division_id -> org_divisions.id
- scope (`full`, `own`, `assigned`)

### `workflow_approvals`
- id
- workflow_type
- reference_table
- reference_id
- requested_by
- approved_by
- status
- remarks

---

## B) Master Data (Cross-Division)

### `clients`
- id
- tenant_id -> tenants.id
- division_id
- client_code, company_name, gst_no, pan_no
- contact details

### `vendors`
- id
- tenant_id -> tenants.id
- division_id
- vendor_type (`contractor`, `supplier`, `transporter`, `service_provider`)
- legal + bank details

### `products_services`
- id
- tenant_id -> tenants.id
- division_id
- type (`commodity`, `service`, `material`, `sku`)
- name, hsn_sac, unit

### `tax_profiles`
- id
- entity_type, entity_id
- gst_registration_type
- gst_state_code

---

## C) Transportation & Minerals Logistics (Preserve Old Logic)

### `routes`
- id
- origin, destination, route_code

### `transporters`
- id
- vendor_id -> vendors.id
- auth_user_id -> users.id (optional)

### `trucks`
- id
- transporter_id -> transporters.id
- truck_number, driver info

### `commodities`
- id
- product_service_id -> products_services.id

### `rate_contracts`
- id
- client_id
- route_id
- commodity_id
- client_rate_per_mt
- effective_from/to

### `transporter_rate_contracts`
- id
- transporter_id
- route_id
- commodity_id
- transporter_rate_per_mt
- effective_from/to

### `trips`
- id
- division_id
- trip_no (unique)
- route_id, client_id, transporter_id, truck_id, commodity_id
- trip_date, status
- weight_kg, load_mt
- client_rate_per_mt, transporter_rate_per_mt
- contract_value, transporter_gross, billing_status

### `trip_expenses`
- id
- trip_id
- expense_type, amount, bill_ref

### `trip_documents`
- id
- trip_id
- doc_type
- drive_file_id, drive_link

### `agent_profiles`
- id
- user_id -> users.id

### `trip_agent_assignments`
- id
- trip_id
- agent_id
- commission_mode (`per_mt`, `percentage_profit`, `fixed`)
- commission_value
- commission_amount

### `agent_ledger_entries`
- id
- agent_id
- trip_id (nullable for payout/reversal)
- entry_type (`commission`, `payout`, `reversal`)
- debit, credit, balance_after

### `agent_withdraw_requests`
- id
- agent_id
- amount
- status (`requested`,`approved`,`rejected`,`paid`)

### `transporter_invoices`
- id
- transporter_id
- invoice_no
- period_from/to
- total_amount, paid_amount, balance_amount, status
- drive_file_id, drive_link

### `transporter_invoice_trips`
- id
- transporter_invoice_id
- trip_id
- gross_amount
- expense_amount
- net_amount

### `transporter_adjustments`
- id
- transporter_invoice_id
- trip_id (nullable)
- adjustment_type (`penalty`,`bonus`,`other`)
- amount

### `transporter_payments`
- id
- transporter_invoice_id
- payment_date, payment_method, txn_id
- amount

### `route_profitability_snapshots`
- id
- route_id
- period_key
- trips_count
- client_value
- transporter_value
- margin

---

## D) Construction / Interior / Hospital / Consultancy Projects

### `projects`
- id
- division_id
- client_id
- project_code, project_name
- start_date, end_date, status
- contract_value

### `project_tasks`
- id
- project_id
- task_name, assigned_to, start_date, deadline, progress, status

### `project_expenses`
- id
- project_id
- expense_type, amount, expense_date

### `project_materials`
- id
- project_id
- item_name, qty, rate, amount

### `project_site_photos`
- id
- project_id
- caption
- drive_file_id, drive_link

### `consultancy_engagements`
- id
- division_id
- client_id
- engagement_type
- fee_model, fee_amount

---

## E) Imports/Exports, Trading, E-Commerce, Arbitrage

### `trade_orders`
- id
- division_id
- order_no
- client_id/vendor_id
- order_type (`purchase`,`sale`,`import`,`export`,`arbitrage`,`ecommerce`)
- currency, exchange_rate
- subtotal, tax_total, total

### `trade_order_items`
- id
- trade_order_id
- product_service_id
- qty, rate, amount

### `shipments`
- id
- trade_order_id
- mode, carrier, tracking_no
- dispatch_date, delivery_date

### `warehouse_inventory`
- id
- division_id
- product_service_id
- qty_on_hand, qty_reserved

---

## F) Unified Accounting & Compliance

### `chart_of_accounts`
- id
- account_code, account_name, account_type

### `journal_entries`
- id
- division_id
- journal_no
- journal_date
- source_module
- source_ref_type
- source_ref_id

### `journal_entry_lines`
- id
- journal_entry_id
- account_id
- debit
- credit
- party_type/party_id

### `ar_invoices`
- id
- division_id
- client_id
- invoice_no
- invoice_date
- subtotal, tax_total, grand_total
- paid_amount, balance_amount

### `ar_invoice_lines`
- id
- ar_invoice_id
- source_type (`trip`,`project`,`trade_order`,`service`)
- source_id
- description, qty, rate, amount

### `ap_bills`
- id
- division_id
- vendor_id
- bill_no, bill_date
- subtotal, tax_total, grand_total
- paid_amount, balance_amount

### `ap_bill_lines`
- id
- ap_bill_id
- source_type/source_id
- description, qty, rate, amount

### `receipts`
- id
- ar_invoice_id
- amount, method, txn_id, receipt_date

### `payments`
- id
- ap_bill_id
- amount, method, txn_id, payment_date

### `gst_documents`
- id
- doc_type (`tax_invoice`,`credit_note`,`debit_note`)
- source_invoice_id
- gst_no, place_of_supply, gst_rate, taxable_value, cgst, sgst, igst

### `gst_return_snapshots`
- id
- period
- division_id
- output_tax, input_tax, net_payable

### `division_pl_snapshots`
- id
- division_id
- period
- revenue, cogs, opex, ebitda, net_profit

### `audit_logs`
- id
- actor_user_id
- action
- entity
- entity_id
- old_data, new_data

### `activity_history`
- id
- module_code
- action_type
- reference_type
- reference_id
- actor_user_id
- metadata_json
- created_at

### `system_health_metrics`
- id
- metric_key
- metric_value
- observed_at

---

## G) Centralized Billing Engine (Cross-Division)

All business modules publish billable payloads into one billing core.

### `billing_documents`
- id
- tenant_id -> tenants.id
- division_id
- doc_type (`client_invoice`,`gst_invoice`,`proforma`,`purchase_bill`,`vendor_bill`,`credit_note`,`debit_note`,`receipt`,`voucher`)
- doc_no
- doc_date
- party_type (`client`,`vendor`,`contractor`,`transporter`)
- party_id
- source_module
- source_ref_type
- source_ref_id
- subtotal
- tax_total
- grand_total
- paid_amount
- balance_amount
- status
- soft_deleted_at

### `billing_document_lines`
- id
- tenant_id -> tenants.id
- billing_document_id
- line_type (`trip`,`project`,`stage`,`material`,`service`,`trade_item`,`adjustment`)
- source_ref_type
- source_ref_id
- description
- qty
- unit_rate
- amount
- tax_rate
- tax_amount

### `billing_tax_breakup`
- id
- billing_document_id
- taxable_value
- cgst
- sgst
- igst
- cess

### `billing_receipts`
- id
- billing_document_id
- receipt_date
- amount
- method
- txn_id

### `billing_vouchers`
- id
- billing_document_id
- voucher_date
- amount
- method
- txn_id

### `billing_exports`
- id
- tenant_id -> tenants.id
- export_type (`csv`,`excel`,`pdf`,`ca_pack`,`gst_summary`)
- filter_json
- generated_by
- generated_at
- drive_file_id

### `billing_shares`
- id
- tenant_id -> tenants.id
- billing_document_id
- channel (`whatsapp`,`email`,`link`)
- recipient
- status
- external_ref

### `billing_drive_links`
- id
- tenant_id -> tenants.id
- billing_document_id
- drive_file_id
- drive_link

### `billing_event_inbox`
- id
- tenant_id -> tenants.id
- division_id
- source_module
- source_ref_type
- source_ref_id
- event_type
- payload_json
- processing_status

---

## H) Soft Delete + Audit Columns Standard

Critical tables should include:

- `is_deleted` boolean default false
- `deleted_at` timestamp nullable
- `deleted_by` user id nullable
- `created_at`, `updated_at`, `created_by`, `updated_by`

Critical modules with mandatory soft delete:
- billing documents
- payments/receipts/vouchers
- role-permission assignments
- user access assignments

---

## 3. Key Relationship Summary

- `users` 1-* `user_roles`, `user_division_access`
- `roles` 1-* `role_module_permissions`
- `org_divisions` 1-* (`projects`, `trips`, `trade_orders`, `journal_entries`)
- `trips` 1-* (`trip_expenses`, `trip_documents`, `trip_agent_assignments`)
- `trip_agent_assignments` -> `agent_ledger_entries`
- `transporter_invoices` 1-* `transporter_invoice_trips` and 1-* `transporter_payments`
- `clients` 1-* (`projects`, `ar_invoices`, transport trips)
- `vendors` 1-* (`ap_bills`, `transporters`)
- `journal_entries` 1-* `journal_entry_lines`
- `billing_documents` 1-* `billing_document_lines`
- `billing_documents` 1-* (`billing_receipts`, `billing_vouchers`, `billing_tax_breakup`, `billing_drive_links`)
- `billing_event_inbox` -> `billing_documents` (processed output)

---

## 4. Old EMS Logic Preservation Mapping

- Client rate vs transporter rate retained at trip level.
- Margin accounting retained: contract - transporter side.
- Agent commission modes expanded to include fixed amount.
- GST invoice and credit-note/payment behavior retained through AR + GST tables.
- Transporter payment workflow retained using normalized invoice-trip join.
- Route profitability kept via snapshots/materialized reporting layer.

---

## 5. Migration Notes

1. Migrate old `client_invoices*` into `ar_invoices` + lines + gst_documents.
2. Migrate old `company_ledger` into double-entry journals.
3. Convert `transporter_invoices.trip_ids` CSV into `transporter_invoice_trips` rows.
4. Preserve historical IDs in migration map tables for traceability.

---

## 6. Index Strategy (Performance Baseline)

Plan indexes before production:

- `trips(division_id, trip_date, status, client_id, transporter_id)`
- `trip_expenses(trip_id, expense_type)`
- `billing_documents(division_id, doc_type, doc_date, party_id, status)`
- `billing_document_lines(billing_document_id, source_ref_type, source_ref_id)`
- `billing_receipts(billing_document_id, receipt_date)`
- `billing_vouchers(billing_document_id, voucher_date)`
- `journal_entries(division_id, journal_date, source_module)`
- `journal_entry_lines(journal_entry_id, account_id)`
- `role_module_permissions(role_id, module_id, permission_id)`
- `user_division_access(user_id, division_id)`

Reporting-heavy pages should use views/RPC instead of repeated client-side aggregations.

---

## 7. Future Multi-Tenant Readiness

Objective:
- Keep current deployment single-tenant (Varada Nexus only), while ensuring future SaaS multi-tenant onboarding can be enabled without schema redesign.

Readiness requirements:
- Every core business table should include `tenant_id`.
- All unique constraints should be tenant-scoped where appropriate.
- RLS policy design should include tenant boundary enforcement (`tenant_id = current_tenant`).
- Tenant-specific users, roles, permissions, billing records, and documents must be partitionable by `tenant_id`.
- Division-aware model remains intact under each tenant.

Tenant-specific branding support (future-ready):
- `tenants.branding_config_json` can store logo/theme/navigation labels.
- UI runtime can resolve branding via tenant context (future activation).

Document storage readiness:
- Drive path convention should include tenant root namespace when multi-tenant is enabled.
- Example future path: `/EMS2/{Tenant}/{Division}/{Module}/{Entity}/{YYYY}/{MM}`.

Important constraint:
- Do not enable multi-tenant runtime behavior now.
- Implement only architecture/schema readiness to avoid future redesign cost.
