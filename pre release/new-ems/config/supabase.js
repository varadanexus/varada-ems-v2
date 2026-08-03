import { APP_NAME } from "./constants.js";

let clientInstance = null;
let clientMode = null;
const LOCAL_SESSION_KEY = "ems_local_staff_session";
// Sprint 13F: for LOCAL staff (auth_provider='local') we bind a minted,
// Supabase-compatible JWT as the Authorization header on the client instead of
// using GoTrue sessions. When set, the client runs as that authenticated user
// (auth.uid() = the token's sub), so RLS works exactly as for Supabase-Auth users.
// Supabase-Auth accounts leave this null and continue to use GoTrue normally.
let localAuthToken = null;

function getRuntimeConfig() {
  const runtime = window.EMS_RUNTIME_CONFIG || {};
  return {
    supabaseUrl: runtime.supabaseUrl || "",
    supabaseAnonKey: runtime.supabaseAnonKey || ""
  };
}

function hasStoredLocalSession() {
  for (const storage of [localStorage, sessionStorage]) {
    try {
      const stored = JSON.parse(storage.getItem(LOCAL_SESSION_KEY) || "null");
      if (stored?.sessionToken) return true;
    } catch {}
  }
  return false;
}

// Bind (or rebind) the local staff JWT. The bearer header is immutable on a
// client instance, so both a fresh login and a timed JWT refresh discard the
// previous client before the next authenticated request.
export function setLocalAuthToken(token) {
  const nextToken = token || null;
  const tokenChanged = nextToken !== localAuthToken;
  localAuthToken = nextToken;
  if (localAuthToken && clientMode && (clientMode !== "local" || tokenChanged)) {
    clientInstance = null;
    clientMode = null;
  }
}

export function clearLocalAuthToken() {
  localAuthToken = null;
  if (clientMode === "local") {
    clientInstance = null;
    clientMode = null;
  }
}

export function getSupabaseClient() {
  if (clientInstance) return clientInstance;

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    throw new Error(`${APP_NAME}: Supabase SDK not loaded`);
  }

  const { supabaseUrl, supabaseAnonKey } = getRuntimeConfig();

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(`${APP_NAME}: Missing Supabase runtime config`);
  }

  const useLocalSession = hasStoredLocalSession() && Boolean(localAuthToken);
  const options = useLocalSession
    ? {
        // Keep the normal auth client available while all PostgREST, Storage,
        // Functions, and Realtime requests run as the minted LOCAL identity.
        // Newer supabase-js versions replace client.auth with a throwing proxy
        // when the top-level accessToken option is used; several shared EMS
        // services legitimately need client.auth even during a local session.
        global: { headers: { Authorization: `Bearer ${localAuthToken}` } },
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      }
    : {};

  clientInstance = window.supabase.createClient(supabaseUrl, supabaseAnonKey, options);
  clientMode = useLocalSession ? "local" : "supabase";
  return clientInstance;
}

export async function getSupabaseAccessToken() {
  if (localAuthToken) return localAuthToken;
  const client = getSupabaseClient();
  const { data } = await client.auth.getSession();
  return data?.session?.access_token || "";
}
