# Deployment

## Required services

- Node.js 20 or newer
- Supabase project with the EMS migrations applied
- n8n for recurring publishing and analytics synchronization
- HTTPS public application URL for Meta OAuth, webhooks, and public media URLs

## Runtime configuration

Configure every value from `.env.example` in the runtime secret manager. The
Supabase service-role key, encryption key, provider keys, Meta app secret, cron
secret, and webhook signing secrets must never be exposed as public variables.

Set the Meta OAuth redirect URL to:

`https://<social-host>/api/v1/accounts/meta/callback`

Set the Meta webhook URL to:

`https://<social-host>/api/v1/webhooks/meta`

Import `n8n/workflows/social-publishing-and-analytics.json`, then configure:

- `NEXUS_SOCIAL_URL`
- `NEXUS_SOCIAL_CRON_SECRET`

Activate the workflow only after the public health endpoint and connected
accounts are verified.

## Release sequence

1. Run the migration guard and push pending Supabase migrations.
2. Build and test the Next.js application.
3. Deploy the application with runtime secrets.
4. Verify `/api/health`.
5. Complete Meta OAuth from Social Accounts.
6. Publish a test item to a non-production account.
7. Activate n8n and verify publishing and analytics executions.

Docker and Docker Compose files provide the self-hosted application baseline.
