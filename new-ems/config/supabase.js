import { APP_NAME } from "./constants.js";

let clientInstance = null;
let clientMode = null;
let reviewerMode = false;
const LOCAL_SESSION_KEY = "ems_local_staff_session";
// Sprint 13F: for LOCAL staff (auth_provider='local') we bind a minted,
// Supabase-compatible JWT as the Authorization header on the client instead of
// using GoTrue sessions. When set, the client runs as that authenticated user
// (auth.uid() = the token's sub), so RLS works exactly as for Supabase-Auth users.
// Supabase-Auth accounts leave this null and continue to use GoTrue normally.
let localAuthToken = null;

const REVIEWER_BOOTSTRAP_RPCS = new Set([
  "get_my_role_codes",
  "get_my_allowed_modules",
  "get_my_permissions"
]);

function emptyReviewerResponse(status = 200) {
  return new Response("[]", {
    status,
    headers: {
      "Content-Type": "application/json",
      "Content-Range": "*/0"
    }
  });
}

async function reviewerSafeFetch(input, init = {}) {
  if (!reviewerMode) return fetch(input, init);

  const url = new URL(typeof input === "string" ? input : input.url, window.location.origin);
  const method = String(init?.method || (typeof input === "string" ? "GET" : input.method) || "GET").toUpperCase();
  const rpcMarker = "/rest/v1/rpc/";
  const rpcIndex = url.pathname.indexOf(rpcMarker);

  if (rpcIndex >= 0) {
    const rpcName = decodeURIComponent(url.pathname.slice(rpcIndex + rpcMarker.length)).split("/")[0];
    if (REVIEWER_BOOTSTRAP_RPCS.has(rpcName)) return fetch(input, init);
    return emptyReviewerResponse();
  }

  if (url.pathname.includes("/rest/v1/")) {
    if (method === "GET" || method === "HEAD") return emptyReviewerResponse();
    return new Response(JSON.stringify({ message: "Google Play reviewer mode is read-only." }), {
      status: 403,
      headers: { "Content-Type": "application/json" }
    });
  }

  if (url.pathname.includes("/functions/v1/") || url.pathname.includes("/storage/v1/")) {
    return emptyReviewerResponse(method === "GET" || method === "HEAD" ? 200 : 403);
  }

  return fetch(input, init);
}

export function setGooglePlayReviewerMode(enabled) {
  reviewerMode = Boolean(enabled);
  window.EMS_GOOGLE_PLAY_REVIEWER = reviewerMode;
}

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
        global: { headers: { Authorization: `Bearer ${localAuthToken}` }, fetch: reviewerSafeFetch },
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      }
    : { global: { fetch: reviewerSafeFetch } };

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
