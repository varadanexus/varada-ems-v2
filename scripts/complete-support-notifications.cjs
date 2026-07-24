const fs = require("fs");
const path = require("path");

const workspace = path.resolve(__dirname, "..");
const roots = [path.join(workspace, "pre release", "new-ems"), path.join(workspace, "new-ems")];

function replaceOnce(text, before, after, label) {
  if (text.includes(after)) return text;
  if (!text.includes(before)) throw new Error(`Could not find ${label}`);
  return text.replace(before, after);
}
function writeChanged(file, transform) {
  const before = fs.readFileSync(file, "utf8");
  const after = transform(before);
  if (after !== before) fs.writeFileSync(file, after, "utf8");
}
function section(text, startMarker, endMarker, replacement, label) {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error(`Could not find ${label}`);
  return text.slice(0, start) + replacement + text.slice(end);
}

for (const root of roots) {
  const deliverySource = path.join(roots[0], "shared", "support-notification-delivery.js");
  const portalSource = path.join(roots[0], "shared", "portal-support-notifications.js");
  if (root !== roots[0]) {
    fs.copyFileSync(deliverySource, path.join(root, "shared", "support-notification-delivery.js"));
    fs.copyFileSync(portalSource, path.join(root, "shared", "portal-support-notifications.js"));
    fs.copyFileSync(path.join(roots[0], "supabase", "migrations", "20260722210000_support_ticket_complete_notifications.sql"),
      path.join(root, "supabase", "migrations", "20260722210000_support_ticket_complete_notifications.sql"));
  }

  writeChanged(path.join(root, "shared", "portal-support-api.js"), (text) => {
    text = replaceOnce(text,
      'import { getSupabaseClient } from "../config/supabase.js";\n',
      'import { getSupabaseClient } from "../config/supabase.js";\nimport { deliverSupportTicketNotifications } from "./support-notification-delivery.js";\n', "portal delivery import");
    text = replaceOnce(text,
`export function createPortalSupportTicket(values) {
  return rpc("portal_create_support_ticket", {
    p_subject: values.subject,
    p_description: values.description,
    p_department: values.department,
    p_category: values.category,
    p_priority: values.priority,
    p_source_module: values.sourceModule,
    p_source_url: location.href,
    p_environment: values.environment || {}
  });
}`,
`export async function createPortalSupportTicket(values) {
  const result = await rpc("portal_create_support_ticket", {
    p_subject: values.subject,
    p_description: values.description,
    p_department: values.department,
    p_category: values.category,
    p_priority: values.priority,
    p_source_module: values.sourceModule,
    p_source_url: location.href,
    p_environment: values.environment || {}
  });
  await deliverSupportTicketNotifications(result?.ticket_id).catch(() => {});
  return result;
}`, "portal ticket creation");
    text = replaceOnce(text,
`export function replyToPortalSupportTicket(ticketId, body) {
  return rpc("portal_add_support_ticket_message", { p_ticket_id: ticketId, p_body: body });
}`,
`export async function replyToPortalSupportTicket(ticketId, body) {
  const result = await rpc("portal_add_support_ticket_message", { p_ticket_id: ticketId, p_body: body });
  await deliverSupportTicketNotifications(ticketId).catch(() => {});
  return result;
}`, "portal ticket reply");
    text = replaceOnce(text,
`export function closePortalSupportTicket(ticketId) {
  return rpc("portal_close_support_ticket", { p_ticket_id: ticketId });
}`,
`export async function closePortalSupportTicket(ticketId) {
  const result = await rpc("portal_close_support_ticket", { p_ticket_id: ticketId });
  await deliverSupportTicketNotifications(ticketId).catch(() => {});
  return result;
}`, "portal ticket close");
    return text;
  });

  writeChanged(path.join(root, "shared", "support-api.js"), (text) => {
    text = replaceOnce(text,
      'import { deliverPushNotification } from "./push-notifications.js";\n',
      'import { deliverPushNotification } from "./push-notifications.js";\nimport { deliverSupportTicketNotifications } from "./support-notification-delivery.js";\n', "staff delivery import");
    return replaceOnce(text,
`async function deliver(result) {
  const notificationId = result?.notification_id;
  if (notificationId) await deliverPushNotification(notificationId).catch(() => {});
  return result;
}`,
`async function deliver(result) {
  const ticketId = result?.ticket_id;
  if (ticketId) await deliverSupportTicketNotifications(ticketId).catch(() => {});
  else if (result?.notification_id) await deliverPushNotification(result.notification_id).catch(() => {});
  return result;
}`, "staff support delivery");
  });

  writeChanged(path.join(root, "supabase", "functions", "push-notifications", "index.ts"), (text) => {
    const authBlock = `    const body = await req.json().catch(() => ({}));
    const notificationId = String(body?.notification_id || "").trim();
    if (!notificationId) return json({ error: "notification_id is required" }, 400);
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const isInternal = token === serviceRoleKey;
    let callerId: string | null = null;
    let portalActor: any = null;
    if (!isInternal) {
      const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: \`Bearer \${token}\` } }, auth: { persistSession: false, autoRefreshToken: false } });
      const { data } = await caller.rpc("get_my_push_identity");
      callerId = data || null;
      if (!callerId && (body?.p_external_session_token || body?.p_transport_session_token)) {
        const { data: actor } = await admin.rpc("support_portal_actor", {
          p_external_session_token: body?.p_external_session_token || null,
          p_transport_session_token: body?.p_transport_session_token || null
        });
        portalActor = actor || null;
      }
      if (!callerId && !portalActor?.id) return json({ error: "Authentication required" }, 401);
    }

`;
    text = section(text, "    const body = await req.json().catch(() => ({}));", "    const { data: event", authBlock, "push authorization prelude");
    const authorization = `    let authorized = isInternal || event.created_by === callerId;
    if (!authorized && callerId) {
      const { data: roles } = await admin.from("user_roles").select("roles!inner(code)").eq("user_id", callerId);
      authorized = (roles || []).some((row: any) => ["super_admin", "admin"].includes(row.roles?.code));
    }
    if (!authorized && portalActor?.id) {
      const identityColumn = portalActor.kind === "transport_portal" ? "transport_portal_user_id" : "external_portal_user_id";
      const { data: recipient } = await admin.from("portal_notification_recipients").select("id").eq("notification_id", notificationId).eq(identityColumn, portalActor.id).maybeSingle();
      authorized = Boolean(recipient);
      if (!authorized && event.entity_type === "support_ticket") {
        const { data: ticket } = await admin.from("support_tickets").select("external_portal_user_id,transport_portal_user_id").eq("id", event.entity_id).maybeSingle();
        authorized = Boolean(ticket && ticket[identityColumn] === portalActor.id);
      }
    }
    if (!authorized) return json({ error: "Not authorized to deliver this notification" }, 403);

`;
    text = section(text, "    let authorized = isInternal || event.created_by === callerId;", "    const { data: recipients", authorization, "push event authorization");
    const targets = `    const { data: recipients, error: recipientError } = await admin.from("notification_recipients").select("app_user_id").eq("notification_id", notificationId);
    if (recipientError) throw recipientError;
    const { data: portalRecipients, error: portalRecipientError } = await admin.from("portal_notification_recipients").select("external_portal_user_id,transport_portal_user_id").eq("notification_id", notificationId);
    if (portalRecipientError) throw portalRecipientError;
    const userIds = [...new Set((recipients || []).map((row) => row.app_user_id).filter(Boolean))];
    const externalIds = [...new Set((portalRecipients || []).map((row) => row.external_portal_user_id).filter(Boolean))];
    const transportIds = [...new Set((portalRecipients || []).map((row) => row.transport_portal_user_id).filter(Boolean))];
    const subscriptions: any[] = [];
    const nativeTokens: any[] = [];
    for (const [column, ids] of [["app_user_id", userIds], ["external_portal_user_id", externalIds], ["transport_portal_user_id", transportIds]] as any[]) {
      if (!ids.length) continue;
      const { data: webRows, error: webError } = await admin.from("push_subscriptions").select("id,endpoint,p256dh_key,auth_key").in(column, ids);
      if (webError) throw webError; subscriptions.push(...(webRows || []));
      const { data: nativeRows, error: nativeError } = await admin.from("native_push_tokens").select("id,token,platform").in(column, ids).eq("enabled", true);
      if (nativeError) throw nativeError; nativeTokens.push(...(nativeRows || []));
    }
    if (!subscriptions.length && !nativeTokens.length) return json({ delivered: 0, failed: 0 });

`;
    text = section(text, "    const { data: recipients", "    const { data: priorDeliveries", targets, "push recipient collection");
    return text;
  });

  const cssFile = path.join(root, "assets", "css", "portal-support.css");
  writeChanged(cssFile, (text) => text.includes(".portal-support-push-prompt") ? text : text + `
.portal-support-launcher.has-unread::after{content:attr(data-unread);position:absolute;right:-5px;top:-7px;min-width:18px;height:18px;padding:0 4px;border-radius:20px;background:#d4b25f;color:#07090d;font:800 11px/18px system-ui;text-align:center}
.portal-support-push-prompt{position:fixed;right:22px;bottom:82px;z-index:2147482000;border:1px solid #69542a;border-radius:999px;padding:10px 14px;background:#11141a;color:#e6c66f;font:700 12px system-ui;box-shadow:0 12px 30px #0009}
.portal-support-alert{position:fixed;right:22px;bottom:130px;z-index:2147482000;display:grid;gap:4px;width:min(340px,calc(100vw - 32px));padding:14px;text-align:left;border:1px solid #705a2a;border-radius:14px;background:#11141a;color:#f5f1e8;box-shadow:0 18px 40px #000b}
.portal-support-alert span{color:#b9b3a8;font-size:12px}
`);

  for (const file of fs.readdirSync(path.join(root, "modules"), { withFileTypes: true })) {
    if (!file.isDirectory()) continue;
    const html = path.join(root, "modules", file.name, "index.html");
    if (!fs.existsSync(html)) continue;
    writeChanged(html, (text) => text.replaceAll("/new-ems/shared/portal-support.js?v=portal-support-1", "/new-ems/shared/portal-support-notifications.js?v=portal-support-notifications-1"));
  }
}

console.log("Support notification delivery sources updated.");
