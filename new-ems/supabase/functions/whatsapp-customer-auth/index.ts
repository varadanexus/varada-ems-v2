// @ts-nocheck
// Local authentication gateway for the WhatsApp Platform Customer Portal.
// This function does not use Supabase Auth/GoTrue and never creates auth.users.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { create, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
import { sendWhatsAppMilestoneEmail } from "../_shared/whatsapp-platform-milestone-email.ts";

const JWT_TTL_SECONDS = 60 * 60;
const MAX_BODY_BYTES = 16 * 1024;
const ALLOWED_ORIGINS = new Set([
  "https://www.varadanexus.com",
  "https://varadanexus.com",
]);

function isLoopbackDevelopmentOrigin(origin: string) {
  try {
    const url = new URL(origin);
    const loopbackHost = url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]" ||
      url.hostname === "::1";
    return loopbackHost && (url.protocol === "http:" || url.protocol === "https:");
  } catch {
    return false;
  }
}

function env(name: string) {
  return Deno.env.get(name) || "";
}

function allowedOrigin(req: Request) {
  const origin = req.headers.get("origin") || "";
  if (!origin) return "https://www.varadanexus.com";
  return ALLOWED_ORIGINS.has(origin) || isLoopbackDevelopmentOrigin(origin) ? origin : "";
}

function headers(req: Request) {
  const origin = allowedOrigin(req);
  return {
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600",
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: headers(req) });
}

function normalizeEmail(value = "") {
  return String(value || "").trim().toLowerCase().slice(0, 254);
}

function cleanText(value: unknown, max: number) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
}

function allowedValue(value: unknown, allowed: string[], label: string) {
  const normalized = cleanText(value, 80);
  if (!allowed.includes(normalized)) throw new Error(`Select a valid ${label}.`);
  return normalized;
}

function optionalWebsite(value: unknown) {
  const raw = cleanText(value, 300);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    url.username = ""; url.password = ""; url.hash = "";
    return url.href.slice(0, 300);
  } catch { throw new Error("Enter a valid business website URL."); }
}

function clientIp(req: Request) {
  return String(
    req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0] ||
      "unknown",
  ).trim().slice(0, 80);
}

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function adminClient() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function enforceRateLimit(
  admin: any,
  req: Request,
  action: "signup" | "login" | "mint",
  identity: string,
) {
  const policy = action === "signup"
    ? { limit: 5, minutes: 60 }
    : action === "login"
      ? { limit: 10, minutes: 15 }
      : { limit: 40, minutes: 15 };
  const ipHash = await sha256(`ip:${clientIp(req)}`);
  const identityHash = await sha256(`${action}:${identity || "unknown"}`);
  const since = new Date(Date.now() - policy.minutes * 60_000).toISOString();

  for (const hash of [ipHash, identityHash]) {
    const { count, error } = await admin
      .from("whatsapp_platform_auth_attempts")
      .select("id", { count: "exact", head: true })
      .eq("identity_hash", hash)
      .eq("action", action)
      .gte("attempted_at", since);
    if (error) throw error;
    if (Number(count || 0) >= policy.limit) {
      throw new Error("Too many attempts. Wait a few minutes and try again.");
    }
  }

  const { error } = await admin.from("whatsapp_platform_auth_attempts").insert([
    { identity_hash: ipHash, action },
    { identity_hash: identityHash, action },
  ]);
  if (error) throw error;

  // Opportunistic cleanup. Failure is harmless and must not block login.
  if (crypto.getRandomValues(new Uint8Array(1))[0] < 8) {
    admin.from("whatsapp_platform_auth_attempts")
      .delete()
      .lt("attempted_at", new Date(Date.now() - 24 * 60 * 60_000).toISOString())
      .then(() => {}).catch(() => {});
  }
}

async function signingKey() {
  const secret = env("EMS_JWT_SECRET");
  if (!secret) throw new Error("Customer authentication is not configured.");
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function mintJwt(row: any) {
  const supabaseUrl = env("SUPABASE_URL");
  const nowSec = Math.floor(Date.now() / 1000);
  const accessToken = await create(
    { alg: "HS256", typ: "JWT" },
    {
      sub: row.auth_user_id,
      role: "authenticated",
      aud: "authenticated",
      iss: `${supabaseUrl}/auth/v1`,
      iat: nowSec,
      exp: getNumericDate(JWT_TTL_SECONDS),
      app_metadata: {
        provider: "whatsapp_platform_local",
        tenant_id: row.tenant_id,
        role_code: row.role_code || "owner",
      },
      user_metadata: {
        display_name: row.display_name || null,
        email: row.email || null,
        company_name: row.company_name || null,
      },
    },
    await signingKey(),
  );
  return { accessToken, expiresIn: JWT_TTL_SECONDS };
}

function publicSession(row: any) {
  return {
    sessionToken: row.session_token,
    userId: row.user_id,
    authUserId: row.auth_user_id,
    tenantId: row.tenant_id,
    displayName: row.display_name,
    email: row.email,
    companyName: row.company_name,
    roleCode: row.role_code,
    expiresAt: row.expires_at,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    if (!allowedOrigin(req)) return json(req, { error: "Origin not allowed" }, 403);
    return new Response("ok", { headers: headers(req) });
  }
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  if (!allowedOrigin(req)) return json(req, { error: "Origin not allowed" }, 403);

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) return json(req, { error: "Request too large" }, 413);

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");
    const admin = adminClient();

    if (action === "inspect_invite") {
      const inviteToken = String(body.inviteToken || "").trim().toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(inviteToken)) throw new Error("This invitation is invalid or has expired.");
      await enforceRateLimit(admin, req, "mint", await sha256(inviteToken));
      const inviteTokenHash = await sha256(inviteToken);
      const { data: invite, error: inviteError } = await admin
        .from("whatsapp_platform_users")
        .select("id,tenant_id,display_name,email,role_code,invited_by_user_id,invite_expires_at")
        .eq("invite_token_hash", inviteTokenHash)
        .eq("status", "invited")
        .gt("invite_expires_at", new Date().toISOString())
        .maybeSingle();
      if (inviteError || !invite) throw new Error("This invitation is invalid or has expired.");

      const [{ data: tenant }, { data: inviter }, { count: existingAccountCount }] = await Promise.all([
        admin.from("whatsapp_platform_tenants").select("name").eq("id", invite.tenant_id).eq("status", "active").maybeSingle(),
        invite.invited_by_user_id
          ? admin.from("whatsapp_platform_users").select("display_name,email").eq("id", invite.invited_by_user_id).maybeSingle()
          : Promise.resolve({ data: null }),
        admin.from("whatsapp_platform_users")
          .select("id", { count: "exact", head: true })
          .eq("email", normalizeEmail(invite.email))
          .eq("status", "active"),
      ]);
      if (!tenant?.name) throw new Error("This workspace is not available.");

      return json(req, {
        invitation: {
          inviteeName: cleanText(invite.display_name, 100),
          invitedEmail: normalizeEmail(invite.email),
          roleCode: cleanText(invite.role_code, 30),
          inviterName: cleanText(inviter?.display_name || inviter?.email || tenant.name, 120),
          organisationName: cleanText(tenant.name, 120),
          expiresAt: invite.invite_expires_at,
          existingAccount: Number(existingAccountCount || 0) > 0,
        },
      });
    }

    if (action === "accept_existing_invite") {
      const inviteToken = String(body.inviteToken || "").trim().toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(inviteToken)) throw new Error("This invitation is invalid or has expired.");
      await enforceRateLimit(admin, req, "login", await sha256(inviteToken));
      const { data, error } = await admin.rpc("whatsapp_platform_accept_existing_invite", {
        p_invite_token_hash: await sha256(inviteToken),
        p_password: String(body.password || "").slice(0, 128),
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.session_token) return json(req, { error: "Invalid email or password." }, 401);
      await sendWhatsAppMilestoneEmail(admin, row.tenant_id, "team_member_joined")
        .catch((emailError) => console.error("Team-joined email could not be queued", emailError));
      return json(req, { session: publicSession(row) });
    }

    if (action === "accept_invite") {
      const inviteToken = String(body.inviteToken || "").trim().toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(inviteToken)) throw new Error("This invitation is invalid or has expired.");
      await enforceRateLimit(admin, req, "signup", await sha256(inviteToken));
      if (body.termsAccepted !== true) throw new Error("You must accept the Terms of Service and Privacy Policy.");
      const { data, error } = await admin.rpc("whatsapp_platform_accept_invite", {
        p_invite_token_hash: await sha256(inviteToken),
        p_display_name: cleanText(body.displayName, 100),
        p_password: String(body.password || "").slice(0, 128),
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.session_token) throw new Error("This invitation is invalid or has expired.");
      await sendWhatsAppMilestoneEmail(admin, row.tenant_id, "team_member_joined")
        .catch((emailError) => console.error("Team-joined email could not be queued", emailError));
      return json(req, { session: publicSession(row) });
    }

    if (action === "signup") {
      const email = normalizeEmail(body.email);
      await enforceRateLimit(admin, req, "signup", email);
      if (body.termsAccepted !== true) throw new Error("You must accept the Terms of Service and Privacy Policy.");
      const phone = cleanText(body.contactPhone, 24);
      if (!/^\+?[0-9][0-9 ()-]{6,22}[0-9]$/.test(phone)) throw new Error("Enter a valid business phone number.");
      const expectedMessages = Number(body.expectedMonthlyMessages);
      if (![1000, 10000, 50000, 250000, 1000000].includes(expectedMessages)) throw new Error("Select a valid expected message volume.");
      const { data, error } = await admin.rpc("whatsapp_platform_signup_v2", {
        p_company_name: cleanText(body.companyName, 120),
        p_legal_name: cleanText(body.legalName, 160),
        p_website_url: optionalWebsite(body.website),
        p_country: cleanText(body.country, 80),
        p_business_type: allowedValue(body.businessType, ["private_limited", "public_limited", "partnership", "sole_proprietor", "nonprofit", "government", "other"], "business type"),
        p_company_size: allowedValue(body.companySize, ["1_10", "11_50", "51_200", "201_1000", "1000_plus"], "company size"),
        p_display_name: cleanText(body.displayName, 100),
        p_job_title: cleanText(body.jobTitle, 100),
        p_email: email,
        p_contact_phone: phone,
        p_password: String(body.password || "").slice(0, 128),
        p_use_case: allowedValue(body.useCase, ["customer_support", "transactional", "sales", "marketing", "mixed"], "use case"),
        p_expected_monthly_messages: expectedMessages,
        p_existing_whatsapp: allowedValue(body.existingWhatsApp, ["none", "business_app", "business_platform", "unsure"], "current WhatsApp setup"),
        p_launch_timeline: allowedValue(body.launchTimeline, ["immediately", "30_days", "90_days", "researching"], "launch timeline"),
        p_timezone: cleanText(body.timezone, 80) || "UTC",
        p_marketing_opt_in: body.marketingOptIn === true,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.session_token) throw new Error("Account could not be created.");
      await sendWhatsAppMilestoneEmail(admin, row.tenant_id, "workspace_created", {
        email: row.email,
        name: row.display_name,
        companyName: row.company_name,
      }).catch((emailError) => console.error("Workspace-created email could not be queued", emailError));
      return json(req, { session: publicSession(row) }, 201);
    }

    if (action === "login") {
      const email = normalizeEmail(body.email);
      await enforceRateLimit(admin, req, "login", email);
      const { data, error } = await admin.rpc("whatsapp_platform_login", {
        p_email: email,
        p_password: String(body.password || ""),
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.session_token) {
        return json(req, { error: "Invalid email or password." }, 401);
      }
      return json(req, { session: publicSession(row) });
    }

    if (action === "mint") {
      const sessionToken = String(body.sessionToken || "");
      if (sessionToken.length !== 64) return json(req, { error: "Invalid session" }, 401);
      await enforceRateLimit(admin, req, "mint", await sha256(sessionToken));
      const { data, error } = await admin.rpc("whatsapp_platform_validate_session", {
        p_session_token: sessionToken,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.auth_user_id) return json(req, { error: "Session expired" }, 401);
      const jwt = await mintJwt(row);
      return json(req, {
        accessToken: jwt.accessToken,
        expiresIn: jwt.expiresIn,
        user: {
          userId: row.user_id,
          authUserId: row.auth_user_id,
          tenantId: row.tenant_id,
          displayName: row.display_name,
          email: row.email,
          companyName: row.company_name,
          roleCode: row.role_code,
        },
      });
    }

    if (action === "logout") {
      const sessionToken = String(body.sessionToken || "");
      if (sessionToken) {
        await admin.rpc("whatsapp_platform_logout", { p_session_token: sessionToken });
      }
      return json(req, { ok: true });
    }

    return json(req, { error: "Unsupported action" }, 400);
  } catch (error: any) {
    const message = String(error?.message || "Request failed");
    const safeMessage = /duplicate key|constraint|SQL|relation|column/i.test(message)
      ? "The request could not be completed."
      : message;
    return json(req, { error: safeMessage }, 400);
  }
});
