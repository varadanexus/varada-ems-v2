-- Sprint 13E.13: disable legacy external-portal agent accounts.
-- Agents now authenticate through the transport portal (transport_portal_users
-- + transport_agent_portal_access, PRT-AGT codes). Legacy external_portal_users
-- rows with user_type 'agent' (e.g. BODDU) predate the Agent Portal and route
-- the unified login to external_portal_login, which has no agent workspace.
-- Deactivate them so unified_login_lookup no longer surfaces a dead login path.

update public.external_portal_users
set status = 'disabled',
    updated_at = now()
where user_type = 'agent'
  and status <> 'disabled';

-- Revoke any active external access grants tied to those legacy agent users.
update public.external_portal_access a
set is_active = false,
    revoked_at = now()
from public.external_portal_users u
where a.portal_user_id = u.id
  and u.user_type = 'agent'
  and a.is_active;
