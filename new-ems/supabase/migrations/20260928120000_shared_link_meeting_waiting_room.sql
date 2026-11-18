-- Shareable meeting links with no OTP. Guests still wait until the host starts
-- the meeting; the existing private invitation + OTP flow remains unchanged.

alter table public.credentials
  add column if not exists join_method text not null default 'otp_invite';

create index if not exists idx_credentials_meeting_join_method
  on public.credentials(meeting_id, join_method, status);

create table if not exists public.meeting_share_links (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null unique references public.meetings(id) on delete cascade,
  join_token uuid not null unique default gen_random_uuid(),
  is_active boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

alter table public.meeting_share_links enable row level security;

-- Share-link tokens are bearer credentials. Browser clients may only use them
-- through the meetings-integrations Edge Function.
revoke all on table public.meeting_share_links from public, anon, authenticated;
grant all on table public.meeting_share_links to service_role;

comment on table public.meeting_share_links is
  'Server-only bearer links for no-OTP meetings. Guests remain in the waiting room until the meeting is live.';

comment on column public.credentials.join_method is
  'otp_invite for private invitations; shared_link for guests registered through a meeting share link.';
