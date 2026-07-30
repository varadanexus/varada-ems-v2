# Security checklist

- [x] EMS authentication is verified at every API boundary.
- [x] Module permission checks cover view, create, edit, approve, post, export,
  and audit actions.
- [x] Provider secrets and account tokens use AES-256-GCM encryption at rest.
- [x] Secret values are masked and never returned by settings APIs.
- [x] Publishing uses idempotency keys and bounded exponential retries.
- [x] Meta webhook signatures and OAuth state values are cryptographically
  verified.
- [x] Cron endpoints require a dedicated bearer secret.
- [x] AI reference material is clearly delimited as untrusted data.
- [x] Request payloads are schema validated and generation endpoints are rate
  limited.
- [x] Approval transitions and privileged mutations are audit logged.
- [x] Supabase RLS is enabled for every social table.
- [ ] Rotate provider and social account credentials according to the
  organization key-rotation schedule.
- [ ] Restrict production egress to configured AI, Meta, Supabase, and n8n
  endpoints.
- [ ] Configure production monitoring alerts and periodic access reviews.
