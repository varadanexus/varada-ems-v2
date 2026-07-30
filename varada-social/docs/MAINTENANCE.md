# Maintenance

## Daily

- Review failed and retrying publishing jobs.
- Review expired or error-state social accounts.
- Confirm n8n publishing and analytics schedules completed.

## Weekly

- Review pending approvals and archived drafts.
- Validate trend-source freshness.
- Inspect Meta API warnings and webhook delivery health.
- Review provider latency and failed generation records.

## Monthly

- Rotate credentials due under the company policy.
- Export and review the social audit trail.
- Test one publish and analytics synchronization per connected account.
- Review RLS policies and module role assignments.
- Upgrade dependencies after tests and a staging publishing run.

## Incident handling

Pause the n8n publishing workflow, mark affected accounts disconnected, retain
publish and audit records, rotate compromised credentials, and replay only
idempotent failed jobs after root cause resolution.
