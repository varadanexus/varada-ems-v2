-- Sprint 16m: Email attachments
-- Stores attachment metadata (name, mime, size, Google Drive archive link) for
-- each outbound email. The files themselves are attached to the email via the
-- ZeptoMail API and archived to the organized Google Drive "Email" folder.

alter table public.email_outbox
  add column if not exists attachments jsonb not null default '[]'::jsonb;
