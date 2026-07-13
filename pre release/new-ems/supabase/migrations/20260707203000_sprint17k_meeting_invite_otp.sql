-- Sprint 17k: Meeting invitation delivery and OTP-gated guest join

alter table public.credentials
  add column if not exists invite_meta jsonb not null default '{}'::jsonb,
  add column if not exists otp_hash text,
  add column if not exists otp_expires_at timestamptz,
  add column if not exists otp_verified_at timestamptz,
  add column if not exists otp_last_sent_at timestamptz,
  add column if not exists otp_attempt_count integer not null default 0;

create index if not exists idx_credentials_invite_otp_expires_at
  on public.credentials(otp_expires_at);
