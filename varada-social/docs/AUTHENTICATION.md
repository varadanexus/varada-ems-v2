# Authentication and authorization

## Sign-in flow

1. The user signs in through Supabase Auth.
2. The server refreshes the session in `proxy.ts`.
3. The application resolves active organization membership and role.
4. Route handlers check a named permission before invoking a service.
5. PostgreSQL RLS independently verifies organization membership.
6. Mutations append an audit event in the same database transaction.

Supabase credentials are optional only for local Milestone 1 demo mode. Once
configured, unauthenticated dashboard requests redirect to `/login`.

## Approval authority

| Transition | Minimum role |
| --- | --- |
| Draft → manager review | Content Creator |
| Manager review → admin review | Social Media Manager |
| Admin review → approved | Admin |
| Approved → scheduled/published | Social Media Manager |
| Any override | Super Admin |

Clients may review and comment but cannot publish or edit provider credentials.
Viewers have read-only analytics access.

## Session security

- Secure, HTTP-only, same-site cookies in production.
- Short-lived access tokens with server-managed refresh.
- MFA required for admins and users with publishing permission.
- Session and membership changes revoke active privileged operations.
- Service-role use is restricted to server-only adapters and background jobs.
