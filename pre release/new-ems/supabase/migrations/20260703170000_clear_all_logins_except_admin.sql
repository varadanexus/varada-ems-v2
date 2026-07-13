-- Sprint 13E.14: Clear all logins except admin@varadanexus.com
--
-- Context: the corresponding Supabase Auth users were already deleted from the
-- Supabase dashboard, leaving only admin@varadanexus.com. This migration removes
-- the remaining application-level login records across all authentication
-- systems, preserving only the EMS Staff admin account.
--
-- Login systems cleared:
--   EMS Staff        -> public.app_users            (keep admin@varadanexus.com)
--   Transport Portal -> public.transport_portal_users
--   External Portal  -> public.external_portal_users
--   Interiors Portal -> public.interior_client_portal_users
--
-- FK safety (verified against the live schema on 2026-07-03):
--   * Non-admin app_users are referenced ONLY by user_roles and user_divisions,
--     both ON DELETE CASCADE. No business/audit table references them, so the
--     deletes succeed without touching operational data.
--   * transport_portal_users cascade-delete their sessions and *_portal_access
--     rows; audit-log references are ON DELETE SET NULL. The single NO ACTION
--     dependency (transport_agent_withdrawal_requests.portal_user_id) is cleared
--     first below.
--   * external_portal_users cascade-delete their session and access rows; audit
--     log references are ON DELETE SET NULL.
--
-- This migration is intentionally destructive and idempotent-safe: re-running it
-- is a no-op once the target rows are gone.

-- 1) Clear the only NO ACTION dependency that would otherwise block transport
--    portal user deletion (withdrawal requests raised by removed portal agents).
delete from public.transport_agent_withdrawal_requests
where portal_user_id in (select id from public.transport_portal_users);

-- 2) Transportation portal logins (clients, transporters, agents).
--    Cascades: transport_portal_sessions, transport_client_portal_access,
--    transport_transporter_portal_access, transport_agent_portal_access.
delete from public.transport_portal_users;

-- 3) External portal logins (vendors / agents / contractors).
--    Cascades: external_portal_sessions, external_portal_access.
delete from public.external_portal_users;

-- 4) Interiors client portal logins (currently none; cleared for completeness).
delete from public.interior_client_portal_users;

-- 5) EMS Staff logins — remove everyone except the admin.
--    Cascades: user_roles, user_divisions for the removed accounts.
delete from public.app_users
where lower(email) <> 'admin@varadanexus.com';
