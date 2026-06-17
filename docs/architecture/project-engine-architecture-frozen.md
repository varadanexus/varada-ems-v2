# VARADA EMS 2.0 – Sprint 10A Architecture Frozen

## Status

**Sprint 10A architecture is now FROZEN as of 17 June 2026.**

No further architecture audits, readiness reviews, planning reviews, or implementation audits will be performed for Sprint 10A.

## Frozen Policies

The following policies are now frozen and must be treated as implementation constraints:

1. **Stage** = major execution phase
2. **Task** = operational unit of work
3. **Milestone** = checkpoint that may require approval and may later become overlay trigger input
4. **Simple Projects** may have tasks without stages
5. **Approval categories**: Lifecycle, Milestone, Document/Evidence, Exception
6. **Assignment categories**: Contributor, Coordinator, Project Manager, Viewer/Observer, Approver
7. **Audit severity**: Governance, Operational, Informational

## Scope Exclusions

The following are explicitly excluded from Sprint 10A scope:
- BOQ (Bill of Quantities)
- Quotations / estimates
- Procurement
- Inventory
- Billing
- Vendor workflows
- Costing
- Rooms/areas
- Material/procurement placeholders

## Implementation Status

### Phase 1 – Complete ✅
- Database migrations (project engine foundation)
- RLS policies (all tables)
- Permissions (role-based access control)
- Sequences (project code numbering)
- Audit integration (status history tracking)

### Phase 2 – In Progress 🔄
- Project Engine Dashboard
- Projects
- Approvals

### Phase 3 – Not Started ⬜
- Project Detail Workspace
  - Overview
  - Stages
  - Tasks
  - Milestones
  - Site Updates
  - Media
  - Documents
  - Team
  - Audit

### Phase 4 – Not Started ⬜
- UAT
- Regression testing
- Stabilization

## Migration File

The Sprint 10A.3 foundation migration is at:
`new-ems/supabase/migrations/20260617120500_sprint10a3_project_engine_foundation.sql`

## Key Tables Created
- `project_types` – Project type catalog
- `project_code_sequences` – Numbering sequences
- `project_templates` – Project templates
- `project_template_stages` – Template stage definitions
- `project_template_tasks` – Template task definitions
- `project_template_milestones` – Template milestone definitions
- `projects` – Main project entity
- `project_stages` – Project stages
- `project_tasks` – Project tasks
- `project_milestones` – Project milestones
- `project_assignments` – Team assignments
- `project_site_updates` – Site updates
- `project_media` – Media storage
- `project_documents` – Document storage
- `project_approval_requests` – Approval requests
- `project_status_history` – Status audit trail

## Key Functions Created
- `can_view_project_engine()` – View access check
- `can_manage_project_engine()` – Manage access check
- `can_administer_project_engine()` – Admin access check
- `has_project_assignment_category()` – Assignment check
- `can_view_project_by_id()` – Project view check
- `can_edit_project_by_id()` – Project edit check
- `can_manage_project_assignments_by_id()` – Assignment management check
- `can_approve_project_by_id()` – Approval check
- `next_project_code()` – Project code generation
- `next_project_template_code()` – Template code generation

## Seed Data
- 5 project types (interior, hospital, construction, mining, consultancy)
- 3 project templates (Basic Small, Basic Multi-Stage, Milestone-Driven)
- Template stages, tasks, and milestones seeded
- Global project and template code sequences seeded
- Permissions seeded for all roles (super_admin, admin, manager, operator, accounts, etc.)