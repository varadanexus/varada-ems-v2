// @ts-nocheck
// Passwordless SMS login for provisioned EMS staff. The endpoint deliberately
// returns a generic request response so account existence cannot be enumerated.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const OTP_TTL_MINUTES = 5;
const SESSION_TTL_HOURS = 12;
const MAX_ATTEMPTS = 5;
const GENERIC_REQUEST_MESSAGE = "If this is an active EMS staff account with a registered mobile, a verification code has been sent.";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

function env(name: string) {
  return String(Deno.env.get(name) || "").trim();
}

function randomDigits(length = 6) {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => String(value % 10)).join("");
}

function randomToken(bytes = 32) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return Array.from(data, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function normalizeIndianPhone(value: unknown) {
  const raw = String(value || "").trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (raw.startsWith("+") && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return "";
}

function requestIp(req: Request) {
  return String(req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "")
    .split(",")[0]
    .trim();
}

function validAppHash(value: unknown) {
  const hash = String(value || "").trim();
  return /^[A-Za-z0-9+/_-]{11}$/.test(hash) ? hash : "";
}

async function sendSms(phone: string, otp: string, appHash: string, platform: string) {
  const accountSid = env("TWILIO_ACCOUNT_SID");
  const authToken = env("TWILIO_AUTH_TOKEN");
  const messagingServiceSid = env("TWILIO_SMS_MESSAGING_SERVICE_SID") || env("TWILIO_MESSAGING_SERVICE_SID");
  const from = env("TWILIO_SMS_FROM");
  if (!accountSid || !authToken || (!messagingServiceSid && !from)) {
    throw new Error("SMS delivery is not configured");
  }

  const configuredHash = validAppHash(env("ANDROID_SMS_RETRIEVER_HASH"));
  const nativeHash = configuredHash || appHash;
  let message = `<#> Varada Nexus EMS code: ${otp}. Expires in ${OTP_TTL_MINUTES} minutes.`;
  if (platform === "native" && nativeHash) message += `\n${nativeHash}`;
  else message += `\n@www.varadanexus.com #${otp}`;

  const params = new URLSearchParams({ To: phone, Body: message });
  if (messagingServiceSid) params.set("MessagingServiceSid", messagingServiceSid);
  else params.set("From", from);

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.message || "SMS delivery failed");
  return payload?.sid || null;
}

async function requestOtp(req: Request, admin: any, body: any) {
  const identifier = String(body?.identifier || "").trim().slice(0, 254);
  if (!identifier) return json({ ok: true, message: GENERIC_REQUEST_MESSAGE, request_id: crypto.randomUUID() });

  const ipHash = await sha256(`${requestIp(req)}:${env("EMS_LOGIN_OTP_SECRET")}`);
  const { data, error } = await admin.rpc("resolve_ems_otp_login_user", { p_identifier: identifier });
  if (error) throw error;
  const user = Array.isArray(data) ? data[0] : data;
  if (!user?.app_user_id) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    return json({ ok: true, message: GENERIC_REQUEST_MESSAGE, request_id: crypto.randomUUID() });
  }

  const phone = normalizeIndianPhone(user.phone);
  if (!phone) return json({ ok: true, message: GENERIC_REQUEST_MESSAGE, request_id: crypto.randomUUID() });

  const sinceMinute = new Date(Date.now() - 60_000).toISOString();
  const sinceHour = new Date(Date.now() - 60 * 60_000).toISOString();
  const [{ count: recentUser }, { count: hourlyUser }, { count: hourlyIp }] = await Promise.all([
    admin.from("ems_login_otp_challenges").select("id", { count: "exact", head: true }).eq("app_user_id", user.app_user_id).gte("created_at", sinceMinute),
    admin.from("ems_login_otp_challenges").select("id", { count: "exact", head: true }).eq("app_user_id", user.app_user_id).gte("created_at", sinceHour),
    admin.from("ems_login_otp_challenges").select("id", { count: "exact", head: true }).eq("client_ip_hash", ipHash).gte("created_at", sinceHour)
  ]);
  if ((recentUser || 0) > 0) return json({ error: "Please wait 60 seconds before requesting another code." }, 429);
  if ((hourlyUser || 0) >= 5 || (hourlyIp || 0) >= 15) return json({ error: "OTP request limit reached. Try again later." }, 429);

  const id = crypto.randomUUID();
  const otp = randomDigits();
  const secret = env("EMS_LOGIN_OTP_SECRET");
  if (!secret) return json({ error: "OTP service is not configured" }, 503);
  const codeHash = await sha256(`${id}:${otp}:${secret}`);
  const appHash = validAppHash(body?.app_hash);
  const platform = body?.platform === "native" ? "native" : "web";
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000).toISOString();

  const { error: insertError } = await admin.from("ems_login_otp_challenges").insert({
    id,
    app_user_id: user.app_user_id,
    code_hash: codeHash,
    phone_last4: phone.slice(-4),
    app_hash: appHash || null,
    client_ip_hash: ipHash,
    max_attempts: MAX_ATTEMPTS,
    expires_at: expiresAt
  });
  if (insertError) throw insertError;

  try {
    await sendSms(phone, otp, appHash, platform);
  } catch (error) {
    await admin.from("ems_login_otp_challenges").delete().eq("id", id);
    console.error("ems_login_otp_sms_failed", error);
    return json({ error: "The verification SMS could not be sent. Please use password login or contact support." }, 503);
  }

  return json({
    ok: true,
    message: GENERIC_REQUEST_MESSAGE,
    request_id: id,
    masked_phone: `******${phone.slice(-4)}`,
    expires_in: OTP_TTL_MINUTES * 60
  });
}

async function verifyOtp(req: Request, admin: any, body: any) {
  const requestId = String(body?.request_id || "").trim();
  const otp = String(body?.otp || "").replace(/\D/g, "");
  if (!/^[0-9a-f-]{36}$/i.test(requestId) || !/^\d{6}$/.test(otp)) {
    return json({ error: "Enter the valid six-digit verification code." }, 400);
  }

  const { data: challenge, error } = await admin.from("ems_login_otp_challenges")
    .select("id,app_user_id,code_hash,attempts,max_attempts,expires_at,consumed_at")
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw error;
  if (!challenge || challenge.consumed_at || new Date(challenge.expires_at).getTime() <= Date.now()) {
    return json({ error: "This verification code has expired. Request a new code." }, 401);
  }
  if (challenge.attempts >= challenge.max_attempts) {
    return json({ error: "Too many incorrect attempts. Request a new code." }, 429);
  }

  const expected = await sha256(`${requestId}:${otp}:${env("EMS_LOGIN_OTP_SECRET")}`);
  if (expected !== challenge.code_hash) {
    await admin.from("ems_login_otp_challenges").update({ attempts: challenge.attempts + 1 }).eq("id", requestId).is("consumed_at", null);
    return json({ error: "Incorrect verification code." }, 401);
  }

  const { data: user, error: userError } = await admin.from("app_users")
    .select("id,auth_user_id,display_name,email,status,is_locked,deleted_at")
    .eq("id", challenge.app_user_id)
    .maybeSingle();
  if (userError) throw userError;
  if (!user || user.deleted_at || user.status !== "active" || user.is_locked || !user.auth_user_id) {
    return json({ error: "This EMS account is not available. Contact your administrator." }, 403);
  }

  const consumedAt = new Date().toISOString();
  const { data: consumed } = await admin.from("ems_login_otp_challenges")
    .update({ consumed_at: consumedAt, attempts: challenge.attempts + 1 })
    .eq("id", requestId)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();
  if (!consumed) return json({ error: "This verification code has already been used." }, 409);

  const sessionToken = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60_000).toISOString();
  const { error: sessionError } = await admin.from("app_user_sessions").insert({
    app_user_id: user.id,
    session_token: sessionToken,
    expires_at: expiresAt,
    last_seen_at: consumedAt,
    ip_address: requestIp(req) || null,
    user_agent: String(req.headers.get("user-agent") || "").slice(0, 500) || null
  });
  if (sessionError) throw sessionError;

  await Promise.all([
    admin.from("app_users").update({ last_login_at: consumedAt, failed_login_attempts: 0 }).eq("id", user.id),
    admin.from("activity_logs").insert({
      auth_id: user.auth_user_id,
      user_id: user.id,
      action_type: "login_otp",
      module_name: "auth",
      page_name: "login",
      description: "EMS staff login completed with SMS OTP",
      metadata: { method: "sms_otp", challenge_id: requestId },
      ip_address: requestIp(req) || null,
      user_agent: String(req.headers.get("user-agent") || "").slice(0, 500) || null
    })
  ]);

  return json({
    ok: true,
    session_token: sessionToken,
    app_user_id: user.id,
    auth_user_id: user.auth_user_id,
    display_name: user.display_name,
    email: user.email,
    expires_at: expiresAt
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const body = await req.json().catch(() => ({}));
    if (body?.action === "request") return await requestOtp(req, admin, body);
    if (body?.action === "verify") return await verifyOtp(req, admin, body);
    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error("ems_login_otp_error", error);
    return json({ error: "OTP service is temporarily unavailable." }, 500);
  }
});
