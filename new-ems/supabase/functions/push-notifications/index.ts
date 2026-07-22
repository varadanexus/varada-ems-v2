import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" }
});

type GoogleServiceAccount = {
  client_email: string;
  private_key: string;
  project_id: string;
  token_uri?: string;
};

let cachedGoogleToken: { accessToken: string; expiresAt: number; projectId: string } | null = null;

function base64Url(value: Uint8Array | string) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function privateKeyBytes(pem: string) {
  const raw = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  return Uint8Array.from(atob(raw), (character) => character.charCodeAt(0));
}

async function firebaseAccessToken() {
  if (cachedGoogleToken && cachedGoogleToken.expiresAt > Date.now() + 60_000) return cachedGoogleToken;
  const raw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON") || "";
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not configured");
  const account = JSON.parse(raw) as GoogleServiceAccount;
  if (!account.client_email || !account.private_key || !account.project_id) {
    throw new Error("Google service account is missing client_email, private_key or project_id");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: account.token_uri || "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  }));
  const unsigned = `${header}.${claim}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    privateKeyBytes(account.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)));
  const assertion = `${unsigned}.${base64Url(signature)}`;
  const response = await fetch(account.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.access_token) {
    throw new Error(payload?.error_description || payload?.error || "Could not authorize Firebase Cloud Messaging");
  }
  cachedGoogleToken = {
    accessToken: String(payload.access_token),
    expiresAt: Date.now() + Number(payload.expires_in || 3600) * 1000,
    projectId: Deno.env.get("FIREBASE_PROJECT_ID") || account.project_id
  };
  return cachedGoogleToken;
}

function compactNotificationText(value: unknown, limit: number) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length <= limit ? text : `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function resolveNotificationUrl(event: Record<string, any>) {
  const explicit = String(event.action_url || "").trim();
  if (explicit.startsWith("/")) return explicit;

  const entityType = String(event.entity_type || "").toLowerCase();
  const entityId = String(event.entity_id || "").trim();
  const safeId = /^[0-9a-f-]{36}$/i.test(entityId) ? encodeURIComponent(entityId) : "";
  if (safeId && /(?:transport.*trip|^trip$)/.test(entityType)) {
    return `/new-ems/modules/transport-trip-details/index.html?id=${safeId}`;
  }
  if (safeId && /legal.*agreement/.test(entityType)) {
    return `/new-ems/modules/legal-agreement-view/index.html?id=${safeId}`;
  }
  if (safeId && /interior.*project/.test(entityType)) {
    return `/new-ems/modules/interiors-project-detail/index.html?id=${safeId}`;
  }

  const moduleCode = String(event.module_code || "").trim().toLowerCase();
  if (/^[a-z0-9-]+$/.test(moduleCode)) {
    return `/new-ems/modules/${moduleCode}/index.html`;
  }
  return "/new-ems/modules/dashboard/index.html";
}

function bearer(req: Request) {
  const value = req.headers.get("authorization") || "";
  return value.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() : "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") || "";
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") || "";
    const token = bearer(req);
    if (!token) return json({ error: "Authentication required" }, 401);

    const isInternal = token === serviceRoleKey;
    let callerId: string | null = null;
    if (!isInternal) {
      // Resolve identity through PostgREST so both normal Supabase sessions and
      // EMS local-staff JWTs follow the same database-auth path and RLS rules.
      const caller = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false }
      });
      const { data, error: identityError } = await caller.rpc("get_my_push_identity");
      callerId = data;
      if (identityError || !callerId) return json({ error: "Authentication required" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const notificationId = String(body?.notification_id || "").trim();
    if (!notificationId) return json({ error: "notification_id is required" }, 400);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: event, error: eventError } = await admin
      .from("notification_events")
      .select("id,title,message,severity,action_label,action_url,module_code,entity_type,entity_id,created_by")
      .eq("id", notificationId)
      .maybeSingle();
    if (eventError || !event) return json({ error: "Notification not found" }, 404);

    let authorized = isInternal || event.created_by === callerId;
    if (!authorized && callerId) {
      const { data: roles } = await admin
        .from("user_roles")
        .select("roles!inner(code)")
        .eq("user_id", callerId);
      authorized = (roles || []).some((row: any) => ["super_admin", "admin"].includes(row.roles?.code));
    }
    if (!authorized) return json({ error: "Not authorized to deliver this notification" }, 403);

    const { data: recipients, error: recipientError } = await admin
      .from("notification_recipients")
      .select("app_user_id")
      .eq("notification_id", notificationId);
    if (recipientError) throw recipientError;
    const userIds = [...new Set((recipients || []).map((row) => row.app_user_id))];
    if (!userIds.length) return json({ delivered: 0, failed: 0 });

    const { data: subscriptions, error: subscriptionError } = await admin
      .from("push_subscriptions")
      .select("id,endpoint,p256dh_key,auth_key")
      .in("app_user_id", userIds);
    if (subscriptionError) throw subscriptionError;

    const { data: nativeTokens, error: nativeTokenError } = await admin
      .from("native_push_tokens")
      .select("id,token,platform")
      .in("app_user_id", userIds)
      .eq("enabled", true);
    if (nativeTokenError) throw nativeTokenError;

    const { data: priorDeliveries } = await admin
      .from("push_deliveries")
      .select("subscription_id")
      .eq("notification_id", notificationId);
    const deliveredIds = new Set((priorDeliveries || []).map((row) => row.subscription_id));

    const { data: priorNativeDeliveries, error: priorNativeDeliveryError } = await admin
      .from("native_push_deliveries")
      .select("native_token_id")
      .eq("notification_id", notificationId);
    if (priorNativeDeliveryError) throw priorNativeDeliveryError;
    const deliveredNativeIds = new Set((priorNativeDeliveries || []).map((row) => row.native_token_id));

    if (vapidPublicKey && vapidPrivateKey) {
      webpush.setVapidDetails("mailto:security@varadanexus.com", vapidPublicKey, vapidPrivateKey);
    }
    const targetUrl = resolveNotificationUrl(event);
    const title = compactNotificationText(event.title, 72);
    const message = compactNotificationText(event.message, 150);
    const payload = JSON.stringify({
      title,
      body: message,
      // Older workers used payload.icon as an expanded right-side image. A
      // transparent compatibility icon suppresses that duplicate until v11 activates.
      icon: "/new-ems/assets/icons/notification-transparent.png",
      badge: "/new-ems/assets/icons/ems-notification-badge.png",
      tag: `ems-${event.id}`,
      data: { url: targetUrl, notificationId: event.id },
      actionLabel: compactNotificationText(event.action_label || "Open EMS", 24),
      severity: event.severity,
      moduleCode: event.module_code
    });

    let webDelivered = 0;
    let webFailed = 0;
    await Promise.all((subscriptions || []).filter((sub) => !deliveredIds.has(sub.id)).map(async (sub) => {
      try {
        if (!vapidPublicKey || !vapidPrivateKey) throw new Error("Web Push VAPID keys are not configured");
        await webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh_key, auth: sub.auth_key }
        }, payload, { TTL: 86400, urgency: event.severity === "error" ? "high" : "normal" });
        await admin.from("push_deliveries").upsert({ notification_id: notificationId, subscription_id: sub.id });
        webDelivered += 1;
      } catch (error: any) {
        webFailed += 1;
        if ([404, 410].includes(Number(error?.statusCode))) {
          await admin.from("push_subscriptions").delete().eq("id", sub.id);
        }
      }
    }));

    let nativeDelivered = 0;
    let nativeFailed = 0;
    const pendingNativeTokens = (nativeTokens || []).filter((entry) => !deliveredNativeIds.has(entry.id));
    if (pendingNativeTokens.length) {
      try {
        const firebase = await firebaseAccessToken();
        await Promise.all(pendingNativeTokens.map(async (entry) => {
          try {
            const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(firebase.projectId)}/messages:send`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${firebase.accessToken}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                message: {
                  token: entry.token,
                  notification: { title, body: message },
                  data: {
                    url: targetUrl,
                    notificationId: String(event.id),
                    severity: String(event.severity || "info"),
                    moduleCode: String(event.module_code || "")
                  },
                  android: {
                    priority: event.severity === "error" ? "high" : "normal",
                    ttl: "86400s",
                    notification: {
                      channel_id: "ems_operational_alerts",
                      icon: "ic_stat_varada",
                      color: "#D4B26A",
                      sound: "default",
                      tag: `ems-${event.id}`
                    }
                  }
                }
              })
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
              const errorCode = String(result?.error?.details?.find?.((detail: any) => detail?.errorCode)?.errorCode || "");
              if (["UNREGISTERED", "INVALID_ARGUMENT"].includes(errorCode)) {
                await admin.from("native_push_tokens").delete().eq("id", entry.id);
              }
              throw new Error(result?.error?.message || `Firebase delivery failed (${response.status})`);
            }
            const { error: deliveryError } = await admin.from("native_push_deliveries").upsert({
              notification_id: notificationId,
              native_token_id: entry.id
            });
            if (deliveryError) throw deliveryError;
            nativeDelivered += 1;
          } catch (error) {
            nativeFailed += 1;
            console.error("FCM delivery failed", error);
          }
        }));
      } catch (error) {
        nativeFailed += pendingNativeTokens.length;
        console.error("Firebase configuration failed", error);
      }
    }

    return json({
      delivered: webDelivered + nativeDelivered,
      failed: webFailed + nativeFailed,
      web: { delivered: webDelivered, failed: webFailed },
      native: { delivered: nativeDelivered, failed: nativeFailed }
    });
  } catch (error) {
    console.error("push-notifications failed", error);
    return json({ error: error instanceof Error ? error.message : "Push delivery failed" }, 500);
  }
});
