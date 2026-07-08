import { ROUTES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";

// Interiors Client Portal auth — Supabase Auth based.
//
// Architecture: interior_client_portal_users.auth_user_id links a Supabase Auth user
// to their interior client project. Login = client.auth.signInWithPassword().
// Access check = interiors_portal_list_my_access() SECURITY DEFINER RPC (uses auth.uid()).
//
// The localStorage marker distinguishes interiors portal users from EMS staff,
// both of whom use Supabase Auth. Without the marker, checkExistingSession in
// page-login-unified.js cannot tell them apart.

const STORAGE_KEY = "ems_interiors_portal_session";

export function getStoredInteriorsPortalSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function storeSession(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

// Removes the interiors portal marker and signs out of Supabase Auth (fire-and-forget).
// Kept synchronous so callers do not need to await it when clearing on error.
export function clearStoredInteriorsPortalSession() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
  // Sign out in background — do not block the caller.
  try { getSupabaseClient().auth.signOut().catch(() => {}); } catch {}
}

// Login via Supabase Auth signInWithPassword.
// Confirms project access exists before storing the session marker.
// If no project access is linked, signs back out and throws.
//
// Never call interiors_portal_login RPC (does not exist).
// Never use a session_token for interiors — Supabase Auth JWT handles auth.
export async function interiorsPortalLogin(email, password) {
  const client = getSupabaseClient();

  const { data: authData, error: authError } = await client.auth.signInWithPassword({
    email,
    password
  });
  if (authError) throw authError;
  if (!authData?.session) throw new Error("Authentication failed. Please try again.");

  // Verify at least one active/invited project is linked to this auth user.
  // interiors_portal_list_my_access() uses auth.uid() — JWT is now set.
  const { data: accessRows, error: accessError } = await client.rpc("interiors_portal_list_my_access");
  if (accessError || !accessRows?.length) {
    await client.auth.signOut().catch(() => {});
    throw new Error(
      accessError
        ? "Could not verify portal access. Contact your administrator."
        : "No active project access is linked to this portal account."
    );
  }

  // Store marker + cached access info. isInteriorPortalUser distinguishes this
  // from an EMS Supabase Auth session in checkExistingSession.
  const row = accessRows[0];
  const stored = {
    isInteriorPortalUser: true,
    portalUserId:  row.portal_user_id,
    portalUserCode: row.portal_user_code,
    displayName:   row.client_name,
    clientName:    row.client_name,
    accessStatus:  row.access_status
  };
  storeSession(stored);
  return stored;
}

// No parameters — Supabase Auth JWT is auto-attached, auth.uid() resolves in the RPC.
export async function listMyInteriorsAccess() {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("interiors_portal_list_my_access");
  if (error) throw error;
  return data || [];
}

export async function interiorsPortalLogout() {
  clearStoredInteriorsPortalSession();
}

// Used by interiors portal page modules to gate access.
// Validates: localStorage marker present + Supabase Auth session active + access rows exist.
export async function requireInteriorsPortalSession() {
  const stored = getStoredInteriorsPortalSession();
  if (!stored?.isInteriorPortalUser) {
    window.location.assign(ROUTES.INTERIORS_PORTAL_LOGIN);
    return null;
  }

  const client = getSupabaseClient();
  const { data: { session } } = await client.auth.getSession();
  if (!session) {
    clearStoredInteriorsPortalSession();
    window.location.assign(ROUTES.INTERIORS_PORTAL_LOGIN);
    return null;
  }

  const { data, error } = await client.rpc("interiors_portal_list_my_access");
  if (error || !data?.length) {
    clearStoredInteriorsPortalSession();
    window.location.assign(ROUTES.INTERIORS_PORTAL_LOGIN);
    return null;
  }

  return data[0];
}
