-- Sprint 16G: clear Legal module transactional/test data only.
-- Keeps permissions, roles, routes, provider settings/secrets and schema intact.

delete from public.legal_archive_files;
delete from public.legal_provider_events;
delete from public.legal_signing_evidence;
delete from public.legal_signing_requests;

update public.legal_agreements
set current_version_id = null
where current_version_id is not null;

delete from public.legal_agreement_versions;
delete from public.legal_agreements;

notify pgrst, 'reload schema';
