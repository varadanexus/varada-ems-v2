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
  try {
    const stored = JSON.parse(localStorage.getItem(LOCAL_SESSION_KEY) || "null");
    return Boolean(stored?.sessionToken);
  } catch {
    return false;
  }
}

// Bind (or rebind) the local staff JWT. On a fresh local login the existing
// normal-auth client is discarded; subsequent protected pages initialise in
// local mode from the stored session before their first database request.
export function setLocalAuthToken(token) {
  localAuthToken = token || null;
  if (localAuthToken && clientMode && clientMode !== "local") {
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

  const useLocalSession = hasStoredLocalSession();
  const options = useLocalSession
    ? {
        // Supabase's supported custom-JWT path. The callback is evaluated for
        // each request, so tokens re-minted by restoreLocalSession() and the
        // refresh timer are used without recreating page-level clients.
        accessToken: async () => localAuthToken || null,
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
