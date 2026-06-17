# VARADA EMS 2.0 – Central Accounts Role Authority Matrix

## Purpose
Freeze the enterprise financial authority model before database blueprint and implementation work begins.

## Scope
Roles covered:
- `super_admin`
- `admin`
- `accounts_manager`
- `accounts_executive`
- `auditor`
- `ca`
- future `CFO`
- future `CEO`

## Ownership
- business owner: CFO / Central Accounts governance
- operational owner: Accounts Manager

## Assumptions
- Accounts Executive never posts.
- Accounts Manager performs posting.
- Emergency posting allowed only for `super_admin`, `admin`, future `CFO`.
- CEO is read-heavy and oversight-oriented.

## Architecture Rules
- maker-checker mandatory
- posting authority narrower than approval authority
- reversal authority narrower than create authority

## Authority Matrix

| Role | View | Create | Approve | Post | Reverse | Close Period | Reopen Period | Emergency Post |
|---|---|---|---|---|---|---|---|---|
| `super_admin` | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| `admin` | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| `accounts_manager` | Yes | Yes | Yes | Yes | Yes | Yes | Controlled / policy-based | No |
| `accounts_executive` | Yes | Yes | Limited / workflow-specific preparation approval support only | **No** | No | No | No | No |
| `auditor` | Yes | No | No | No | No | No | No | No |
| `ca` | Yes | Limited / review artifacts if policy permits | Yes | No by default in frozen model unless later approved | Yes under controlled policy if founder/CFO approves later, else review-only | Review authority, not default operational close executor | Review-only / escalation role | No |
| future `CFO` | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| future `CEO` | Yes | No | No | No | No | No | No | No |

## Interpretation Notes

### View
- finance-wide visibility
- CEO remains read-only drill-down role

### Create
- means create drafts / prepare controlled finance records

### Approve
- means finance/business readiness approval, not posting

### Post
- creates accounting impact
- denied to `accounts_executive`

### Reverse
- controlled authority due to immutability model

### Close / Reopen Period
- restricted to top finance governance roles

### Emergency Post
- reserved only for `super_admin`, `admin`, future `CFO`

## Security Considerations
- Accounts Executive must never gain indirect posting rights via convenience workflows.
- Emergency posting must always trigger enhanced audit requirements.
- CEO visibility must remain read-only.

## Future Expansion Notes
- sub-roles may later be added for treasury, period close specialist, or tax controller
- CA authority can be expanded later if founder/CFO policy changes
