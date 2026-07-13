import { APP_NAME } from "./constants.js";

let clientInstance = null;
// Sprint 13F: for LOCAL staff (auth_provider='local') we bind a minted,
// Supabase-compatible JWT as the Authorization header on the client instead of
// using GoTrue sessions. When set, the client runs as that authenticated user
// (auth.uid() = the token's sub), so RLS works exactly as for Supabase-Auth users.
// The super admin path leaves this null and continues to use GoTrue normally.
let localAuthToken = null;

function getRuntimeConfig() {
  const runtime = window.EMS_RUNTIME_CONFIG || {};
  return {
    supabaseUrl: runtime.supabaseUrl || "",
    supabaseAnonKey: runtime.supabaseAnonKey || ""
  };
}

// Bind (or rebind) the local staff JWT and force the client to be rebuilt so the
// new Authorization header takes effect on every subsequent request.
export function setLocalAuthToken(token) {
  localAuthToken = token || null;
  clientInstance = null;
}

export function clearLocalAuthToken() {
  localAuthToken = null;
  clientInstance = null;
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

  const options = localAuthToken
    ? {
        global: { headers: { Authorization: `Bearer ${localAuthToken}` } },
        auth: { persistSession: false, autoRefreshToken: false }
      }
    : {};

  clientInstance = window.supabase.createClient(supabaseUrl, supabaseAnonKey, options);
  return clientInstance;
}

export async function getSupabaseAccessToken() {
  if (localAuthToken) return localAuthToken;
  const client = getSupabaseClient();
  const { data } = await client.auth.getSession();
  return data?.session?.access_token || "";
}
