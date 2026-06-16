# Varada EMS 2.0 – User Role Onboarding Plan
## Sprint 9B.3B | Documentation Only

**Status:** Draft  
**Date:** 2026-06-15  
**Scope:** Documentation only. No code. No database changes. No migrations.

---

## 1. User Types

The following user types exist or are planned for Varada EMS 2.0:

| # | User Type | Description |
|---|-----------|-------------|
| 1 | **Super Admin** | System owner / founder. Full unrestricted access. Manages all users, roles, divisions, and system settings. |
| 2 | **Admin** | Senior administrator. Manages users and roles within assigned scope. May have global or division-level access depending on policy. |
| 3 | **CEO** | Chief Executive Officer. Senior management visibility. Read access across all divisions. May not need write access in all modules. |
| 4 | **CFO** | Chief Financial Officer. Full financial visibility across all divisions. Read/approve access on financial documents. |
| 5 | **CA** | Chartered Accountant. Read-only or read+export access on financial and GST modules. No create or approve rights unless explicitly granted. |
| 6 | **Auditor** | External or internal auditor. Read-only access across assigned or all divisions. Audit trail visibility. |
| 7 | **Division Head** | Head of a specific division (e.g., Transport Division Head). Full access within their assigned division only. |
| 8 | **Accounts Manager** | Senior accounts staff. Can create, approve, and post financial documents within assigned division or globally. |
| 9 | **Accounts Executive** | Junior accounts staff. Can create financial documents. Approve/post requires manager or above. |
| 10 | **Operations Manager** | Manages day-to-day operations within a division. Full operational access, limited financial write access. |
| 11 | **Operator** | Front-line data entry staff. Creates trips, expenses, and operational records. No approve or post permissions. |
| 12 | **Future: Client Portal User** | External client login. Read-only access to their own invoices, statements, and payment records. No internal data visible. |
| 13 | **Future: Transporter Portal User** | External transporter login. Read-only access to their own statements and payment records. |
| 14 | **Future: Agent Portal User** | External agent login. Read-only access to commission statements related to their own accounts. |

---

## 2. Role Mapping

Maps enterprise user designations to technical EMS roles defined in the system.

| Technical Role | Maps To (Enterprise Designations) | Notes |
|----------------|-----------------------------------|-------|
| `super_admin` | Founder / CEO / System Owner | Only 1–2 users should ever hold this role. Not for daily operations. |
| `admin` | Admin / Accounts Manager | Broad administrative rights. Division-scoped or global per policy. |
| `manager` | Division Head / Operations Manager | Division-scoped. Full operational access within their division. |
| `accounts` | Accounts Manager / Accounts Executive | Financial document access. Scope depends on designation (global vs. division). |
| `ca` | CA / Auditor | Read-only or read+export. No create/approve unless explicitly needed. |
| `auditor` | Auditor (internal or external) | Strictly read-only. Can view audit logs. Cannot modify any data. |
| `operator` | Operator / Data Entry Staff | Create operational records only. Cannot approve or post. |
| *(Future)* `client_portal` | Client Portal User | External read-only. Not implemented yet. |
| *(Future)* `transporter_portal` | Transporter Portal User | External read-only. Not implemented yet. |
| *(Future)* `agent_portal` | Agent Portal User | External read-only. Not implemented yet. |

> **Note:** CFO and CEO are currently handled via `super_admin` or `admin` role until a dedicated senior management read-only role is implemented.

---

## 3. Division Assignment Rules

Defines which roles get global access versus division-restricted access.

| Role | Division Scope | Rule |
|------|---------------|------|
| `super_admin` | **Global** | No division restriction. Sees all data across all divisions. |
| `admin` | **Global or Assigned** | Global by default. Can be scoped to a division by policy if needed. |
| `manager` | **Assigned Division Only** | Must be assigned to exactly one division. Cannot view other divisions. |
| `accounts` | **Assigned or Global** | Assigned division if division-level accountant. Global if central accounts team. Determined at user creation. |
| `ca` | **Global (Read-Only)** | Typically global read-only. Can be scoped to a division for compliance purposes. |
| `auditor` | **Global (Read-Only)** | Global read-only by default. Can be scoped to a division for targeted audits. |
| `operator` | **Assigned Division Only** | Must be assigned to exactly one division. No cross-division visibility. |
| *(Future)* Portal Users | **Own Records Only** | Not division-based. Filtered by their own client/transporter/agent record. |

### Rules for Unassigned Division

- If a user has a division-restricted role (`manager`, `operator`) but no division is assigned, they will see **no data** and receive an access error.
- Super admin and admin are not blocked by missing division assignment.
- All division assignments must be set at the time of user creation.

---

## 4. User Creation Workflow

Steps to follow when creating a new user in Varada EMS 2.0.

### Step 1: Create Auth User
- Go to Supabase Auth > Users
- Create new user with official company email
- Set a temporary password (communicate via secure channel — not in writing over chat)
- Do NOT use generic emails (e.g., admin@company.com) for staff logins

### Step 2: Create App User Record
- Open EMS > Admin > Users
- Click "Add User"
- Fill in: Full Name, Email, Employee ID (if applicable)
- Link to the auth user created in Step 1

### Step 3: Assign Role
- Select the appropriate technical role (`admin`, `manager`, `accounts`, `operator`, `ca`, `auditor`)
- Confirm the role maps correctly to the enterprise designation (see Role Mapping table above)
- Only one role per user. No stacking of roles.

### Step 4: Assign Division
- Select the division the user belongs to
- For global-access roles (`super_admin`, `admin`), division assignment is optional
- For division-restricted roles (`manager`, `operator`), division assignment is **mandatory**
- For `accounts`, check if they are central accounts or division-level accounts before assigning

### Step 5: Set Active Status
- Confirm `is_active = true`
- Inactive users cannot log in and will be rejected at the auth layer

### Step 6: Test Login
- Open the EMS in a private/incognito browser window
- Log in with the new user's credentials
- Confirm login succeeds and lands on the correct dashboard

### Step 7: Test Module Visibility
- Verify the sidebar shows only the modules the user's role has access to
- Verify no hidden modules are accidentally visible
- Confirm the user sees only their division's data (for division-restricted roles)

### Step 8: Test Direct URL Access
- Attempt to directly navigate to URLs for restricted modules
- Confirm the system blocks access and redirects to an error or login page
- Do not rely only on sidebar visibility — URL-level access must also be verified

---

## 5. Mandatory Test Users To Create Later

These test accounts do not yet exist. They are to be created when the system moves toward multi-user UAT (User Acceptance Testing). Real passwords are never documented. Use secure credential sharing.

| Test Account Username | Role | Division | Purpose |
|-----------------------|------|----------|---------|
| `test.superadmin` | `super_admin` | Global | Verify global unrestricted access |
| `test.admin` | `admin` | Global | Verify admin-level access, user management |
| `test.accounts` | `accounts` | Transport (or Global) | Verify financial document access |
| `test.manager.transport` | `manager` | Transport | Verify division-scoped manager access |
| `test.operator.transport` | `operator` | Transport | Verify operator create-only restrictions |
| `test.ca` | `ca` | Global | Verify read-only financial access |
| `test.no.division` | `operator` | *(None Assigned)* | Verify that missing division blocks all data |

> **Important:** These are test accounts only. No sensitive or real business data should be created under test logins. All test users must be deactivated (`is_active = false`) before any production handover.

---

## 6. Regression Test Checklist

For every user role, the following tests must be performed and passed before sign-off.

### Per-Role Test Matrix

| Test | `super_admin` | `admin` | `manager` | `accounts` | `operator` | `ca` | `auditor` |
|------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Login** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Sidebar shows correct modules** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Direct URL access blocked for restricted modules** | N/A | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Division access enforced** | N/A | N/A | ✓ | ✓ | ✓ | N/A | N/A |
| **Create records** | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| **Approve documents** | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| **Post / finalise documents** | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| **Export / download reports** | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ |

### Detailed Regression Steps (Per Role)

For each test user:

1. **Login Test**
   - [ ] Login with test credentials
   - [ ] Confirm redirect to correct dashboard
   - [ ] Confirm no error on load

2. **Sidebar Test**
   - [ ] Count sidebar modules visible
   - [ ] Compare against role's permission matrix
   - [ ] Confirm no extra or missing modules

3. **Direct URL Test**
   - [ ] Navigate directly to a restricted module URL
   - [ ] Confirm redirect to 403 / access-denied page or login
   - [ ] Confirm no data is visible even partially

4. **Division Access Test** *(for division-restricted roles)*
   - [ ] Confirm only assigned division's data is returned in all lists
   - [ ] Confirm no other division's trips, clients, or financials are visible

5. **Create Test**
   - [ ] Attempt to create a record (e.g., a trip or expense)
   - [ ] Confirm success for roles with create rights
   - [ ] Confirm blocked (button hidden or action rejected) for read-only roles

6. **Approve Test**
   - [ ] Attempt to approve a pending document
   - [ ] Confirm success for roles with approve rights
   - [ ] Confirm blocked for `operator`, `ca`, `auditor`

7. **Post Test**
   - [ ] Attempt to post/finalise a document
   - [ ] Confirm success for roles with post rights
   - [ ] Confirm blocked for `operator`, `ca`, `auditor`

8. **Export Test**
   - [ ] Attempt to export/download a report or PDF
   - [ ] Confirm success for roles with export rights
   - [ ] Confirm blocked for roles without export permission

---

## 7. Security Rules

These rules are non-negotiable and must be enforced from the first production user onwards.

### Mandatory Policies

1. **No shared logins.** Every staff member gets their own login. No two people share credentials under any circumstance.

2. **No generic admin use.** The `super_admin` login is reserved exclusively for the Founder / System Owner. It is not to be used for daily business operations.

3. **Every staff member gets their own login.** Including part-time, temporary, and contractual staff who need EMS access.

4. **All actions are audit logged.** The system records who performed what action, on which record, and at what time. Audit logs are non-deletable by any role including `super_admin`.

5. **Immediate deactivation on exit.** When any staff member leaves the organisation, their EMS login must be deactivated (`is_active = false`) on the same day — preferably before their last working hour. Access must not persist after exit.

6. **No password sharing over chat or email.** Passwords must be communicated via a secure channel (e.g., in-person, phone call, or a dedicated password manager). Never paste passwords in WhatsApp, email, or any messaging platform.

7. **Temporary passwords must be changed on first login.** All newly created users must be required to set a new password before proceeding to the EMS dashboard.

8. **Role changes require documentation.** If a user's role is changed (e.g., operator promoted to accounts), the change must be documented with a date and reason before being applied in the system.

9. **Test accounts are for testing only.** Test accounts (`test.*`) must never be used in production workflows. They must be deactivated before any production handover.

10. **Portal users (future) are strictly external.** Client, transporter, and agent portal users must have access limited to their own records only. No internal operational data must ever be visible to portal users.

---

## 8. Unresolved Decisions

The following items require founder/management decision before implementation:

| # | Decision Needed | Options | Current Default |
|---|-----------------|---------|-----------------|
| 1 | Should CEO/CFO get a dedicated read-only role or use `super_admin`? | (a) Use `super_admin` / (b) Create new `senior_management` role | Currently using `super_admin` |
| 2 | Should `admin` be global or division-scoped by default? | (a) Always global / (b) Division-scoped unless explicitly set global | TBD |
| 3 | Should `accounts` users be allowed to approve their own documents? | (a) Yes / (b) No — require manager approval above them | TBD |
| 4 | Should `ca` be allowed to export PDFs or only view on-screen? | (a) View + Export / (b) View only | TBD |
| 5 | When should portal users (client/transporter/agent) be implemented? | (a) Sprint 10+ / (b) After full transport module is stable | After full transport stabilisation |
| 6 | Should there be a hard maximum on `super_admin` users? | (a) Yes, max 2 / (b) No formal limit | TBD |
| 7 | Password policy enforcement: minimum length, complexity, expiry? | (a) Enforce via Supabase Auth settings / (b) Manual policy only | Manual policy only (current) |
| 8 | MFA (Multi-Factor Authentication) requirement? | (a) Required for all / (b) Required for `super_admin` and `admin` only / (c) Optional | TBD — recommend required for admin+ |

---

## 9. Recommended Future Test Users Summary

| Username | Role | Division | Priority |
|----------|------|----------|---------|
| `test.superadmin` | `super_admin` | Global | High |
| `test.admin` | `admin` | Global | High |
| `test.accounts` | `accounts` | Transport | High |
| `test.manager.transport` | `manager` | Transport | High |
| `test.operator.transport` | `operator` | Transport | High |
| `test.ca` | `ca` | Global | Medium |
| `test.no.division` | `operator` | None | Medium |
| *(Future)* `test.client.portal` | `client_portal` | N/A | Low (post Sprint 10) |
| *(Future)* `test.transporter.portal` | `transporter_portal` | N/A | Low (post Sprint 10) |
| *(Future)* `test.agent.portal` | `agent_portal` | N/A | Low (post Sprint 10) |

---

*Document created: Sprint 9B.3B — 2026-06-15*  
*No code. No database changes. No migrations. Documentation only.*