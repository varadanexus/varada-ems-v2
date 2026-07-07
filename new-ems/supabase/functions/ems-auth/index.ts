// @ts-nocheck
// Sprint 13F.3: ems-auth edge function.
//
// Exchanges a valid LOCAL staff session token (from ems_local_login) for a
// short-lived, Supabase-compatible JWT so that PostgREST/RLS treat the local
// user as authenticated. The JWT's `sub` = app_users.auth_user_id, so the
// existing current_app_user_id() -> auth.uid() identity model keeps working.
//
// This is the ONLY component that holds the project JWT secret. The secret must
// be set as a function secret named EMS_JWT_SECRET (equal to the project's JWT
// secret / "legacy JWT secret"). It is never sent to the browser.
//
// Request:  POST { "session_token": "<hex>" }        (action "mint" | "refresh"; same behaviour)
// Response: { access_token, token_type, expires_in, auth_user_id, display_name }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { create, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const JWT_TTL_SECONDS = 60 * 60; // 1 hour; refreshed client-side while the 12h session lives.

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const jwtSecret = Deno.env.get("EMS_JWT_SECRET");
    if (!jwtSecret) return json({ error: "Server not configured (missing EMS_JWT_SECRET)" }, 500);

    const body = await req.json().catch(() => ({}));
    const sessionToken = body?.session_token;
    if (!sessionToken || typeof sessionToken !== "string") {
      return json({ error: "session_token is required" }, 400);
    }

    // Validate the session server-side (SECURITY DEFINER RPC re-checks expiry, revocation, status).
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data, error } = await admin.rpc("ems_local_validate_session", { p_session_token: sessionToken });
    if (error) return json({ error: error.message }, 400);

    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.auth_user_id) return json({ error: "Invalid or expired session" }, 401);

    // Mint an HS256 JWT signed with the project JWT secret.
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(jwtSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"]
    );

    const nowSec = Math.floor(Date.now() / 1000);
    const payload = {
      sub: row.auth_user_id,
      role: "authenticated",
      aud: "authenticated",
      iss: `${supabaseUrl}/auth/v1`,
      iat: nowSec,
      exp: getNumericDate(JWT_TTL_SECONDS),
      app_metadata: { provider: "ems_local" },
      user_metadata: { display_name: row.display_name ?? null, email: row.email ?? null }
    };

    const accessToken = await create({ alg: "HS256", typ: "JWT" }, payload, key);

    return json({
      access_token: accessToken,
      token_type: "bearer",
      expires_in: JWT_TTL_SECONDS,
      auth_user_id: row.auth_user_id,
      display_name: row.display_name ?? null,
      email: row.email ?? null
    });
  } catch (e) {
    return json({ error: (e as Error)?.message || "Unexpected error" }, 500);
  }
});
