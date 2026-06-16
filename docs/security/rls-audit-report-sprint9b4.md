# VARADA EMS 2.0 – Sprint 9B.4 RLS Audit Report

> **Scope**: Read-only audit of schema/migration sources under `new-ems/supabase/migrations`
>
> **Important note**: This report is **source-based**, not a live database introspection. Findings reflect the effective intent visible in migrations checked into the repository at the time of review.

## 1. Executive Summary

The current security model is **mixed**:

- **Admin foundation tables** (`app_users`, `roles`, `permissions`, `user_roles`, `role_permissions`, `user_divisions`, `divisions`, `system_settings`, `audit_logs`) have **database-enforced role checks** via helper functions such as `is_super_admin()` and `has_permission()`.
- **Most transportation tables** either:
  - have **RLS enabled with fully open `authenticated` policies** (`using (true) with check (true)`), or
  - **have no RLS at all**.

### Core conclusion

For transportation data, the current system is predominantly:

## **A. Frontend-only division enforcement**

not

## **B. Database-enforced division security**

because transportation policies do **not** use `has_division_access()`, and in most cases do not use `has_permission()` either.

### Central Accounts readiness

- **Safe enough for Central Accounts integration now**: core admin/authorization tables only, and only from an RLS perspective.
- **Not safe enough for Central Accounts integration now**: most transportation operational and finance tables.

---

## 2. Methodology

Reviewed:

- all `create table public.*` definitions found in migrations
- all `alter table ... enable row level security`
- all `create policy ... on public.*`
- helper functions:
  - `current_app_user_id()`
  - `is_super_admin()`
  - `has_permission()`
  - `has_division_access()`

Primary sources inspected:

- `20260601005000_sprint2_admin_foundation.sql`
- `20260601013000_sprint3_foundation_hardening.sql`
- `20260601123000_sprint5_phase1_transportation_foundation.sql`
- `20260601142000_sprint6a_trip_operations_foundation.sql`
- `20260601170000_sprint6b_transport_module_owned_parties.sql`
- `20260601195000_transport_trip_expenses_foundation.sql`
- `20260605154500_sprint7a_transport_client_billing_foundation.sql`
- `20260605163500_sprint7b_transport_transporter_statements_foundation.sql`
- `20260605174000_sprint7d_transport_payments_foundation.sql`
- `20260606101500_sprint7e_transport_ledger_foundation.sql`
- `20260609170000_sprint8f_transport_credit_notes_foundation.sql`

---

## 3. Helper Function Review

Defined in `20260601013000_sprint3_foundation_hardening.sql`:

### `current_app_user_id()`
- Maps `auth.uid()` to active `public.app_users.id`
- Used in admin/master-data policies

### `is_super_admin()`
- Checks whether current active app user has role code `super_admin`
- Used in hardened admin/master-data policies

### `has_permission(module_code, action_code)`
- Resolves effective permissions through `user_roles -> roles -> role_permissions -> permissions`
- Used in hardened admin/master-data policies

### `has_division_access(division_code)`
- Checks user assignment in `user_divisions` or `scope = 'all'`, with super-admin bypass
- **Defined, granted, but not actually used in any inspected transportation RLS policy**

### Policy usage verdict

| Function | Defined | Used by policies | Notes |
|---|---:|---:|---|
| `current_app_user_id()` | Yes | Yes | Admin/master tables only |
| `is_super_admin()` | Yes | Yes | Admin/master tables only |
| `has_permission()` | Yes | Yes | Admin/master tables only |
| `has_division_access()` | Yes | **No** | Major gap: division function exists but is not used to secure transportation tables |

---

## 4. Special Analysis: Frontend-only vs Database-enforced Division Security

## Verdict: **Frontend-only division enforcement** for transportation

Why:

1. Many transportation tables have policies like:

```sql
for all to authenticated using (true) with check (true)
```

2. Some transportation master/party tables have **no RLS enablement and no policies at all**.

3. No inspected transportation table policy uses:

```sql
public.has_division_access(...)
```

4. No inspected transportation RLS policy constrains rows by `division_id`.

### Security implication

Any authenticated user who can reach the database through Supabase with table grants intact may be able to read and/or mutate transportation data across divisions unless the frontend blocks them first.

That is not sufficient for Central Accounts hardening.

---

## 5. Table Inventory (public schema from inspected migrations)

### 5.1 Admin / security / system

- `roles`
- `permissions`
- `divisions`
- `app_users`
- `user_roles`
- `role_permissions`
- `user_divisions`
- `system_settings`
- `audit_logs`

### 5.2 Global master data

- `master_clients`
- `master_contractors`
- `master_transporters`
- `master_agents`
- `master_commodities`
- `master_routes`
- `master_units`
- `master_tax_codes`
- `master_document_types`

### 5.3 Transportation master / party / operational / finance

- `transport_truck_owners`
- `transport_trucks`
- `transport_drivers`
- `transport_route_master`
- `transport_rate_master`
- `transport_client_mapping`
- `transport_transporter_mapping`
- `transport_trips`
- `transport_trip_timeline`
- `transport_trip_number_sequences`
- `transport_truck_agent_commission_mapping`
- `transport_code_sequences`
- `transport_clients`
- `transport_transporters`
- `transport_agents`
- `transport_commodities`
- `transport_trip_expense_sequences`
- `transport_trip_expenses`
- `transport_trip_documents`
- `transport_client_bill_number_sequences`
- `transport_client_bills`
- `transport_client_bill_trips`
- `transport_transporter_statement_number_sequences`
- `transport_transporter_statements`
- `transport_transporter_statement_trips`
- `transport_gst_invoice_number_sequences`
- `transport_gst_invoices`
- `transport_client_receipt_number_sequences`
- `transport_transporter_payment_number_sequences`
- `transport_client_receipts`
- `transport_transporter_payments`
- `transport_ledger_accounts`
- `transport_ledger_entry_number_sequences`
- `transport_ledger_entries`
- `transport_client_credit_note_number_sequences`
- `transport_client_credit_notes`

### 5.4 Requested names not found as actual tables

The following requested names were **not found as created public tables** in inspected migrations:

- `transport_rates` → actual table appears to be `transport_rate_master`
- `transport_finance_events` → not found
- `transport_ledger` → actual ledger storage tables are `transport_ledger_accounts` and `transport_ledger_entries`

---

## 6. Policy Inventory and Risk Matrix

Risk scale used:

- **LOW**: RLS enabled and actions constrained by role/helper functions
- **MEDIUM**: RLS enabled but broad authenticated access for limited sensitivity tables
- **HIGH**: RLS enabled but fully open `authenticated` access on business-critical data
- **CRITICAL**: No RLS on division-sensitive transportation tables or equivalent high-value finance tables

### 6.1 Admin / authorization tables specifically requested

| Table | RLS | # Policies | Policy names | SELECT | INSERT | UPDATE | DELETE | Division enforcement | Role enforcement | Authenticated exposure | Risk |
|---|---|---:|---|---|---|---|---|---|---|---|---|
| `app_users` | Yes | 2 | `app_users_select_hardened`, `app_users_update_hardened` | super admin, `users:view`, or self | No explicit insert policy | super admin or `users:edit` | No explicit delete policy | No | **Yes** | Limited to permissioned/self access | **LOW** |
| `user_roles` | Yes | 2 | `user_roles_select_hardened`, `user_roles_write_hardened` | super admin or `users:view` | super admin or `users:edit` | super admin or `users:edit` | super admin or `users:edit` | No | **Yes** | No blanket auth exposure | **LOW** |
| `user_divisions` | Yes | 2 | `user_divisions_select_hardened`, `user_divisions_write_hardened` | super admin or `users:view` | super admin or `users:edit` | super admin or `users:edit` | super admin or `users:edit` | N/A (assignment table) | **Yes** | No blanket auth exposure | **LOW** |
| `roles` | Yes | 2 | `roles_select_hardened`, `roles_write_hardened` | `roles:view` or super admin | super admin or `roles:edit` | super admin or `roles:edit` | super admin or `roles:edit` | No | **Yes** | No blanket auth exposure | **LOW** |
| `permissions` | Yes | 2 | `permissions_select_hardened`, `permissions_write_hardened` | `roles:view` or super admin | super admin or `roles:edit` | super admin or `roles:edit` | super admin or `roles:edit` | No | **Yes** | No blanket auth exposure | **LOW** |
| `role_permissions` | Yes | 2 | `role_permissions_select_hardened`, `role_permissions_write_hardened` | `roles:view` or super admin | super admin or `roles:edit` | super admin or `roles:edit` | super admin or `roles:edit` | No | **Yes** | No blanket auth exposure | **LOW** |

### 6.2 Transportation tables specifically requested

| Table | RLS | # Policies | Policy names | SELECT | INSERT | UPDATE | DELETE | Division enforcement | Role enforcement | Authenticated exposure | Risk |
|---|---|---:|---|---|---|---|---|---|---|---|---|
| `transport_trips` | Yes | 1 | `transport_trips_auth_rw` | any authenticated user | any authenticated user | any authenticated user | any authenticated user | **No** | **No** | **Yes, blanket** | **HIGH** |
| `transport_trip_expenses` | Yes | 1 | `transport_trip_expenses_auth_rw` | any authenticated user | any authenticated user | any authenticated user | any authenticated user | **No** | **No** | **Yes, blanket** | **HIGH** |
| `transport_clients` | **No evidence of RLS** | 0 | — | depends on grants; no policy protection | depends on grants | depends on grants | depends on grants | **No** | **No** | Potential unrestricted access if granted | **CRITICAL** |
| `transport_transporters` | **No evidence of RLS** | 0 | — | depends on grants; no policy protection | depends on grants | depends on grants | depends on grants | **No** | **No** | Potential unrestricted access if granted | **CRITICAL** |
| `transport_trucks` | Yes | 1 | `auth rw transport_trucks` | any authenticated user | any authenticated user | any authenticated user | any authenticated user | **No** | **No** | **Yes, blanket** | **HIGH** |
| `transport_drivers` | Yes | 1 | `auth rw transport_drivers` | any authenticated user | any authenticated user | any authenticated user | any authenticated user | **No** | **No** | **Yes, blanket** | **HIGH** |
| `transport_rate_master` | Yes | 1 | `auth rw transport_rate_master` | any authenticated user | any authenticated user | any authenticated user | any authenticated user | **No** | **No** | **Yes, blanket** | **HIGH** |
| `transport_client_bills` | Yes | 1 | `transport_client_bills_auth_rw` | any authenticated user | any authenticated user | any authenticated user | any authenticated user | **No** | **No** | **Yes, blanket** | **HIGH** |
| `transport_client_credit_notes` | Yes | 1 | `transport_client_credit_notes_auth_rw` | any authenticated user | any authenticated user | any authenticated user | any authenticated user | **No** | **No** | **Yes, blanket** | **HIGH** |
| `transport_client_receipts` | Yes | 1 | `transport_client_receipts_auth_rw` | any authenticated user | any authenticated user | any authenticated user | any authenticated user | **No** | **No** | **Yes, blanket** | **HIGH** |
| `transport_transporter_statements` | Yes | 1 | `transport_transporter_statements_auth_rw` | any authenticated user | any authenticated user | any authenticated user | any authenticated user | **No** | **No** | **Yes, blanket** | **HIGH** |
| `transport_transporter_payments` | Yes | 1 | `transport_transporter_payments_auth_rw` | any authenticated user | any authenticated user | any authenticated user | any authenticated user | **No** | **No** | **Yes, blanket** | **HIGH** |
| `transport_ledger_accounts` | Yes | 1 | `transport_ledger_accounts_auth_rw` | any authenticated user | any authenticated user | any authenticated user | any authenticated user | **No** | **No** | **Yes, blanket** | **HIGH** |
| `transport_ledger_entries` | Yes | 1 | `transport_ledger_entries_auth_rw` | any authenticated user | any authenticated user | any authenticated user | any authenticated user | **No** | **No** | **Yes, blanket** | **HIGH** |

### 6.3 Closely related transportation tables also relevant to Central Accounts

| Table | RLS | # Policies | Policy names | Key finding | Risk |
|---|---|---:|---|---|---|
| `transport_truck_owners` | Yes | 1 | `auth rw transport_truck_owners` | blanket authenticated RW | HIGH |
| `transport_route_master` | Yes | 1 | `auth rw transport_route_master` | blanket authenticated RW | HIGH |
| `transport_client_mapping` | Yes | 1 | `auth rw transport_client_mapping` | blanket authenticated RW | HIGH |
| `transport_transporter_mapping` | Yes | 1 | `auth rw transport_transporter_mapping` | blanket authenticated RW | HIGH |
| `transport_trip_timeline` | Yes | 1 | `transport_trip_timeline_auth_rw` | blanket authenticated RW | HIGH |
| `transport_trip_documents` | Yes | 1 | `transport_trip_documents_auth_rw` | blanket authenticated RW | HIGH |
| `transport_client_bill_trips` | Yes | 1 | `transport_client_bill_trips_auth_rw` | blanket authenticated RW | HIGH |
| `transport_transporter_statement_trips` | Yes | 1 | `transport_transporter_statement_trips_auth_rw` | blanket authenticated RW | HIGH |
| `transport_gst_invoices` | Yes | 1 | `transport_gst_invoices_auth_rw` | blanket authenticated RW | HIGH |
| `transport_client_bill_number_sequences` | Yes | 1 | `transport_client_bill_number_sequences_auth_rw` | blanket authenticated RW | HIGH |
| `transport_transporter_statement_number_sequences` | Yes | 1 | `transport_transporter_statement_number_sequences_auth_rw` | blanket authenticated RW | HIGH |
| `transport_client_receipt_number_sequences` | Yes | 1 | `transport_client_receipt_number_sequences_auth_rw` | blanket authenticated RW | HIGH |
| `transport_transporter_payment_number_sequences` | Yes | 1 | `transport_transporter_payment_number_sequences_auth_rw` | blanket authenticated RW | HIGH |
| `transport_ledger_entry_number_sequences` | Yes | 1 | `transport_ledger_entry_number_sequences_auth_rw` | blanket authenticated RW | HIGH |
| `transport_client_credit_note_number_sequences` | Yes | 1 | `transport_client_credit_note_number_sequences_auth_rw` | blanket authenticated RW | HIGH |

### 6.4 Global master data tables

These are not all in the user’s highlighted list, but they materially affect transportation access patterns.

| Table group | RLS | Enforcement summary | Risk |
|---|---|---|---|
| `master_clients`, `master_contractors`, `master_transporters`, `master_agents`, `master_commodities`, `master_routes`, `master_units`, `master_tax_codes`, `master_document_types` | Yes | SELECT requires `current_app_user_id() is not null`; writes require super admin or `settings:edit` | MEDIUM |

Reason for **MEDIUM** instead of **LOW**: authenticated access is not fully open, but these policies still do not enforce division scoping.

---

## 7. Missing RLS Tables

The following created public tables showed **no inspected RLS enablement and no policy definitions** in reviewed migrations:

- `transport_clients`
- `transport_transporters`
- `transport_agents`
- `transport_commodities`
- `transport_trip_number_sequences`
- `transport_truck_agent_commission_mapping`
- `transport_code_sequences`
- `transport_trip_expense_sequences`

### Requested-table impact

Among the user’s specifically highlighted transportation tables, the most serious missing-RLS items are:

- `transport_clients`
- `transport_transporters`

---

## 8. Missing Division Enforcement

### Division-sensitive tables without DB division checks

All of the following contain `division_id` or are division-bound by design, but their policies do **not** enforce row access by division:

- `transport_truck_owners`
- `transport_trucks`
- `transport_drivers`
- `transport_route_master`
- `transport_rate_master`
- `transport_client_mapping`
- `transport_transporter_mapping`
- `transport_trips`
- `transport_trip_expenses`
- `transport_client_bills`
- `transport_client_bill_trips`
- `transport_transporter_statements`
- `transport_transporter_statement_trips`
- `transport_client_receipts`
- `transport_transporter_payments`
- `transport_gst_invoices`
- `transport_ledger_accounts`
- `transport_ledger_entries`
- `transport_client_credit_notes`
- all related number-sequence tables

### Missing helper-function application

`has_division_access()` exists, but the audit found **no inspected policy using it**.

This is the single clearest indicator that division security is not database-enforced for transportation.

---

## 9. Missing Role Enforcement

Transportation policies generally do **not** use:

- `has_permission(...)`
- `is_super_admin()`
- per-action policies like `FOR SELECT`, `FOR INSERT`, `FOR UPDATE`, `FOR DELETE`

Instead, they commonly use one blanket policy:

```sql
for all to authenticated using (true) with check (true)
```

### Effect

This means the database does not distinguish between:

- read-only users
- operations users
- finance users
- central accounts users
- admins

from an RLS perspective on transportation tables.

---

## 10. Authenticated-user Exposure

### Broad exposure present

The following tables are explicitly exposed to **all authenticated users** with broad read/write capability:

- `transport_truck_owners`
- `transport_trucks`
- `transport_drivers`
- `transport_route_master`
- `transport_rate_master`
- `transport_client_mapping`
- `transport_transporter_mapping`
- `transport_trips`
- `transport_trip_timeline`
- `transport_trip_expenses`
- `transport_trip_documents`
- `transport_client_bills`
- `transport_client_bill_trips`
- `transport_transporter_statements`
- `transport_transporter_statement_trips`
- `transport_client_receipts`
- `transport_transporter_payments`
- `transport_gst_invoices`
- `transport_ledger_accounts`
- `transport_ledger_entries`
- `transport_client_credit_notes`
- associated numbering tables

### Even worse: no-RLS exposure candidates

These may be even more dangerous depending on grants, because RLS is absent in inspected sources:

- `transport_clients`
- `transport_transporters`
- `transport_agents`
- `transport_commodities`

---

## 11. Recommended Remediation Order

### Priority 1 – Critical before Central Accounts

1. Add/verify RLS on missing-RLS transportation party tables:
   - `transport_clients`
   - `transport_transporters`
   - `transport_agents`
   - `transport_commodities`
2. Replace blanket authenticated RW policies on finance-critical tables:
   - `transport_client_bills`
   - `transport_client_credit_notes`
   - `transport_client_receipts`
   - `transport_transporter_statements`
   - `transport_transporter_payments`
   - `transport_ledger_entries`
   - `transport_ledger_accounts`
3. Enforce division constraints in database policies using row-level `division_id` checks and/or `has_division_access(...)`

### Priority 2 – Operational integrity

4. Harden:
   - `transport_trips`
   - `transport_trip_expenses`
   - `transport_trip_documents`
   - `transport_trip_timeline`
5. Split `FOR ALL` blanket policies into action-specific policies

### Priority 3 – Support tables

6. Harden numbering and sequence tables
7. Harden mapping/master transportation tables

### Priority 4 – Alignment / cleanup

8. Standardize policy naming and module permission mapping
9. Ensure Central Accounts-specific permissions are reflected in DB policy logic, not only frontend navigation

---

## 12. Tables Safe for Central Accounts Integration

### Reasonably safe from an RLS standpoint

- `app_users`
- `roles`
- `permissions`
- `user_roles`
- `role_permissions`
- `user_divisions`
- `divisions`
- `system_settings`
- `audit_logs`

### Conditional / partial safety only

- global master tables (`master_*`) are better protected than transportation tables, but still not division-enforced

---

## 13. Tables Requiring Hardening Before Central Accounts

### Must harden before Central Accounts

- `transport_trips`
- `transport_trip_expenses`
- `transport_clients`
- `transport_transporters`
- `transport_trucks`
- `transport_drivers`
- `transport_rate_master`
- `transport_client_bills`
- `transport_client_credit_notes`
- `transport_client_receipts`
- `transport_transporter_statements`
- `transport_transporter_payments`
- `transport_ledger_accounts`
- `transport_ledger_entries`

### Also strongly recommended in same hardening wave

- `transport_trip_timeline`
- `transport_trip_documents`
- `transport_client_bill_trips`
- `transport_transporter_statement_trips`
- `transport_gst_invoices`
- all transport finance numbering tables

---

## 14. Key Findings by Audit Question

### 1. RLS enabled?

- **Yes** for admin tables and many transportation tables
- **No evidence found** for several transportation-owned party/support tables

### 2–7. Policies and CRUD who-can-do-what

- Admin tables: restricted by helper-function-based policies
- Transportation tables: usually one blanket policy granting **all actions to all authenticated users**

### 8. Division enforcement present?

- Admin assignment table exists (`user_divisions`)
- Division helper exists (`has_division_access()`)
- **Transportation policies do not use it**

### 9. Role enforcement present?

- Yes on admin/master-data hardened tables
- No on transportation tables reviewed

### 10. Any authenticated-user exposure?

- **Yes, extensive exposure** across transportation tables

### 11. Risk level?

- Admin/security tables: mostly **LOW**
- Transportation RLS-with-`true` tables: mostly **HIGH**
- Transportation tables with missing RLS: **CRITICAL**

---

## 15. Final Audit Verdict

### Current state

- **Admin authorization layer**: materially hardened
- **Transportation data layer**: **not hardened enough** for Central Accounts

### Most important gap

The database contains division-aware helper logic, but transportation policies do not use it. This leaves division segregation largely dependent on the frontend/application layer.

### Overall security posture for Sprint 9B.4

**Central Accounts should not proceed against transportation finance/operational tables until database-enforced division and role controls replace blanket authenticated access.**
