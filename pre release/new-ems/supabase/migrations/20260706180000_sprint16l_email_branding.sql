-- Sprint 16l: Dynamic email branding
-- Single-row config that themes every EMS email (module sends, notification
-- fanout, and test emails) plus the Compose live preview. Editable from
-- Email → Provider Settings so branding can change without a redeploy.

create table if not exists public.email_branding (
  id integer primary key default 1,
  company_name text not null default 'Varada Nexus Private Limited',
  eyebrow text,
  logo_url text,
  accent_color text not null default '#e7c976',
  header_bg text not null default '#0f213b',
  footer_text text,
  updated_at timestamptz not null default now(),
  constraint email_branding_singleton check (id = 1)
);

insert into public.email_branding (id, company_name, eyebrow, footer_text)
values (1, 'Varada Nexus Private Limited', 'Varada Nexus Private Limited',
        'Sent by Varada Nexus Private Limited via the EMS transactional email provider.')
on conflict (id) do nothing;

alter table public.email_branding enable row level security;

drop policy if exists email_branding_select on public.email_branding;
create policy email_branding_select on public.email_branding
  for select to authenticated
  using (public.current_user_has_any_role(array['super_admin', 'admin']));
