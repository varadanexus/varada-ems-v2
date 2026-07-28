# Nexus Social architecture

## Design goals

Nexus Social is an EMS-native, multi-brand modular monolith. It keeps product
development fast while enforcing boundaries that can later become independent
workers or services. Every privileged operation is checked against EMS module
permissions and PostgreSQL RLS, and external side effects are idempotent.

## Runtime topology

```text
Browser / Mobile Web
        |
Next.js application
  |-- Server Components and route handlers
  |-- Auth and RBAC policies
  |-- AI provider router
  |-- Publishing provider registry
        |
  +-----+---------------+----------------+
  |                     |                |
Supabase             n8n workers     Provider APIs
Auth/Postgres/       research,       AI + social
Storage              scheduling      platforms
```

## Source boundaries

| Directory | Responsibility |
| --- | --- |
| `app/` | Routes, layouts, server actions and HTTP endpoints |
| `components/` | Reusable interface and product components |
| `modules/` | Domain rules for auth, content, AI, publishing and analytics |
| `lib/` | Framework and vendor clients |
| `services/` | Application orchestration and external adapters |
| `hooks/` | Browser-side reusable behaviour |
| `types/` | Shared TypeScript contracts |
| `utils/` | Pure utilities |
| `supabase/` | Versioned PostgreSQL migrations and seed data |
| `docs/` | Architecture, API and operations guidance |
| `tests/` | Unit, integration and end-to-end tests |

## Core modules

1. **Identity** — EMS sessions, app users, roles, module permissions and RLS.
2. **Content** — briefs, variants, assets, versions and channel adaptations.
3. **Intelligence** — trends, retrieval, brand context and performance feedback.
4. **Generation** — provider-neutral text and image interfaces with cost logs.
5. **Workflow** — creator → manager → admin → scheduled state machine.
6. **Publishing** — platform adapters, idempotent jobs, retries and token health.
7. **Analytics** — metric ingestion, normalized facts and recommendations.
8. **Administration** — encrypted credentials, policies and immutable audits.

## Trust boundaries

- Browser clients never receive service-role credentials or decrypted secrets.
- Provider tokens are decrypted only inside authorized server operations.
- Content from research and users is untrusted data, never system instruction.
- Publishing uses durable jobs and unique idempotency keys.
- n8n calls signed internal endpoints; it does not bypass application policy.
- Audit events exclude secret values and hash sensitive network metadata.

## Scalability path

Start with a Next.js modular monolith and Supabase. Move trend ingestion,
generation, publishing and metric synchronization to queue-backed workers when
traffic requires it. Provider contracts stay stable, so adding a social network
or AI model does not change existing consumers.
