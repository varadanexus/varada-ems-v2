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
    if (!vapidPublicKey || !vapidPrivateKey) return json({ error: "Push service is not configured" }, 503);

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

    const { data: priorDeliveries } = await admin
      .from("push_deliveries")
      .select("subscription_id")
      .eq("notification_id", notificationId);
    const deliveredIds = new Set((priorDeliveries || []).map((row) => row.subscription_id));

    webpush.setVapidDetails("mailto:security@varadanexus.com", vapidPublicKey, vapidPrivateKey);
    const payload = JSON.stringify({
      title: compactNotificationText(event.title, 72),
      body: compactNotificationText(event.message, 150),
      // Older workers used payload.icon as an expanded right-side image. A
      // transparent compatibility icon suppresses that duplicate until v11 activates.
      icon: "/new-ems/assets/icons/notification-transparent.png",
      badge: "/new-ems/assets/icons/ems-notification-badge.png",
      tag: `ems-${event.id}`,
      data: { url: resolveNotificationUrl(event), notificationId: event.id },
      actionLabel: compactNotificationText(event.action_label || "Open EMS", 24),
      severity: event.severity,
      moduleCode: event.module_code
    });

    let delivered = 0;
    let failed = 0;
    await Promise.all((subscriptions || []).filter((sub) => !deliveredIds.has(sub.id)).map(async (sub) => {
      try {
        await webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh_key, auth: sub.auth_key }
        }, payload, { TTL: 86400, urgency: event.severity === "error" ? "high" : "normal" });
        await admin.from("push_deliveries").upsert({ notification_id: notificationId, subscription_id: sub.id });
        delivered += 1;
      } catch (error: any) {
        failed += 1;
        if ([404, 410].includes(Number(error?.statusCode))) {
          await admin.from("push_subscriptions").delete().eq("id", sub.id);
        }
      }
    }));

    return json({ delivered, failed });
  } catch (error) {
    console.error("push-notifications failed", error);
    return json({ error: error instanceof Error ? error.message : "Push delivery failed" }, 500);
  }
});
