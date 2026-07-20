# Varada EMS Word-style legal editor

This directory runs the free, self-hosted ONLYOFFICE Docs Community Edition.
It must be hosted at a public HTTPS address that both employee browsers and the
Supabase `legal-integrations` Edge Function can reach.

## Deploy

1. Copy `.env.example` to `.env` and generate a unique 32-byte secret.
2. Run `docker compose up -d` on the document-server host.
3. Put an HTTPS reverse proxy in front of `127.0.0.1:8082`, for example
   `https://office.varadanexus.com`.
4. Set these Supabase Edge Function secrets:

   ```text
   ONLYOFFICE_DOCUMENT_SERVER_URL=https://office.varadanexus.com
   ONLYOFFICE_JWT_SECRET=<the same secret used by Docker>
   ```

5. Apply migration `20260720153000_legal_word_documents.sql`, then deploy the
   `legal-integrations` function.

Do not expose port 8082 directly to the internet. Use HTTPS, firewall the host,
keep the container updated, back up the Docker volumes, and never place the JWT
secret in frontend JavaScript.
