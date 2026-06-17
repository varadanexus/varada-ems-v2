# VARADA EMS 2.0 – Interiors Column Catalog

## 1. Purpose
This document defines the logical column catalog for the Sprint 10B.1 Interiors Overlay MVP technical design.

This is a technical design document only.

It does not create implementation artifacts.

---

## 2. Column design principles
- reuse shared project, division, user, approval, audit, and document context wherever possible
- keep overlay columns domain-specific without duplicating shared project lifecycle fields
- preserve version/revision awareness where commercial structures need controlled evolution
- keep finance readiness separate from posting/accounting columns
- support project/package/BOQ-summary billing readiness in MVP

---

## 3. Common column groups

### 3.1 Identity columns
Typical fields:
- `id`
- `code`
- `name`
- `title`

### 3.2 Context columns
Typical fields:
- `project_id`
- `division_id` only where truly needed outside inherited project context
- `space_id`
- `design_package_id`
- `boq_header_id`
- `estimate_header_id`
- `quotation_header_id`
- `variation_header_id`

### 3.3 Governance columns
Typical fields:
- `status`
- `revision_no`
- `is_active`
- `approved_by_app_user_id`
- `approved_at`
- `remarks`

### 3.4 Commercial columns
Typical fields:
- `quantity`
- `unit_id` / `unit_code`
- `rate`
- `amount`
- `estimated_amount`
- `quoted_amount`
- `variation_amount`

### 3.5 Audit/control columns
Typical fields:
- `created_by`
- `updated_by`
- `created_at`
- `updated_at`
- `deleted_at` only where soft-retire behavior is appropriate

---

## 4. Table-wise logical column catalog

## 4.1 `interior_spaces`

### Logical columns
- `id`
- `project_id`
- `parent_space_id` (nullable for hierarchy root)
- `space_code`
- `space_name`
- `space_type`
- `space_order`
- `level_path` or equivalent hierarchy-reference concept
- `status`
- `remarks`
- `created_by`
- `updated_by`
- `created_at`
- `updated_at`

### Validation expectations
- one hierarchical spatial model only
- parent and child must belong to same project
- type must support room/area/zone semantics through values, not separate entities

---

## 4.2 `interior_design_packages`

### Logical columns
- `id`
- `project_id`
- `package_code`
- `package_name`
- `package_type`
- `description`
- `status`
- `revision_no`
- `primary_document_id` (conceptual linkage to shared project documents)
- `created_by`
- `updated_by`
- `created_at`
- `updated_at`

---

## 4.3 `interior_finish_schedules`

### Logical columns
- `id`
- `project_id`
- `space_id` (nullable where package-wide)
- `design_package_id` (nullable)
- `schedule_code`
- `schedule_name`
- `surface_type`
- `finish_spec_summary`
- `status`
- `remarks`
- `created_by`
- `updated_by`
- `created_at`
- `updated_at`

---

## 4.4 `interior_material_specs`

### Logical columns
- `id`
- `project_id`
- `space_id` (nullable)
- `design_package_id` (nullable)
- `spec_code`
- `spec_name`
- `material_category`
- `specification_text`
- `preferred_brand`
- `unit_reference`
- `status`
- `remarks`
- `created_by`
- `updated_by`
- `created_at`
- `updated_at`

---

## 4.5 `interior_boq_headers`

### Logical columns
- `id`
- `project_id`
- `boq_code`
- `boq_name`
- `boq_type`
- `revision_no`
- `base_revision_id` (nullable)
- `status`
- `currency_code`
- `summary`
- `approved_by_app_user_id`
- `approved_at`
- `created_by`
- `updated_by`
- `created_at`
- `updated_at`
- `deleted_at`

---

## 4.6 `interior_boq_lines`

### Logical columns
- `id`
- `boq_header_id`
- `project_id`
- `space_id` (nullable)
- `design_package_id` (nullable)
- `line_code`
- `line_description`
- `scope_category`
- `quantity`
- `unit_id` or governed unit reference
- `rate`
- `amount`
- `line_order`
- `status`
- `remarks`
- `created_by`
- `updated_by`
- `created_at`
- `updated_at`

### Validation expectations
- amount derived from quantity x rate conceptually
- unit governed through shared unit master reuse if available

---

## 4.7 `interior_estimate_headers`

### Logical columns
- `id`
- `project_id`
- `boq_header_id` (nullable if manually seeded)
- `estimate_code`
- `estimate_name`
- `revision_no`
- `base_revision_id` (nullable)
- `status`
- `estimate_total`
- `summary`
- `approved_by_app_user_id`
- `approved_at`
- `created_by`
- `updated_by`
- `created_at`
- `updated_at`
- `deleted_at`

---

## 4.8 `interior_estimate_lines`

### Logical columns
- `id`
- `estimate_header_id`
- `project_id`
- `boq_line_id` (nullable but preferred)
- `space_id` (nullable)
- `line_code`
- `line_description`
- `quantity`
- `unit_reference`
- `rate`
- `amount`
- `cost_category`
- `remarks`
- `created_by`
- `updated_by`
- `created_at`
- `updated_at`

---

## 4.9 `interior_quotation_headers`

### Logical columns
- `id`
- `project_id`
- `estimate_header_id`
- `quotation_code`
- `quotation_name`
- `release_no`
- `status`
- `quotation_total`
- `accepted_status`
- `accepted_at`
- `customer_reference`
- `valid_until`
- `remarks`
- `released_by_app_user_id`
- `released_at`
- `created_by`
- `updated_by`
- `created_at`
- `updated_at`
- `deleted_at`

### Validation expectations
- quotation is a separate release layer derived from estimate
- acceptance status is required in technical design

---

## 4.10 `interior_quotation_lines`

### Logical columns
- `id`
- `quotation_header_id`
- `project_id`
- `estimate_line_id` (nullable but preferred)
- `space_id` (nullable)
- `line_code`
- `line_description`
- `quantity`
- `unit_reference`
- `rate`
- `amount`
- `remarks`
- `created_by`
- `updated_by`
- `created_at`
- `updated_at`

---

## 4.11 `interior_vendor_work_packages`

### Logical columns
- `id`
- `project_id`
- `space_id` (nullable)
- `package_code`
- `package_name`
- `vendor_reference_id`
- `scope_summary`
- `planned_start_date`
- `planned_end_date`
- `status`
- `remarks`
- `created_by`
- `updated_by`
- `created_at`
- `updated_at`

---

## 4.12 `interior_material_plans`

### Logical columns
- `id`
- `project_id`
- `space_id` (nullable)
- `design_package_id` (nullable)
- `vendor_work_package_id` (nullable)
- `material_spec_id` (nullable)
- `plan_code`
- `material_summary`
- `required_quantity`
- `unit_reference`
- `required_by_date`
- `status`
- `remarks`
- `created_by`
- `updated_by`
- `created_at`
- `updated_at`

---

## 4.13 `interior_variation_headers`

### Logical columns
- `id`
- `project_id`
- `variation_code`
- `variation_title`
- `variation_type`
- `status`
- `revision_no`
- `summary`
- `requested_by_app_user_id`
- `approved_by_app_user_id`
- `approved_at`
- `remarks`
- `created_by`
- `updated_by`
- `created_at`
- `updated_at`
- `deleted_at`

---

## 4.14 `interior_variation_lines`

### Logical columns
- `id`
- `variation_header_id`
- `project_id`
- `boq_line_id` (nullable)
- `estimate_line_id` (nullable)
- `space_id` (nullable)
- `change_description`
- `quantity_delta`
- `rate_delta`
- `amount_delta`
- `impact_category`
- `remarks`
- `created_by`
- `updated_by`
- `created_at`
- `updated_at`

---

## 4.15 `interior_billing_readiness_headers`

### Logical columns
- `id`
- `project_id`
- `readiness_code`
- `readiness_title`
- `readiness_scope_type` (project/package/boq_summary)
- `status`
- `summary_billable_amount`
- `approval_status`
- `approved_by_app_user_id`
- `approved_at`
- `remarks`
- `created_by`
- `updated_by`
- `created_at`
- `updated_at`
- `deleted_at`

---

## 4.16 `interior_billing_readiness_lines`

### Logical columns
- `id`
- `billing_readiness_header_id`
- `project_id`
- `vendor_work_package_id` (nullable)
- `boq_line_id` (nullable)
- `variation_line_id` (nullable)
- `line_description`
- `billable_quantity`
- `unit_reference`
- `billable_rate`
- `billable_amount`
- `readiness_reason`
- `remarks`
- `created_by`
- `updated_by`
- `created_at`
- `updated_at`

---

## 5. Phase 2 entity column deepening
- snag and handover fields
- advanced certification fields
- deeper procurement coordination fields

---

## 6. Future entity column deepening
- inventory transaction columns
- procurement execution columns
- labour payment / payout columns
- advanced costing and profitability columns

---

## 7. Final column rule
If a column belongs to shared lifecycle, shared approvals, shared documents/media, or shared audit context, it should remain in Shared Project Engine or enterprise systems rather than being reintroduced in Interiors.