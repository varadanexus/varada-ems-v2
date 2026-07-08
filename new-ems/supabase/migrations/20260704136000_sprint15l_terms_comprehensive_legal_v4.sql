-- Comprehensive Varada Nexus EMS terms v4 and two-step informed acceptance.

update public.legal_terms_versions set is_active = false where is_active;

insert into public.legal_terms_versions(version, title, effective_at, content_hash, is_active)
values (
  '2026-07-04-v4',
  'Varada Nexus EMS Comprehensive Terms, Confidentiality, Acceptable Use and Electronic Consent',
  '2026-07-04 00:00:00+05:30',
  'varada-nexus-ems-comprehensive-terms-v4-two-step-live-face',
  true
)
on conflict (version) do update
set title = excluded.title,
    effective_at = excluded.effective_at,
    content_hash = excluded.content_hash,
    is_active = true;

notify pgrst, 'reload schema';
