# Nexus Social

Enterprise AI social media operations for Varada Nexus Private Limited.

## Local development

From the EMS repository root, run `npm run social:dev`. The local launcher
reuses the linked EMS Supabase project without writing database credentials to
the repository. Open the protected Nexus Social module through EMS.

For production, configure the values in `.env.example` in the runtime secret
manager and follow `docs/DEPLOYMENT.md`.

## Quality checks

- `npm run lint`
- `npm run test`
- `npm run build`

See `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/SECURITY_CHECKLIST.md`, and
`docs/MAINTENANCE.md` for implementation and operations guidance.

The application is registered as the protected `social-media-manager` module in
Varada EMS. See `docs/EMS_INTEGRATION.md` for local and production routing.
