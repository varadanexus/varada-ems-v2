# VARADA EMS 2.0 – Interiors Audit Strategy

## 1. Purpose
This document defines the audit strategy for the Sprint 10B.1 Interiors Overlay MVP.

It aligns Interiors with the existing EMS 2.0 audit philosophy and Shared Project Engine audit approach.

---

## 2. Audit principles
- reuse existing EMS audit framework
- do not create `interior_audit_logs`
- preserve project, commercial, approval, and readiness context
- log all high-sensitivity release/approval/revision events
- keep future Central Accounts traceability in mind

---

## 3. Audit actor model
Audit actor identity must resolve through existing EMS app user model.

Required actor context:
- actor_app_user_id
- role context where available
- division context
- project context
- overlay entity context

---

## 4. Minimum audit record expectations
Every Interiors audit event should carry at minimum:
- actor_app_user_id
- module_code
- event_type
- entity_type
- entity_id
- division_id
- project_id
- before_data where relevant
- after_data where relevant
- remarks / reason where relevant
- created_at

---

## 5. Mandatory overlay audit events

## 5.1 Spatial events
- interior_space_create
- interior_space_update
- interior_space_restructure
- interior_space_archive

## 5.2 Design/spec events
- interior_design_package_create
- interior_design_package_update
- interior_finish_schedule_update
- interior_material_spec_update

## 5.3 BOQ events
- interior_boq_create
- interior_boq_update
- interior_boq_submit_for_review
- interior_boq_approve
- interior_boq_supersede

## 5.4 Estimate events
- interior_estimate_create
- interior_estimate_update
- interior_estimate_submit_for_review
- interior_estimate_approve
- interior_estimate_supersede

## 5.5 Quotation events
- interior_quotation_create
- interior_quotation_release
- interior_quotation_accept
- interior_quotation_reject
- interior_quotation_expire
- interior_quotation_supersede

## 5.6 Vendor/material planning events
- interior_vendor_work_package_create
- interior_vendor_work_package_update
- interior_material_plan_create
- interior_material_plan_update

## 5.7 Variation events
- interior_variation_create
- interior_variation_submit
- interior_variation_approve
- interior_variation_reject
- interior_variation_cancel
- interior_variation_supersede

## 5.8 Billing-readiness events
- interior_billing_readiness_create
- interior_billing_readiness_update
- interior_billing_readiness_submit
- interior_billing_readiness_approve
- interior_billing_readiness_stage_ready
- interior_billing_readiness_cancel

---

## 6. Immutable history requirements
The following must be treated as immutable historical facts once recorded:
- quotation releases
- quotation acceptance/rejection
- approved BOQ/estimate revisions
- variation decisions
- billing-readiness approvals
- stage-ready transitions for finance handoff

Corrections should be handled by later events or superseding records, not silent rewrite of history.

---

## 7. Before/after expectations

## 7.1 Required before/after capture
Expected for:
- BOQ updates
- estimate updates
- quotation release changes
- variation changes
- billing-readiness changes
- vendor/material planning changes where business impact exists

## 7.2 Event-only capture acceptable
Acceptable for:
- initial release creation
- stage-ready transition when summary context already exists

---

## 8. Audit and approvals relationship
Any overlay approval event must log:
- requesting context
- acting approver
- decision
- remarks/reason
- resulting entity state

This is especially important because billing-readiness approvals may later become finance-originating traces.

---

## 9. Audit and Central Accounts readiness
Interiors does not post finance events.

However, its audit design must preserve enough context so later Central Accounts flows can trace:
- what was approved
- by whom
- at what project/package/BOQ-summary context
- why it became finance-ready

---

## 10. Final audit rule
Interiors audit must be:
- enterprise-integrated
- project-context-aware
- commercial-release-aware
- approval-aware
- future-finance-trace-ready

No duplicate Interiors audit subsystem is permitted.