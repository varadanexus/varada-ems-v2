# API design

All application endpoints use `/api/v1`, JSON request bodies, a standard
`{ data, error, meta }` envelope, EMS bearer authentication, Zod validation,
module permissions, and request IDs.

| Method | Endpoint | EMS action | Purpose |
| --- | --- | --- | --- |
| GET | `/api/v1/dashboard` | view | Live operational summary |
| GET/POST | `/api/v1/content` | view/create | Filter or create content |
| GET/PATCH | `/api/v1/content/:id` | view/edit | Read or version content |
| POST | `/api/v1/content/:id/actions` | edit/approve/post | Submit, approve, reject, duplicate, archive, schedule, or publish |
| POST | `/api/v1/generations/text` | create | Generate a cross-platform package |
| POST | `/api/v1/generations/image` | create | Generate and store media |
| GET | `/api/v1/providers` | view | List configured AI providers |
| GET/POST | `/api/v1/trends` | view/edit | List or refresh sourced trend research |
| GET | `/api/v1/analytics` | view | Normalized live metrics |
| GET/POST | `/api/v1/accounts` | view/edit | List or manually connect accounts |
| POST | `/api/v1/accounts/meta/connect` | edit | Start signed Meta OAuth |
| GET | `/api/v1/accounts/meta/callback` | signed state | Complete Meta OAuth |
| GET/PUT | `/api/v1/settings` | view/edit | Mask or update encrypted credentials |
| GET | `/api/v1/audit` | view_audit | Query social audit history |
| POST | `/api/v1/cron/publish` | cron secret | Process due publish jobs |
| POST | `/api/v1/cron/analytics` | cron secret | Synchronize Meta metrics |
| GET/POST | `/api/v1/webhooks/meta` | token/signature | Verify and receive Meta webhooks |
| GET | `/api/health` | public | Liveness check |

Publishing jobs use unique idempotency keys, bounded exponential retry, durable
error payloads, and per-channel post IDs. Provider errors never return tokens,
decrypted secrets, or raw internal system prompts.
