import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function dispatchChannels(
  supabaseUrl: string,
  notificationId: string,
  authorization: string,
  internalSecret = "",
) {
  const commonHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: authorization,
  };
  if (internalSecret) commonHeaders["x-notification-secret"] = internalSecret;
  const calls = [
    ["push", "push-notifications", { notification_id: notificationId }],
    [
      "email",
      "email-integrations",
      { action: "fanout_notification", notificationId },
    ],
    [
      "whatsapp",
      "whatsapp-integrations",
      { action: "fanout_notification", notificationId },
    ],
  ] as const;
  const results = await Promise.all(
    calls.map(async ([channel, fn, body]) => {
      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/${fn}`, {
          method: "POST",
          headers: commonHeaders,
          body: JSON.stringify(body),
        });
        const payload = await response.json().catch(() => ({}));
        return {
          channel,
          ok: response.ok,
          status: response.status,
          ...payload,
        };
      } catch (error) {
        return {
          channel,
          ok: false,
          status: 0,
          error:
            error instanceof Error ? error.message : "Delivery request failed",
        };
      }
    }),
  );
  return { notification_id: notificationId, channels: results };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const expectedSecret = Deno.env.get("NOTIFICATION_CRON_SECRET") || "";
    const suppliedSecret = req.headers.get("x-cron-secret") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (body?.action === "dispatch_event") {
      const authorization = req.headers.get("Authorization") || "";
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
      if (!authorization.startsWith("Bearer "))
        return json({ error: "Authentication required" }, 401);
      const scoped = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false },
      });
      const { data: allowed, error: accessError } = await scoped.rpc(
        "notification_studio_can_manage",
      );
      if (accessError || !allowed)
        return json({ error: "Notification Studio access denied" }, 403);
      const notificationId = String(body.notificationId || "").trim();
      if (!notificationId)
        return json({ error: "notificationId is required" }, 400);
      return json(
        await dispatchChannels(supabaseUrl, notificationId, authorization),
      );
    }

    if (body?.action !== "process_due")
      return json({ error: "Unsupported action" }, 400);
    if (!expectedSecret || suppliedSecret !== expectedSecret)
      return json({ error: "Unauthorized scheduler request" }, 401);

    const { data, error } = await admin.rpc(
      "process_due_notification_campaigns",
      { p_limit: 30 },
    );
    if (error) throw error;

    const eventIds = Array.isArray(data) ? data.filter(Boolean) : [];
    const results = [];
    for (const notificationId of eventIds)
      results.push(
        await dispatchChannels(
          supabaseUrl,
          notificationId,
          `Bearer ${serviceRoleKey}`,
          expectedSecret,
        ),
      );

    return json({ processed: eventIds.length, deliveries: results });
  } catch (error) {
    console.error("notification campaign scheduler failed", error);
    return json(
      {
        error:
          error instanceof Error ? error.message : "Campaign processing failed",
      },
      500,
    );
  }
});
