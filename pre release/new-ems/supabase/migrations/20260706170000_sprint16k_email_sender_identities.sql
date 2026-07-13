-- Sprint 16k: Email sender identities
-- Lets the Email module send as different verified-domain addresses
-- (legal@, transport@, admin@, support@, noreply@, hr@ ...). ZeptoMail verifies
-- at the domain level, so any address on the verified domain is allowed. The
-- edge function only permits sending as an ACTIVE row here, which prevents
-- arbitrary from-address spoofing.

create table if not exists public.email_senders (
  id uuid primary key default gen_random_uuid(),
  sender_key text not null unique,
  label text not null,
  from_name text not null,
  from_email text not null,
  reply_to_email text,
  reply_to_name text,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_email_senders_active on public.email_senders(is_active, sort_order);

-- Record which identity sent each outbound email.
alter table public.email_outbox add column if not exists from_email text;
alter table public.email_outbox add column if not exists from_name text;

alter table public.email_senders enable row level security;

drop policy if exists email_senders_select on public.email_senders;
create policy email_senders_select on public.email_senders
  for select to authenticated
  using (public.current_user_has_any_role(array['super_admin', 'admin']));

-- Seed the requested identities on the verified domain. from_name/reply_to can
-- be edited later in Email → Provider Settings.
insert into public.email_senders (sender_key, label, from_name, from_email, reply_to_email, reply_to_name, sort_order)
values
  ('admin',     'Administration', 'Varada Nexus Admin',     'admin@varadanexus.com',     'admin@varadanexus.com',   'Varada Nexus Admin',     10),
  ('support',   'Support',        'Varada Nexus Support',   'support@varadanexus.com',   'support@varadanexus.com', 'Varada Nexus Support',   20),
  ('legal',     'Legal',          'Varada Nexus Legal',     'legal@varadanexus.com',     'legal@varadanexus.com',   'Varada Nexus Legal',     30),
  ('transport', 'Transport',      'Varada Nexus Transport', 'transport@varadanexus.com', 'transport@varadanexus.com','Varada Nexus Transport', 40),
  ('hr',        'HR',             'Varada Nexus HR',        'hr@varadanexus.com',        'hr@varadanexus.com',      'Varada Nexus HR',        50),
  ('noreply',   'No-Reply',       'Varada Nexus',           'noreply@varadanexus.com',   null,                      null,                     60)
on conflict (sender_key) do nothing;
