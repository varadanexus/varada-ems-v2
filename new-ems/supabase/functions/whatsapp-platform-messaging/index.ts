// @ts-nocheck
// Protected customer API for the sellable WhatsApp Solutions Team Inbox.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_BODY_BYTES = 4 * 1024 * 1024;
const ALLOWED_ORIGINS = new Set(["https://www.varadanexus.com", "https://varadanexus.com"]);
const AGENT_ACTIONS = new Set([
  "list", "thread", "send_text", "update_conversation", "add_note",
  "list_contacts", "list_marketing_consent_events", "create_contact", "preview_contact_import", "import_contacts", "start_google_contacts_import", "consume_google_contacts_import", "start_chat", "update_contact", "delete_contacts",
  "list_templates", "list_template_library", "list_flows",
  "list_campaigns", "list_campaign_segments", "save_campaign",
  "list_notifications", "mark_notification_read", "mark_all_notifications_read", "dismiss_notification",
]);
const NOTIFICATION_ACTIONS = new Set([
  "list_notifications", "mark_notification_read", "mark_all_notifications_read", "dismiss_notification",
]);

function env(name: string) { return Deno.env.get(name) || ""; }
function isLoopback(origin: string) {
  try { const url = new URL(origin); return ["localhost","127.0.0.1","[::1]","::1"].includes(url.hostname) && ["http:","https:"].includes(url.protocol); }
  catch { return false; }
}
function allowedOrigin(req: Request) {
  const origin = req.headers.get("origin") || "";
  if (!origin) return "https://www.varadanexus.com";
  return ALLOWED_ORIGINS.has(origin) || isLoopback(origin) ? origin : "";
}
function headers(req: Request) {
  const origin = allowedOrigin(req);
  return { ...(origin ? { "Access-Control-Allow-Origin": origin } : {}), "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Max-Age": "600", "Cache-Control": "no-store", "Content-Type": "application/json", "Vary": "Origin", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer" };
}
function json(req: Request, body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: headers(req) }); }
function redirect(url: string) { return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" } }); }
function adminClient() { return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } }); }
async function customerSession(admin: any, tokenValue: unknown) {
  const token = String(tokenValue || "");
  if (!/^[a-f0-9]{64}$/i.test(token)) throw new Error("Unauthorized");
  const { data, error } = await admin.rpc("whatsapp_platform_validate_session", { p_session_token: token });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.tenant_id || !row?.user_id) throw new Error("Unauthorized");
  return row;
}
async function billingEntitlement(admin: any, customer: any) {
  const { data, error } = await admin.rpc("whatsapp_platform_billing_entitlement", { p_tenant_id: customer.tenant_id });
  if (error) throw error;
  return data || { allowed: false, state: "payment_required", reason: "Billing access could not be verified." };
}
function cleanUuid(value: unknown, label: string) {
  const id = String(value || "");
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id)) throw new Error(`Invalid ${label}.`);
  return id;
}
function cleanText(value: unknown, max: number) { return String(value || "").trim().replace(/\s+/g, " ").slice(0, max); }
function cleanEmail(value: unknown) {
  const email = cleanText(value, 254).toLowerCase();
  if (!/^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i.test(email)) throw new Error("Enter a valid work email address.");
  return email;
}
function randomHex(byteLength = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function htmlEscape(value: unknown) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] || character));
}
function zeptoAuthorization() {
  const raw = env("ZEPTO_SEND_MAIL_TOKEN").trim();
  if (!raw) throw new Error("Email delivery is not configured.");
  return raw.toLowerCase().startsWith("zoho-enczapikey") ? raw : `Zoho-enczapikey ${raw}`;
}
async function sendTeamInviteEmail(details: { email: string; displayName: string; companyName: string; roleCode: string; inviteUrl: string; expiresAt: string }) {
  const apiBase = (env("ZEPTO_API_BASE_URL") || "https://api.zeptomail.in").replace(/\/+$/, "");
  const authorization = zeptoAuthorization();
  const roleLabel = ({ admin: "Administrator", agent: "Agent", viewer: "Viewer" } as Record<string, string>)[details.roleCode] || "Member";
  const subject = `You're invited to ${details.companyName} on Varada Nexus WhatsApp Solutions`;
  const htmlBody = `<div style="margin:0;background:#f4f7f5;padding:32px 16px;font-family:Arial,sans-serif;color:#14211c"><div style="max-width:620px;margin:auto;background:#ffffff;border:1px solid #dce6e0;border-radius:18px;overflow:hidden"><div style="padding:28px 32px;background:#071d15;color:#ffffff"><div style="font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#37dc93">Varada Nexus</div><h1 style="margin:10px 0 4px;font-size:27px">Join your WhatsApp Solutions workspace</h1><p style="margin:0;color:#b9d1c7">A secure invitation from ${htmlEscape(details.companyName)}</p></div><div style="padding:30px 32px"><p>Hello ${htmlEscape(details.displayName)},</p><p>You have been invited to join <strong>${htmlEscape(details.companyName)}</strong> as a <strong>${htmlEscape(roleLabel)}</strong>.</p><p style="margin:28px 0"><a href="${htmlEscape(details.inviteUrl)}" style="display:inline-block;background:#12b76a;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:10px">Accept invitation</a></p><p style="font-size:13px;color:#62736b">This single-use link expires in seven days. If you were not expecting this invitation, you can ignore this email.</p><p style="font-size:12px;color:#7b8d84;word-break:break-all">If the button does not work, copy this address:<br>${htmlEscape(details.inviteUrl)}</p></div></div></div>`;
  const textBody = `Hello ${details.displayName},\n\nYou have been invited to join ${details.companyName} as a ${roleLabel}.\n\nAccept the invitation: ${details.inviteUrl}\n\nThis single-use link expires in seven days.`;
  const sendFrom = async (address: string) => {
    const response = await fetch(`${apiBase}/v1.1/email`, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: authorization }, body: JSON.stringify({ from: { address, name: "Varada Nexus Connect" }, to: [{ email_address: { address: details.email, name: details.displayName } }], reply_to: [{ address: "noreply@varadanexus.com", name: "Varada Nexus" }], subject, htmlbody: htmlBody, textbody: textBody, track_clicks: true, track_opens: true, client_reference: `whatsapp-team-invite-${Date.now()}` }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.message || payload?.message || "Invitation email delivery failed.");
    return payload;
  };
  try { return await sendFrom("nexusconnect@varadanexus.com"); }
  catch { return await sendFrom("noreply@varadanexus.com"); }
}
function decodeBase64Url(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
function decodeBase64Payload(value: unknown) {
  const base64 = String(value || "").replace(/\s+/g, "");
  if (!base64 || base64.length > 3 * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new Error("The profile photo is invalid or too large.");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
async function encryptionKey() {
  const material = env("WHATSAPP_PLATFORM_TOKEN_ENCRYPTION_KEY");
  if (material.length < 32) throw new Error("Messaging is not configured.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["decrypt"]);
}
async function decryptCredential(ciphertext: string) {
  const [version, ivValue, encryptedValue] = String(ciphertext || "").split(".");
  if (version !== "v1" || !ivValue || !encryptedValue) throw new Error("Messaging connection is invalid.");
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decodeBase64Url(ivValue) }, await encryptionKey(), decodeBase64Url(encryptedValue));
  const payload = JSON.parse(new TextDecoder().decode(decrypted));
  if (!payload?.accessToken) throw new Error("Messaging connection is invalid.");
  return payload;
}
function graphVersion() {
  const value = env("WHATSAPP_PLATFORM_META_GRAPH_VERSION");
  if (!/^v\d{1,3}\.0$/.test(value)) throw new Error("Messaging is not configured.");
  return value;
}
async function ownedBusinessNumber(admin: any, customer: any, value: unknown) {
  const connectionId = cleanUuid(value, "business number");
  const { data, error } = await admin.from("whatsapp_platform_connections")
    .select("id,phone_number_id,display_phone_number,verified_name,status")
    .eq("id", connectionId).eq("tenant_id", customer.tenant_id).single();
  if (error || !data || data.status !== "connected" || !data.phone_number_id) throw new Error("Select a connected WhatsApp business number.");
  return data;
}
async function listConversations(admin: any, customer: any, body: any) {
  const status = ["open","pending","resolved"].includes(String(body.status || "")) ? String(body.status) : null;
  const connection = body.connectionId ? await ownedBusinessNumber(admin, customer, body.connectionId) : null;
  let query = admin.from("whatsapp_platform_conversations")
    .select("id,connection_id,contact_id,status,priority,assigned_user_id,unread_count,last_message_at,last_message_preview,last_inbound_at,last_outbound_at,service_window_expires_at,created_at")
    .eq("tenant_id", customer.tenant_id).order("last_message_at", { ascending: false, nullsFirst: false }).limit(100);
  if (status) query = query.eq("status", status);
  if (connection) query = query.eq("connection_id", connection.id);
  const { data: conversations, error } = await query;
  if (error) throw error;
  const contactIds = [...new Set((conversations || []).map((row: any) => row.contact_id))];
  const userIds = [...new Set((conversations || []).map((row: any) => row.assigned_user_id).filter(Boolean))];
  const connectionIds = [...new Set((conversations || []).map((row: any) => row.connection_id))];
  const [{ data: contacts, error: contactsError }, { data: users, error: usersError }, { data: connections, error: connectionsError }] = await Promise.all([
    contactIds.length ? admin.from("whatsapp_platform_contacts").select("id,wa_id,phone_e164,profile_name,display_name,status").eq("tenant_id", customer.tenant_id).in("id", contactIds) : Promise.resolve({ data: [], error: null }),
    userIds.length ? admin.from("whatsapp_platform_users").select("id,display_name").eq("tenant_id", customer.tenant_id).in("id", userIds) : Promise.resolve({ data: [], error: null }),
    connectionIds.length ? admin.from("whatsapp_platform_connections").select("id,display_phone_number,verified_name,status").eq("tenant_id", customer.tenant_id).in("id", connectionIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (contactsError) throw contactsError; if (usersError) throw usersError; if (connectionsError) throw connectionsError;
  const contactMap = new Map((contacts || []).map((row: any) => [row.id, row]));
  const userMap = new Map((users || []).map((row: any) => [row.id, row]));
  const connectionMap = new Map((connections || []).map((row: any) => [row.id, row]));
  return { conversations: (conversations || []).map((row: any) => ({ ...row, contact: contactMap.get(row.contact_id) || null, assignee: userMap.get(row.assigned_user_id) || null, connection: connectionMap.get(row.connection_id) || null })) };
}
async function listTeam(admin: any, customer: any) {
  const [{ data, error }, { data: tenant, error: tenantError }] = await Promise.all([
    admin.from("whatsapp_platform_users")
      .select("id,display_name,email,role_code,status,last_login_at,created_at,invited_at,invite_expires_at")
      .eq("tenant_id", customer.tenant_id).order("display_name", { ascending: true }).limit(250),
    admin.from("whatsapp_platform_tenants").select("plan_code").eq("id", customer.tenant_id).single(),
  ]);
  if (error) throw error;
  if (tenantError || !tenant) throw new Error("Workspace package information is unavailable.");
  const catalogCode = tenant.plan_code === "starter" ? "launch" : tenant.plan_code;
  const master = await packageMaster(admin, customer);
  const plan = master?.package || null;
  const fallbackLimit = tenant.plan_code === "enterprise" ? null : tenant.plan_code === "growth" ? 10 : 3;
  const includedLimit = plan && Object.hasOwn(plan, "team_member_limit") ? plan.team_member_limit : fallbackLimit;
  const additionalSeats = Math.max(0, (master?.addons || []).reduce((total: number, addon: any) => total + Number(addon?.entitlement_effects?.team_member_limit || 0) * Number(addon?.quantity || 0), 0));
  const seatLimit = includedLimit === null ? null : Number(includedLimit) + additionalSeats;
  const seatsUsed = (data || []).filter((member: any) => ["active", "invited"].includes(member.status)).length;
  return {
    members: data || [], currentUserId: customer.user_id, currentRole: customer.role_code,
    capacity: { planCode: catalogCode, planLabel: plan?.name || catalogCode, includedSeats: includedLimit, additionalSeats, seatLimit, seatsUsed, availableSeats: seatLimit === null ? null : Math.max(0, seatLimit - seatsUsed) },
  };
}

async function packageMaster(admin: any, customer: any) {
  const { data, error } = await admin.rpc("whatsapp_platform_customer_package_master", {
    p_tenant_id: customer.tenant_id,
    p_user_id: customer.user_id,
  });
  if (error) throw error;
  return data || { package: null, addons: [], availableAddons: [] };
}
async function workspaceMessagingPreferences(admin: any, customer: any) {
  const { data, error } = await admin.from("whatsapp_platform_tenants")
    .select("stop_marketing_opt_out_enabled")
    .eq("id", customer.tenant_id).single();
  if (error) throw error;
  return { stopMarketingOptOutEnabled: data?.stop_marketing_opt_out_enabled !== false };
}
async function updateWorkspaceMessagingPreferences(admin: any, customer: any, body: any) {
  if (!["owner","admin"].includes(customer.role_code)) throw new Error("Only workspace owners and administrators can change messaging preferences.");
  if (typeof body.stopMarketingOptOutEnabled !== "boolean") throw new Error("Choose whether STOP marketing opt-out is enabled.");
  const { data, error } = await admin.from("whatsapp_platform_tenants").update({
    stop_marketing_opt_out_enabled: body.stopMarketingOptOutEnabled,
    updated_at: new Date().toISOString(),
  }).eq("id", customer.tenant_id).select("stop_marketing_opt_out_enabled").single();
  if (error) throw error;
  return { stopMarketingOptOutEnabled: data?.stop_marketing_opt_out_enabled !== false };
}
async function requirePackageFeature(admin: any, customer: any, feature: string) {
  const master = await packageMaster(admin, customer);
  const enabled = master?.package?.entitlements?.[feature];
  if (enabled === false || enabled === 0 || enabled === "none") {
    const label = feature.replaceAll("_", " ");
    throw new Error(`${label.charAt(0).toUpperCase()}${label.slice(1)} is not included in the active package. Upgrade the subscription or add the required entitlement.`);
  }
  return master;
}
function packageLimit(master: any, key: string) {
  const included = master?.package?.[key];
  if (included === null || included === undefined) return null;
  const additional = (master?.addons || []).reduce((total: number, addon: any) => total + Number(addon?.entitlement_effects?.[key] || 0) * Number(addon?.quantity || 0), 0);
  return Math.max(0, Number(included || 0) + additional);
}
async function assertTableCapacity(admin: any, customer: any, master: any, key: string, table: string, filters: Record<string, unknown> = {}) {
  const limit = packageLimit(master, key);
  if (limit === null) return;
  let query = admin.from(table).select("id", { count: "exact", head: true }).eq("tenant_id", customer.tenant_id);
  Object.entries(filters).forEach(([column, value]) => { query = query.eq(column, value); });
  const { count, error } = await query;
  if (error) throw error;
  if (Number(count || 0) >= limit) throw new Error(`The active package limit of ${limit.toLocaleString("en-IN")} has been reached. Upgrade the package or add capacity before creating another record.`);
}
async function assertOutboundMessageCapacity(admin: any, customer: any, requested = 1) {
  const master = await packageMaster(admin, customer);
  const limit = packageLimit(master, "monthly_message_limit");
  if (limit === null) return;
  const start = new Date(); start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
  const { count, error } = await admin.from("whatsapp_platform_messages").select("id", { count: "exact", head: true })
    .eq("tenant_id", customer.tenant_id).eq("direction", "outbound").gte("created_at", start.toISOString());
  if (error) throw error;
  if (Number(count || 0) + requested > limit) throw new Error(`The active package limit of ${limit.toLocaleString("en-IN")} outbound messages per month has been reached. Upgrade or add message capacity before sending.`);
}
async function assertMetaTemplateCapacity(admin: any, customer: any, connection: any, accessToken: string) {
  const master = await packageMaster(admin, customer);
  const limit = packageLimit(master, "template_limit");
  if (limit === null) return;
  const url = new URL(`https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(connection.whatsapp_business_account_id)}/message_templates`);
  url.searchParams.set("limit", "1");
  url.searchParams.set("summary", "true");
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const graph = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(graph?.error?.error_user_msg || graph?.error?.message || "Message template capacity could not be verified.");
  const used = Number(graph?.summary?.total_count ?? (Array.isArray(graph?.data) ? graph.data.length : 0));
  if (used >= limit) throw new Error(`The active package limit of ${limit.toLocaleString("en-IN")} message template${limit === 1 ? "" : "s"} has been reached. Upgrade or add template capacity before creating another template.`);
}
async function inviteTeamMember(admin: any, customer: any, body: any) {
  if (!["owner","admin"].includes(customer.role_code)) throw new Error("Only workspace administrators can invite members.");
  const displayName = cleanText(body.displayName, 100);
  if (displayName.length < 2) throw new Error("Enter the member's full name.");
  const email = cleanEmail(body.email);
  const roleCode = String(body.roleCode || "agent");
  if (!["admin","agent","viewer"].includes(roleCode)) throw new Error("Select a valid workspace role.");
  if (roleCode === "admin" && customer.role_code !== "owner") throw new Error("Only the workspace owner can invite administrators.");

  const inviteToken = randomHex(32);
  const tokenHash = await sha256(inviteToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString();
  const { data, error } = await admin.rpc("whatsapp_platform_create_invite", {
    p_tenant_id: customer.tenant_id, p_display_name: displayName, p_email: email,
    p_role_code: roleCode, p_invite_token_hash: tokenHash,
    p_invite_expires_at: expiresAt, p_invited_by_user_id: customer.user_id,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  const userId = row?.user_id || "";
  if (!userId) throw new Error("The invitation could not be created.");
  const inviteUrl = `https://www.varadanexus.com/whatsapp-platform/access/?invite=${inviteToken}`;
  let emailSent = false;
  let deliveryError = "";
  try {
    await sendTeamInviteEmail({ email, displayName, companyName: customer.company_name || "your company", roleCode, inviteUrl, expiresAt });
    emailSent = true;
  } catch (error) {
    deliveryError = error instanceof Error ? error.message : "Invitation email delivery failed.";
  }
  return { member: { id: userId, display_name: displayName, email, role_code: roleCode, status: "invited", invite_expires_at: expiresAt }, inviteUrl, emailSent, deliveryError };
}
async function updateTeamMember(admin: any, customer: any, body: any) {
  if (!["owner","admin"].includes(customer.role_code)) throw new Error("Only workspace administrators can manage members.");
  const memberId = cleanUuid(body.memberId, "member");
  if (memberId === customer.user_id) throw new Error("You cannot change your own role or access status.");
  const { data: target, error: targetError } = await admin.from("whatsapp_platform_users")
    .select("id,role_code,status").eq("id", memberId).eq("tenant_id", customer.tenant_id).single();
  if (targetError || !target) throw new Error("Workspace member not found.");
  if (target.role_code === "owner") throw new Error("The workspace owner cannot be changed here.");
  if (customer.role_code === "admin" && target.role_code === "admin") throw new Error("Only the workspace owner can manage administrators.");
  const roleCode = String(body.roleCode || target.role_code);
  const status = String(body.status || target.status);
  if (!["admin","agent","viewer"].includes(roleCode)) throw new Error("Select a valid workspace role.");
  if (!["active","invited","disabled"].includes(status)) throw new Error("Select a valid member status.");
  if (roleCode === "admin" && customer.role_code !== "owner") throw new Error("Only the workspace owner can assign administrator access.");
  if (status === "active" && target.status === "invited") throw new Error("An invited member must accept their secure link before activation.");

  const { data, error } = await admin.rpc("whatsapp_platform_update_member_access", {
    p_tenant_id: customer.tenant_id,
    p_actor_user_id: customer.user_id,
    p_member_id: memberId,
    p_role_code: roleCode,
    p_status: status,
  });
  if (error || !data) throw new Error(error?.message || "The member could not be updated.");
  if (status === "disabled") {
    const { error: revokeError } = await admin.from("whatsapp_platform_sessions").update({ revoked_at: new Date().toISOString() }).eq("user_id", memberId).is("revoked_at", null);
    if (revokeError) throw revokeError;
  }
  return { member: data };
}
async function listContacts(admin: any, customer: any, body: any) {
  const requestedStatus = String(body.status || "");
  const status = ["active","blocked"].includes(requestedStatus) ? requestedStatus : null;
  const requestedCategory = String(body.category || "");
  const category = ["uncategorized","lead","prospect","customer","partner","vendor","other"].includes(requestedCategory) ? requestedCategory : null;
  const marketingOptedOut = requestedStatus === "opted_out";
  const page = Math.max(1, Number.parseInt(String(body.page || "1"), 10) || 1);
  const pageSize = Math.min(5000, Math.max(10, Number.parseInt(String(body.pageSize || "50"), 10) || 50));
  const search = String(body.search || "").trim();
  const connection = body.connectionId ? await ownedBusinessNumber(admin, customer, body.connectionId) : null;
  const [totalResult, activeResult, blockedResult, optedOutResult] = await Promise.all([
    admin.from("whatsapp_platform_contacts").select("id", { count: "exact", head: true }).eq("tenant_id", customer.tenant_id),
    admin.from("whatsapp_platform_contacts").select("id", { count: "exact", head: true }).eq("tenant_id", customer.tenant_id).eq("status", "active"),
    admin.from("whatsapp_platform_contacts").select("id", { count: "exact", head: true }).eq("tenant_id", customer.tenant_id).eq("status", "blocked"),
    admin.from("whatsapp_platform_contacts").select("id", { count: "exact", head: true }).eq("tenant_id", customer.tenant_id).not("marketing_opt_out_at", "is", null),
  ]);
  const statisticsError = totalResult.error || activeResult.error || blockedResult.error || optedOutResult.error;
  if (statisticsError) throw statisticsError;
  let query = admin.from("whatsapp_platform_contacts")
    .select("id,wa_id,phone_e164,profile_name,display_name,status,contact_category,marketing_opt_in_at,marketing_opt_in_source,marketing_opt_out_at,last_inbound_at,last_outbound_at,created_at,updated_at", { count: "exact" })
    .eq("tenant_id", customer.tenant_id).order("updated_at", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
  if (status) query = query.eq("status", status);
  if (category) query = query.eq("contact_category", category);
  if (marketingOptedOut) query = query.not("marketing_opt_out_at", "is", null);
  if (search) query = query.or(`display_name.ilike.%${search.replace(/[,()]/g, " ") }%,profile_name.ilike.%${search.replace(/[,()]/g, " ") }%,phone_e164.ilike.%${search.replace(/[,()]/g, " ") }%,contact_category.ilike.%${search.replace(/[,()]/g, " ") }%`);
  const { data: contacts, error, count } = await query;
  if (error) throw error;
  const contactIds = (contacts || []).map((row: any) => row.id);
  let conversationQuery = contactIds.length
    ? admin.from("whatsapp_platform_conversations").select("id,connection_id,contact_id,status,last_message_at,unread_count").eq("tenant_id", customer.tenant_id).in("contact_id", contactIds)
    : null;
  if (conversationQuery && connection) conversationQuery = conversationQuery.eq("connection_id", connection.id);
  // Contact records are the primary directory data. Conversation enrichment is
  // optional; a stale/malformed conversation row must never hide every contact.
  const { data: conversations, error: conversationError } = conversationQuery ? await conversationQuery : { data: [], error: null };
  if (conversationError) console.warn("Contact conversation enrichment failed", conversationError);
  const conversationMap = new Map((conversations || []).map((row: any) => [row.contact_id, row]));
  return {
    contacts: (contacts || []).map((row: any) => ({ ...row, conversation: conversationMap.get(row.id) || null })),
    pagination: { page, pageSize, total: Number(count || 0), totalPages: Math.max(1, Math.ceil(Number(count || 0) / pageSize)), search },
    statistics: { total: Number(totalResult.count || 0), active: Number(activeResult.count || 0), blocked: Number(blockedResult.count || 0), optedOut: Number(optedOutResult.count || 0) },
  };
}
async function listMarketingConsentEvents(admin: any, customer: any, body: any) {
  const contactId = cleanUuid(body.contactId, "contact");
  const { data: contact, error: contactError } = await admin.from("whatsapp_platform_contacts")
    .select("id").eq("id", contactId).eq("tenant_id", customer.tenant_id).maybeSingle();
  if (contactError || !contact) throw new Error("Contact not found.");
  const { data, error } = await admin.from("whatsapp_platform_marketing_consent_events")
    .select("id,event_type,source,keyword,confirmation_status,confirmation_error,occurred_at,created_at")
    .eq("tenant_id", customer.tenant_id).eq("contact_id", contactId)
    .order("occurred_at", { ascending: false }).limit(100);
  if (error) throw error;
  return { events: data || [] };
}
async function templateConnection(admin: any, customer: any, connectionId: unknown) {
  const id = cleanUuid(connectionId, "connection");
  const [{ data: connection, error: connectionError }, { data: credential, error: credentialError }] = await Promise.all([
    admin.from("whatsapp_platform_connections").select("id,whatsapp_business_account_id,phone_number_id,display_phone_number,verified_name,status,onboarding_metadata").eq("id", id).eq("tenant_id", customer.tenant_id).single(),
    admin.from("whatsapp_platform_provider_credentials").select("credential_ciphertext,expires_at").eq("connection_id", id).eq("tenant_id", customer.tenant_id).single(),
  ]);
  if (connectionError || !connection?.whatsapp_business_account_id || connection.status !== "connected") throw new Error("Select a connected WhatsApp Business account.");
  if (credentialError || !credential) throw new Error("The WhatsApp connection credential is unavailable.");
  if (credential.expires_at && new Date(credential.expires_at).getTime() <= Date.now()) throw new Error("The WhatsApp connection has expired. Reconnect Meta Business.");
  return { connection, credential, secret: await decryptCredential(credential.credential_ciphertext) };
}

const BUSINESS_VERTICALS = new Set(["UNDEFINED","OTHER","AUTO","BEAUTY","APPAREL","EDU","ENTERTAIN","EVENT_PLAN","FINANCE","GROCERY","GOVT","HOTEL","HEALTH","NONPROFIT","PROF_SERVICES","RETAIL","TRAVEL","RESTAURANT","NOT_A_BIZ"]);
const READY_META_PHONE_STATUSES = new Set(["CONNECTED","ACTIVE","READY"]);
function profileText(value: unknown, maximum: number, label: string) {
  const text = String(value || "").trim();
  if (text.length > maximum) throw new Error(`${label} cannot exceed ${maximum} characters.`);
  return text;
}
function normalizeBusinessWebsite(value: unknown) {
  const entered = profileText(value, 256, "Website");
  if (!entered) return "";
  const website = /^[a-z][a-z0-9+.-]*:\/\//i.test(entered) ? entered : `https://${entered}`;
  let parsed: URL;
  try { parsed = new URL(website); } catch { throw new Error("Enter a valid business website such as www.example.com."); }
  if (!["https:","http:"].includes(parsed.protocol) || !parsed.hostname) throw new Error("Enter a valid business website such as www.example.com.");
  return parsed.toString();
}
async function refreshMetaPhoneStatus(admin: any, connection: any, secret: any) {
  const url = new URL(`https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(connection.phone_number_id)}`);
  url.searchParams.set("fields", "id,display_phone_number,verified_name,quality_rating,status,code_verification_status");
  const response = await fetch(url, { headers: { Authorization: `Bearer ${secret.accessToken}` } });
  const graph = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.warn("Meta WhatsApp phone status refresh failed", { status: response.status, code: graph?.error?.code || null, trace: graph?.error?.fbtrace_id || null });
    return connection;
  }
  const previous = connection.onboarding_metadata && typeof connection.onboarding_metadata === "object" ? connection.onboarding_metadata : {};
  const phoneStatus = String(graph.status || previous.phone_status || "").toUpperCase();
  const verificationStatus = String(graph.code_verification_status || "").toUpperCase();
  const metadata = {
    ...previous,
    phone_status: phoneStatus || null,
    code_verification_status: verificationStatus || null,
    name_status: previous.name_status || null,
    quality_rating: graph.quality_rating || previous.quality_rating || null,
    phone_status_checked_at: new Date().toISOString(),
  };
  const updates: Record<string, unknown> = { onboarding_metadata: metadata, updated_at: new Date().toISOString() };
  if (graph.display_phone_number) updates.display_phone_number = graph.display_phone_number;
  if (graph.verified_name) updates.verified_name = graph.verified_name;
  const { error } = await admin.from("whatsapp_platform_connections").update(updates).eq("id", connection.id);
  if (error) console.error("WhatsApp phone status persistence failed", { code: error.code || null });
  Object.assign(connection, updates);
  return connection;
}
function requireReadyMetaPhone(connection: any) {
  const metadata = connection.onboarding_metadata && typeof connection.onboarding_metadata === "object" ? connection.onboarding_metadata : {};
  const phoneStatus = String(metadata.phone_status || "").toUpperCase();
  const verificationStatus = String(metadata.code_verification_status || "").toUpperCase();
  const isDeveloperTest = metadata.test_number === true;
  const phoneNotReady = Boolean(phoneStatus && !READY_META_PHONE_STATUSES.has(phoneStatus));
  const verificationNotReady = Boolean(!isDeveloperTest && verificationStatus && verificationStatus !== "VERIFIED");
  if (phoneNotReady || verificationNotReady) {
    if (phoneNotReady) {
      const label = phoneStatus.replaceAll("_", " ").toLowerCase();
      throw new Error(`This WhatsApp number is still ${label} in Meta. Complete phone registration in WhatsApp Manager, then refresh from Meta.`);
    }
    throw new Error("This WhatsApp number has not completed Meta phone verification. Finish SMS or voice verification and the two-step PIN if prompted, then refresh from Meta.");
  }
}
async function getBusinessProfile(admin: any, customer: any, body: any) {
  if (!["owner","admin"].includes(customer.role_code)) throw new Error("Only workspace owners and administrators can manage the WhatsApp profile.");
  const { connection, secret } = await templateConnection(admin, customer, body.connectionId);
  if (!connection.phone_number_id) throw new Error("Select a connected WhatsApp business number.");
  await refreshMetaPhoneStatus(admin, connection, secret);
  const url = new URL(`https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(connection.phone_number_id)}/whatsapp_business_profile`);
  url.searchParams.set("fields", "about,address,description,email,profile_picture_url,websites,vertical");
  const response = await fetch(url, { headers: { Authorization: `Bearer ${secret.accessToken}` } });
  const graph = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(graph?.error?.error_user_msg || graph?.error?.message || "The WhatsApp profile could not be loaded.");
  return { connection, profile: Array.isArray(graph?.data) ? graph.data[0] || {} : graph?.data || graph || {} };
}
async function uploadBusinessProfilePhoto(secret: any, photo: any) {
  const mimeType = String(photo?.mimeType || "").toLowerCase();
  if (!["image/jpeg","image/png"].includes(mimeType)) throw new Error("The profile photo must be a JPG or PNG image.");
  const bytes = decodeBase64Payload(photo?.base64);
  if (bytes.byteLength > 2 * 1024 * 1024) throw new Error("The profile photo cannot exceed 2 MB.");
  const appId = env("WHATSAPP_PLATFORM_META_APP_ID");
  if (!appId) throw new Error("Meta profile photo uploads are not configured.");
  const sessionUrl = new URL(`https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(appId)}/uploads`);
  sessionUrl.searchParams.set("file_length", String(bytes.byteLength));
  sessionUrl.searchParams.set("file_type", mimeType);
  sessionUrl.searchParams.set("file_name", profileText(photo?.fileName, 180, "Photo file name") || "whatsapp-profile.jpg");
  const sessionResponse = await fetch(sessionUrl, { method: "POST", headers: { Authorization: `Bearer ${secret.accessToken}` } });
  const session = await sessionResponse.json().catch(() => ({}));
  if (!sessionResponse.ok || !session?.id) throw new Error(session?.error?.error_user_msg || session?.error?.message || "Meta could not start the profile photo upload.");
  const uploadSessionId = String(session.id);
  if (!uploadSessionId.startsWith("upload:") || uploadSessionId.length > 4096 || /[\s\u0000-\u001f\u007f]/.test(uploadSessionId)) throw new Error("Meta returned an invalid profile photo upload session.");
  const uploadResponse = await fetch(`https://graph.facebook.com/${graphVersion()}/${uploadSessionId}`, {
    method: "POST",
    headers: { Authorization: `OAuth ${secret.accessToken}`, file_offset: "0", "Content-Type": mimeType },
    body: bytes,
  });
  const uploaded = await uploadResponse.json().catch(() => ({}));
  if (!uploadResponse.ok || !uploaded?.h) throw new Error(uploaded?.error?.error_user_msg || uploaded?.error?.message || "Meta could not upload the profile photo.");
  return String(uploaded.h);
}
async function updateBusinessProfile(admin: any, customer: any, body: any) {
  if (!["owner","admin"].includes(customer.role_code)) throw new Error("Only workspace owners and administrators can manage the WhatsApp profile.");
  const { connection, secret } = await templateConnection(admin, customer, body.connectionId);
  if (!connection.phone_number_id) throw new Error("Select a connected WhatsApp business number.");
  await refreshMetaPhoneStatus(admin, connection, secret);
  requireReadyMetaPhone(connection);
  const about = profileText(body.about, 139, "Profile about");
  if (!about) throw new Error("Add a short profile about message.");
  const description = profileText(body.description, 256, "Business description");
  const address = profileText(body.address, 256, "Business address");
  const email = profileText(body.email, 128, "Business email").toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid business email address.");
  const vertical = String(body.vertical || "UNDEFINED").toUpperCase();
  if (!BUSINESS_VERTICALS.has(vertical)) throw new Error("Select a valid business category.");
  const websites = (Array.isArray(body.websites) ? body.websites : []).map(normalizeBusinessWebsite).filter(Boolean);
  if (websites.length > 2) throw new Error("WhatsApp supports up to two business websites.");
  const payload: Record<string, unknown> = { messaging_product: "whatsapp", about, address, description, email, vertical, websites };
  if (body.photo) payload.profile_picture_handle = await uploadBusinessProfilePhoto(secret, body.photo);
  const response = await fetch(`https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(connection.phone_number_id)}/whatsapp_business_profile`, {
    method: "POST", headers: { Authorization: `Bearer ${secret.accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  const graph = await response.json().catch(() => ({}));
  if (!response.ok || graph?.success !== true) {
    const metaError = graph?.error || {};
    console.error("Meta WhatsApp profile update failed", {
      status: response.status,
      code: metaError.code || null,
      subcode: metaError.error_subcode || null,
      type: metaError.type || null,
      trace: metaError.fbtrace_id || null,
    });
    const message = String(metaError.error_user_msg || metaError.message || "");
    if (Number(metaError.code) === 190 || /token.*(?:expired|invalid)|session.*expired/i.test(message)) {
      throw new Error("The Meta access token has expired or is invalid. Reconnect this number from Business numbers and try again.");
    }
    if ([10, 200].includes(Number(metaError.code)) || /permission|whatsapp_business_management/i.test(message)) {
      throw new Error("This Meta token cannot update the WhatsApp profile. Reconnect the number using a System User access token with whatsapp_business_management and whatsapp_business_messaging permissions.");
    }
    if (Number(metaError.code) === 1 || /unknown error/i.test(message)) {
      const isDeveloperTest = connection.onboarding_metadata?.test_number === true;
      throw new Error(isDeveloperTest
        ? "Meta rejected this developer test-number profile update. Reconnect it from Business numbers using a System User access token with WhatsApp management and messaging permissions, then try again."
        : "Meta rejected this profile update. Confirm the phone number shows Connected in WhatsApp Manager, refresh it in the workspace, and try again.");
    }
    throw new Error(message ? `${message}${metaError.code ? ` (Meta error ${metaError.code})` : ""}` : "The WhatsApp profile could not be updated.");
  }
  return getBusinessProfile(admin, customer, body);
}
function normalizeMetaTemplate(template: any) {
  return {
    id: String(template?.id || ""), name: String(template?.name || ""), status: String(template?.status || "UNKNOWN").toUpperCase(),
    category: String(template?.category || "UNKNOWN").toUpperCase(), language: String(template?.language || ""),
    components: Array.isArray(template?.components) ? template.components : [],
  };
}
async function fetchMetaTemplates(whatsappBusinessAccountId: string, accessToken: string) {
  const url = new URL(`https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(whatsappBusinessAccountId)}/message_templates`);
  url.searchParams.set("limit", "100");
  const graphResponse = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const graph = await graphResponse.json().catch(() => ({}));
  if (!graphResponse.ok) throw new Error(graph?.error?.error_user_msg || graph?.error?.message || "Message templates could not be loaded.");
  return (Array.isArray(graph?.data) ? graph.data : []).map(normalizeMetaTemplate);
}
function formatTemplateMessage(components: any[]) {
  const sections: string[] = [];
  for (const component of Array.isArray(components) ? components : []) {
    const type = String(component?.type || "").toUpperCase();
    const text = String(component?.text || "").trim();
    if (["HEADER", "BODY", "FOOTER"].includes(type) && text) sections.push(text);
    else if (type === "HEADER" && component?.format && String(component.format).toUpperCase() !== "TEXT") {
      sections.push(`[${String(component.format).toLowerCase()} attachment]`);
    } else if (type === "BUTTONS") {
      const buttons = (Array.isArray(component?.buttons) ? component.buttons : [])
        .map((button: any) => String(button?.text || "").trim()).filter(Boolean);
      if (buttons.length) sections.push(buttons.map((label: string) => `• ${label}`).join("\n"));
    }
  }
  return sections.join("\n\n").trim();
}
async function listTemplates(admin: any, customer: any, body: any) {
  const connectionId = cleanUuid(body.connectionId, "connection");
  const { connection, secret } = await templateConnection(admin, customer, connectionId);
  const templates = await fetchMetaTemplates(connection.whatsapp_business_account_id, secret.accessToken);
  return { connection: { id: connection.id, displayPhoneNumber: connection.display_phone_number, verifiedName: connection.verified_name }, templates };
}
// Meta's own pre-approved utility and authentication template catalogue.
async function listTemplateLibrary(admin: any, customer: any, body: any) {
  const { connection, secret } = await templateConnection(admin, customer, body.connectionId);
  const category = String(body.category || "UTILITY").trim().toUpperCase();
  const language = String(body.language || "en_US").trim();
  if (!["UTILITY", "AUTHENTICATION"].includes(category)) throw new Error("The Meta library supports Utility and Authentication templates.");
  if (!/^[A-Za-z]{2,3}(?:_[A-Za-z]{2})?$/.test(language)) throw new Error("Enter a valid template library language.");
  const url = new URL(`https://graph.facebook.com/${graphVersion()}/message_template_library`);
  url.searchParams.set("category", category);
  url.searchParams.set("language", language);
  url.searchParams.set("limit", "100");
  const search = String(body.search || "").trim();
  if (search) url.searchParams.set("search", search.slice(0, 120));
  const graphResponse = await fetch(url, { headers: { Authorization: `Bearer ${secret.accessToken}` } });
  const graph = await graphResponse.json().catch(() => ({}));
  if (!graphResponse.ok) throw new Error(graph?.error?.error_user_msg || graph?.error?.message || "Meta's template library could not be loaded.");
  const templates = (Array.isArray(graph?.data) ? graph.data : []).map((template: any) => ({
    id: String(template.id || ""), name: String(template.name || ""), language: String(template.language || language),
    category: String(template.category || category).toUpperCase(), topic: String(template.topic || ""), usecase: String(template.usecase || ""),
    industry: Array.isArray(template.industry) ? template.industry.map(String) : [], header: String(template.header || ""),
    body: String(template.body || ""), footer: String(template.footer || ""), bodyParams: Array.isArray(template.body_params) ? template.body_params.map(String) : [],
    bodyParamTypes: Array.isArray(template.body_param_types) ? template.body_param_types.map(String) : [], buttons: Array.isArray(template.buttons) ? template.buttons : [],
  }));
  return { connection: { id: connection.id }, templates };
}
async function createTemplate(admin: any, customer: any, body: any) {
  if (!['owner','admin'].includes(customer.role_code)) throw new Error("Only workspace administrators can create templates.");
  const name = String(body.name || "").trim().toLowerCase();
  const language = String(body.language || "en_US").trim();
  const category = String(body.category || "UTILITY").trim().toUpperCase();
  const bodyText = String(body.bodyText || "").trim();
  const headerText = String(body.headerText || "").trim();
  const footerText = String(body.footerText || "").trim();
  const contentType = String(body.contentType || "TEXT").trim().toUpperCase();
  const variableExamples = Array.isArray(body.variableExamples) ? body.variableExamples.map((value: any) => String(value || "").trim()) : [];
  const buttons = Array.isArray(body.buttons) ? body.buttons : [];
  const libraryTemplateName = String(body.libraryTemplateName || "").trim();
  if (!/^[a-z0-9_]{1,512}$/.test(name)) throw new Error("Template names can contain only lowercase letters, numbers and underscores.");
  if (!/^[A-Za-z]{2,3}(?:_[A-Za-z]{2})?$/.test(language)) throw new Error("Enter a valid language code, such as en_US.");
  if (!["MARKETING","UTILITY","AUTHENTICATION"].includes(category)) throw new Error("Select a valid template category.");
  if (libraryTemplateName) {
    if (!/^[a-z0-9_]{1,512}$/.test(libraryTemplateName)) throw new Error("Select a valid Meta library template.");
    if (!["UTILITY", "AUTHENTICATION"].includes(category)) throw new Error("Meta library templates must use their Utility or Authentication category.");
    const libraryButtonInputs = Array.isArray(body.libraryButtonInputs) ? body.libraryButtonInputs.slice(0, 3).map((input: any) => {
      const type = String(input?.type || "").toUpperCase();
      if (type === "URL") {
        const baseUrl = String(input?.baseUrl || "").trim();
        const example = String(input?.example || "").trim();
        if (!/^https:\/\/[^\s]+$/i.test(baseUrl) || !/^https:\/\/[^\s]+$/i.test(example)) throw new Error("Library URL buttons require a valid HTTPS base URL and example URL.");
        return { type: "URL", url: { base_url: baseUrl, url_suffix_example: example } };
      }
      if (type === "PHONE_NUMBER") {
        const phoneNumber = String(input?.phoneNumber || "").trim();
        if (!/^\+[1-9][0-9]{6,14}$/.test(phoneNumber)) throw new Error("Library phone buttons require an international phone number.");
        return { type: "PHONE_NUMBER", phone_number: phoneNumber };
      }
      throw new Error("Select a supported library button input.");
    }) : [];
    const { connection, secret } = await templateConnection(admin, customer, body.connectionId);
    await assertMetaTemplateCapacity(admin, customer, connection, secret.accessToken);
    const requestBody: any = { name, language, category, library_template_name: libraryTemplateName };
    if (libraryButtonInputs.length) requestBody.library_template_button_inputs = libraryButtonInputs;
    const graphResponse = await fetch(`https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(connection.whatsapp_business_account_id)}/message_templates`, {
      method: "POST", headers: { Authorization: `Bearer ${secret.accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(requestBody),
    });
    const graph = await graphResponse.json().catch(() => ({}));
    if (!graphResponse.ok || !graph?.id) throw new Error(graph?.error?.error_user_msg || graph?.error?.message || "The library template could not be added to this account.");
    return { template: { id: String(graph.id), name, language, category, status: String(graph.status || "PENDING").toUpperCase(), libraryTemplateName } };
  }
  if (!["TEXT","MEDIA","CTA","QUICK_REPLY","CATALOG","MPM","AUTHENTICATION"].includes(contentType)) throw new Error("Select a supported WhatsApp template content type.");
  const authentication = contentType === "AUTHENTICATION";
  if (authentication && category !== "AUTHENTICATION") throw new Error("Authentication content must use the Authentication category.");
  if (!authentication && category === "AUTHENTICATION") throw new Error("Select the Authentication content type for this category.");
  if (["CATALOG","MPM"].includes(contentType) && category !== "MARKETING") throw new Error("Catalog templates must use the Marketing category.");
  if (!authentication && (!bodyText || bodyText.length > 1024)) throw new Error("Template body must contain between 1 and 1,024 characters.");
  if (headerText.length > 60) throw new Error("Template header cannot exceed 60 characters.");
  if (footerText.length > 60) throw new Error("Template footer cannot exceed 60 characters.");
  const placeholderNumbers = [...bodyText.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((match) => Number(match[1]));
  const uniqueNumbers = [...new Set(placeholderNumbers)].sort((a, b) => a - b);
  if (uniqueNumbers.some((number, index) => number !== index + 1)) throw new Error("Body variables must be sequential, starting with {{1}}.");
  if (uniqueNumbers.length > 20) throw new Error("A template can contain no more than 20 body variables.");
  if (variableExamples.length < uniqueNumbers.length || variableExamples.slice(0, uniqueNumbers.length).some((value: string) => !value || value.length > 100)) throw new Error("Provide a realistic example of up to 100 characters for every body variable.");
  const headerVariables = [...headerText.matchAll(/\{\{\s*(\d+)\s*\}\}/g)];
  if (headerVariables.length > 1 || (headerVariables.length === 1 && headerVariables[0][1] !== "1")) throw new Error("A text header supports only the {{1}} variable.");
  if (buttons.length > 3) throw new Error("A template can contain no more than three buttons.");
  const graphButtons = buttons.map((button: any) => {
    const type = String(button?.type || "").toUpperCase();
    const text = String(button?.text || "").trim();
    if (!text || text.length > 25) throw new Error("Every button needs a label of up to 25 characters.");
    if (type === "QUICK_REPLY") return { type, text };
    if (type === "URL") { const url = String(button?.url || "").trim(); if (!/^https:\/\/[^\s]+$/i.test(url)) throw new Error("Website buttons require a valid HTTPS URL."); return { type, text, url }; }
    if (type === "PHONE_NUMBER") { const phone_number = String(button?.phone_number || "").trim(); if (!/^\+[1-9][0-9]{6,14}$/.test(phone_number)) throw new Error("Call buttons require a valid international phone number."); return { type, text, phone_number }; }
    throw new Error("Select a supported template button type.");
  });
  if (graphButtons.some((button: any) => button.type === "QUICK_REPLY") && graphButtons.some((button: any) => button.type !== "QUICK_REPLY")) throw new Error("Quick replies and call-to-action buttons cannot be combined.");
  const components: any[] = [];
  if (authentication) {
    const expiration = Number(body.codeExpirationMinutes || 10);
    const otpText = String(body.otpButtonText || "Copy Code").trim();
    if (!Number.isInteger(expiration) || expiration < 1 || expiration > 90) throw new Error("Authentication code expiry must be between 1 and 90 minutes.");
    if (!otpText || otpText.length > 25) throw new Error("The OTP button label must contain between 1 and 25 characters.");
    components.push({ type: "BODY", add_security_recommendation: body.addSecurityRecommendation !== false });
    components.push({ type: "FOOTER", code_expiration_minutes: expiration });
    components.push({ type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "COPY_CODE", text: otpText }] });
  } else {
    if (contentType === "MEDIA") {
      const mediaFormat = String(body.mediaFormat || "").toUpperCase();
      const mediaHandle = String(body.mediaHandle || "").trim();
      if (!["IMAGE","VIDEO","DOCUMENT"].includes(mediaFormat)) throw new Error("Select a valid media header format.");
      if (!mediaHandle || mediaHandle.length > 4096) throw new Error("Provide the Meta sample media handle returned by the resumable upload API.");
      components.push({ type: "HEADER", format: mediaFormat, example: { header_handle: [mediaHandle] } });
    } else if (headerText) {
      components.push({ type: "HEADER", format: "TEXT", text: headerText, ...(headerVariables.length ? { example: { header_text: [String(body.headerExample || "").trim()] } } : {}) });
      if (headerVariables.length && (!String(body.headerExample || "").trim() || String(body.headerExample).trim().length > 100)) throw new Error("Provide a realistic header variable example.");
    }
    components.push({ type: "BODY", text: bodyText, ...(uniqueNumbers.length ? { example: { body_text: [variableExamples.slice(0, uniqueNumbers.length)] } } : {}) });
    if (footerText) components.push({ type: "FOOTER", text: footerText });
    if (contentType === "CATALOG") components.push({ type: "BUTTONS", buttons: [{ type: "CATALOG", text: "View catalog" }] });
    else if (contentType === "MPM") components.push({ type: "BUTTONS", buttons: [{ type: "MPM", text: "View items" }] });
    else if (graphButtons.length) components.push({ type: "BUTTONS", buttons: graphButtons });
  }
  const { connection, secret } = await templateConnection(admin, customer, body.connectionId);
  await assertMetaTemplateCapacity(admin, customer, connection, secret.accessToken);
  const graphResponse = await fetch(`https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(connection.whatsapp_business_account_id)}/message_templates`, {
    method: "POST", headers: { Authorization: `Bearer ${secret.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, language, category, components }),
  });
  const graph = await graphResponse.json().catch(() => ({}));
  if (!graphResponse.ok || !graph?.id) throw new Error(graph?.error?.error_user_msg || graph?.error?.message || "Template could not be submitted to Meta.");
  return { template: { id: String(graph.id), name, language, category, status: String(graph.status || "PENDING").toUpperCase(), components } };
}
async function thread(admin: any, customer: any, body: any) {
  const conversationId = cleanUuid(body.conversationId, "conversation");
  const connection = body.connectionId ? await ownedBusinessNumber(admin, customer, body.connectionId) : null;
  let conversationQuery = admin.from("whatsapp_platform_conversations")
    .select("id,connection_id,contact_id,status,priority,assigned_user_id,unread_count,last_message_at,last_inbound_at,last_outbound_at,service_window_expires_at")
    .eq("id", conversationId).eq("tenant_id", customer.tenant_id);
  if (connection) conversationQuery = conversationQuery.eq("connection_id", connection.id);
  const { data: conversation, error } = await conversationQuery.single();
  if (error || !conversation) throw new Error("Conversation not found.");
  const [{ data: contact, error: contactError }, { data: messages, error: messagesError }, { data: notes, error: notesError }, { data: members, error: membersError }] = await Promise.all([
    admin.from("whatsapp_platform_contacts").select("id,wa_id,phone_e164,profile_name,display_name,status,last_inbound_at,last_outbound_at").eq("id", conversation.contact_id).eq("tenant_id", customer.tenant_id).single(),
    admin.from("whatsapp_platform_messages").select("id,meta_message_id,direction,message_type,body,media_id,media_mime_type,media_file_name,reply_to_meta_message_id,status,error_code,error_title,safe_metadata,provider_timestamp,created_at").eq("conversation_id", conversationId).eq("tenant_id", customer.tenant_id).order("provider_timestamp", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true }).limit(250),
    admin.from("whatsapp_platform_conversation_notes").select("id,author_user_id,body,created_at,updated_at").eq("conversation_id", conversationId).eq("tenant_id", customer.tenant_id).order("created_at", { ascending: true }).limit(100),
    admin.from("whatsapp_platform_users").select("id,display_name,email,role_code,status").eq("tenant_id", customer.tenant_id).in("status", ["active","invited"]).order("display_name", { ascending: true }).limit(250),
  ]);
  if (contactError) throw contactError; if (messagesError) throw messagesError; if (notesError) throw notesError; if (membersError) throw membersError;
  const hydratedMessages = (messages || []).map((message: any) => ({ ...message }));
  const unresolvedTemplates = hydratedMessages.filter((message: any) => message.message_type === "template" && /^Template:\s*/i.test(String(message.body || "")));
  if (unresolvedTemplates.length) {
    try {
      const { connection: templateSource, secret } = await templateConnection(admin, customer, conversation.connection_id);
      const templates = await fetchMetaTemplates(templateSource.whatsapp_business_account_id, secret.accessToken);
      unresolvedTemplates.forEach((message: any) => {
        const metadata = message.safe_metadata && typeof message.safe_metadata === "object" ? message.safe_metadata : {};
        const fallbackName = String(message.body || "").replace(/^Template:\s*/i, "").trim();
        const templateName = String(metadata.template_name || fallbackName);
        const languageCode = String(metadata.language_code || "");
        const template = templates.find((item: any) => item.name === templateName && (!languageCode || item.language === languageCode));
        const fullMessage = formatTemplateMessage(template?.components || []);
        if (fullMessage) {
          message.body = fullMessage;
          message.safe_metadata = { ...metadata, template_name: templateName, language_code: languageCode || template?.language || "" };
        }
      });
    } catch (error) {
      console.warn("Historical template preview could not be hydrated", error instanceof Error ? error.message : "Unknown error");
    }
  }
  const memberMap = new Map((members || []).map((row: any) => [row.id, row]));
  return { conversation, contact, messages: hydratedMessages, notes: (notes || []).map((row: any) => ({ ...row, author: memberMap.get(row.author_user_id) || null })), members: members || [], serviceWindowOpen: Boolean(conversation.service_window_expires_at && new Date(conversation.service_window_expires_at).getTime() > Date.now()) };
}
async function sendText(admin: any, customer: any, body: any) {
  if (!["owner","admin","agent"].includes(customer.role_code)) throw new Error("Your workspace role cannot send messages.");
  const conversationId = cleanUuid(body.conversationId, "conversation");
  const text = String(body.text || "").trim();
  if (!text || text.length > 4096) throw new Error("Message must contain between 1 and 4,096 characters.");
  const { data: conversation, error } = await admin.from("whatsapp_platform_conversations")
    .select("id,connection_id,contact_id,service_window_expires_at").eq("id", conversationId).eq("tenant_id", customer.tenant_id).single();
  if (error || !conversation) throw new Error("Conversation not found.");
  if (!conversation.service_window_expires_at || new Date(conversation.service_window_expires_at).getTime() <= Date.now()) throw new Error("The customer-service window is closed. Send an approved template to reopen the conversation.");
  const [{ data: contact, error: contactError }, { data: connection, error: connectionError }, { data: credential, error: credentialError }] = await Promise.all([
    admin.from("whatsapp_platform_contacts").select("id,wa_id,status").eq("id", conversation.contact_id).eq("tenant_id", customer.tenant_id).single(),
    admin.from("whatsapp_platform_connections").select("id,phone_number_id,status").eq("id", conversation.connection_id).eq("tenant_id", customer.tenant_id).single(),
    admin.from("whatsapp_platform_provider_credentials").select("credential_ciphertext,expires_at").eq("connection_id", conversation.connection_id).eq("tenant_id", customer.tenant_id).single(),
  ]);
  if (contactError || !contact) throw new Error("Contact not found.");
  if (contact.status !== "active") throw new Error("Messages cannot be sent to this contact.");
  if (connectionError || connection?.status !== "connected" || !connection?.phone_number_id) throw new Error("The WhatsApp connection is not ready.");
  if (credentialError || !credential) throw new Error("The WhatsApp connection credential is unavailable.");
  if (credential.expires_at && new Date(credential.expires_at).getTime() <= Date.now()) throw new Error("The WhatsApp connection has expired. Reconnect Meta Business.");
  await assertOutboundMessageCapacity(admin, customer, 1);
  const secret = await decryptCredential(credential.credential_ciphertext);
  const graphResponse = await fetch(`https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(connection.phone_number_id)}/messages`, {
    method: "POST", headers: { Authorization: `Bearer ${secret.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: contact.wa_id, type: "text", text: { preview_url: false, body: text } }),
  });
  const graph = await graphResponse.json().catch(() => ({}));
  if (!graphResponse.ok || !graph?.messages?.[0]?.id) throw new Error(graph?.error?.error_user_msg || graph?.error?.message || "Message could not be sent.");
  const now = new Date().toISOString();
  const { data: message, error: messageError } = await admin.from("whatsapp_platform_messages").insert({
    tenant_id: customer.tenant_id, conversation_id: conversation.id, connection_id: connection.id, contact_id: contact.id,
    meta_message_id: String(graph.messages[0].id), direction: "outbound", message_type: "text", body: text,
    status: "accepted", provider_timestamp: now, created_by_user_id: customer.user_id,
  }).select("id,meta_message_id,direction,message_type,body,status,provider_timestamp,created_at").single();
  if (messageError) throw messageError;
  await Promise.all([
    admin.from("whatsapp_platform_conversations").update({ status: "open", last_message_at: now, last_message_preview: text.replace(/\s+/g, " ").slice(0, 300), last_outbound_at: now, updated_at: now }).eq("id", conversation.id).eq("tenant_id", customer.tenant_id),
    admin.from("whatsapp_platform_contacts").update({ last_outbound_at: now, updated_at: now }).eq("id", contact.id).eq("tenant_id", customer.tenant_id),
  ]);
  return { message };
}
async function createContact(admin: any, customer: any, body: any) {
  if (!["owner","admin","agent"].includes(customer.role_code)) throw new Error("Your workspace role cannot add contacts.");
  const digits = String(body.phone || "").replace(/\D/g, "");
  if (!/^[1-9][0-9]{6,14}$/.test(digits)) throw new Error("Enter a valid international phone number including country code.");
  const displayName = String(body.displayName || "").trim();
  if (!displayName || displayName.length > 200) throw new Error("Contact name must contain between 1 and 200 characters.");
  const { data: existing, error: existingError } = await admin.from("whatsapp_platform_contacts")
    .select("id,wa_id,phone_e164,profile_name,display_name,status,last_inbound_at,last_outbound_at,created_at,updated_at")
    .eq("tenant_id", customer.tenant_id).eq("wa_id", digits).maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    if (body.duplicateResolution !== "replace") {
      return {
        duplicate: true,
        existingContact: existing,
        incomingContact: { wa_id: digits, phone_e164: `+${digits}`, display_name: displayName },
      };
    }
    const { data, error } = await admin.from("whatsapp_platform_contacts")
      .update({ display_name: displayName, updated_at: new Date().toISOString() })
      .eq("id", existing.id).eq("tenant_id", customer.tenant_id)
      .select("id,wa_id,phone_e164,profile_name,display_name,status,last_inbound_at,last_outbound_at,created_at,updated_at").single();
    if (error || !data) throw new Error("Contact could not be updated.");
    return { contact: data, existing: true };
  }
  const master = await requirePackageFeature(admin, customer, "contacts");
  await assertTableCapacity(admin, customer, master, "contact_limit", "whatsapp_platform_contacts");
  const { data, error } = await admin.from("whatsapp_platform_contacts").insert({
    tenant_id: customer.tenant_id, wa_id: digits, phone_e164: `+${digits}`, display_name: displayName, status: "active",
  }).select("id,wa_id,phone_e164,profile_name,display_name,status,last_inbound_at,last_outbound_at,created_at,updated_at").single();
  if (error?.code === "23505") {
    const { data: racedDuplicate } = await admin.from("whatsapp_platform_contacts")
      .select("id,wa_id,phone_e164,profile_name,display_name,status,last_inbound_at,last_outbound_at,created_at,updated_at")
      .eq("tenant_id", customer.tenant_id).eq("wa_id", digits).maybeSingle();
    if (racedDuplicate) return { duplicate: true, existingContact: racedDuplicate, incomingContact: { wa_id: digits, phone_e164: `+${digits}`, display_name: displayName } };
  }
  if (error || !data) throw new Error("Contact could not be created.");
  return { contact: data, existing: false };
}
function validatedImportRows(submitted: any[]) {
  if (!submitted.length) throw new Error("Add at least one valid contact to import.");
  if (submitted.length > 1000) throw new Error("This protected import batch is too large. Submit the import in smaller batches.");
  const unique = new Map<string, { wa_id: string; phone_e164: string; display_name: string; duplicate_resolution: string }>();
  submitted.forEach((item: any, index: number) => {
    const digits = String(item?.phone || "").replace(/\D/g, "");
    const displayName = String(item?.displayName || "").trim().replace(/\s+/g, " ");
    if (!/^[1-9][0-9]{6,14}$/.test(digits)) throw new Error(`Row ${index + 1} has an invalid international phone number.`);
    if (!displayName || displayName.length > 200) throw new Error(`Row ${index + 1} needs a contact name of up to 200 characters.`);
    unique.set(digits, { wa_id: digits, phone_e164: `+${digits}`, display_name: displayName, duplicate_resolution: item?.duplicateResolution === "replace" ? "replace" : "skip" });
  });
  return [...unique.values()];
}
async function previewContactImport(admin: any, customer: any, body: any) {
  if (!["owner","admin","agent"].includes(customer.role_code)) throw new Error("Your workspace role cannot import contacts.");
  const submitted = Array.isArray(body.contacts) ? body.contacts : [];
  const rows = validatedImportRows(submitted);
  const { data: existing, error } = await admin.from("whatsapp_platform_contacts")
    .select("id,wa_id,phone_e164,profile_name,display_name,status,created_at,updated_at")
    .eq("tenant_id", customer.tenant_id).in("wa_id", rows.map((row) => row.wa_id));
  if (error) throw error;
  return { duplicates: existing || [] };
}
async function importContacts(admin: any, customer: any, body: any) {
  if (!["owner","admin","agent"].includes(customer.role_code)) throw new Error("Your workspace role cannot import contacts.");
  const submitted = Array.isArray(body.contacts) ? body.contacts : [];
  const rows = validatedImportRows(submitted);
  const waIds = rows.map((row) => row.wa_id);
  const { data: existing, error: existingError } = await admin.from("whatsapp_platform_contacts")
    .select("id,wa_id,display_name").eq("tenant_id", customer.tenant_id).in("wa_id", waIds);
  if (existingError) throw existingError;
  const existingByWaId = new Map((existing || []).map((row: any) => [row.wa_id, row]));
  const newRows = rows.filter((row) => !existingByWaId.has(row.wa_id));
  const master = await requirePackageFeature(admin, customer, "contacts");
  const limit = packageLimit(master, "contact_limit");
  if (limit !== null) {
    const { count, error: countError } = await admin.from("whatsapp_platform_contacts")
      .select("id", { count: "exact", head: true }).eq("tenant_id", customer.tenant_id);
    if (countError) throw countError;
    const available = Math.max(0, limit - Number(count || 0));
    if (newRows.length > available) throw new Error(`This import would exceed the active package limit of ${limit.toLocaleString("en-IN")} contacts. ${available.toLocaleString("en-IN")} new contact${available === 1 ? "" : "s"} can still be added.`);
  }
  let imported = 0;
  if (newRows.length) {
    const { data: inserted, error } = await admin.from("whatsapp_platform_contacts").upsert(newRows.map((row) => ({
      tenant_id: customer.tenant_id, wa_id: row.wa_id, phone_e164: row.phone_e164, display_name: row.display_name, status: "active",
    })), { onConflict: "tenant_id,wa_id", ignoreDuplicates: true }).select("id");
    if (error) throw error;
    imported = (inserted || []).length;
  }
  let updated = 0;
  {
    const updateRows = rows.filter((row) => {
      const current = existingByWaId.get(row.wa_id);
      return current && row.duplicate_resolution === "replace" && current.display_name !== row.display_name;
    });
    for (let offset = 0; offset < updateRows.length; offset += 25) {
      const batch = updateRows.slice(offset, offset + 25);
      const results = await Promise.all(batch.map((row) => admin.from("whatsapp_platform_contacts")
        .update({ display_name: row.display_name, updated_at: new Date().toISOString() })
        .eq("id", existingByWaId.get(row.wa_id).id).eq("tenant_id", customer.tenant_id)));
      const failed = results.find((result: any) => result.error);
      if (failed?.error) throw failed.error;
      updated += batch.length;
    }
  }
  return {
    imported,
    updated,
    skipped: Math.max(0, rows.length - imported - updated),
    duplicatesInFile: submitted.length - rows.length,
    totalProcessed: submitted.length,
  };
}
async function startChat(admin: any, customer: any, body: any) {
  if (!["owner","admin","agent"].includes(customer.role_code)) throw new Error("Your workspace role cannot start conversations.");
  const contactId = cleanUuid(body.contactId, "contact");
  const connectionId = cleanUuid(body.connectionId, "connection");
  const templateName = String(body.templateName || "").trim();
  const languageCode = String(body.languageCode || "en_US").trim();
  if (!/^[a-z0-9_]{1,512}$/.test(templateName)) throw new Error("Enter the exact name of an approved WhatsApp template.");
  if (!/^[A-Za-z]{2,3}(?:_[A-Za-z]{2})?$/.test(languageCode)) throw new Error("Enter a valid template language code, such as en_US.");
  const [{ data: contact, error: contactError }, { data: connection, error: connectionError }, { data: credential, error: credentialError }] = await Promise.all([
    admin.from("whatsapp_platform_contacts").select("id,wa_id,status").eq("id", contactId).eq("tenant_id", customer.tenant_id).single(),
    admin.from("whatsapp_platform_connections").select("id,whatsapp_business_account_id,phone_number_id,status").eq("id", connectionId).eq("tenant_id", customer.tenant_id).single(),
    admin.from("whatsapp_platform_provider_credentials").select("credential_ciphertext,expires_at").eq("connection_id", connectionId).eq("tenant_id", customer.tenant_id).single(),
  ]);
  if (contactError || !contact) throw new Error("Contact not found.");
  if (contact.status !== "active") throw new Error("Messages cannot be sent to this contact.");
  if (connectionError || connection?.status !== "connected" || !connection?.phone_number_id) throw new Error("Select a connected WhatsApp business number.");
  if (credentialError || !credential) throw new Error("The WhatsApp connection credential is unavailable.");
  if (credential.expires_at && new Date(credential.expires_at).getTime() <= Date.now()) throw new Error("The WhatsApp connection has expired. Reconnect Meta Business.");
  await assertOutboundMessageCapacity(admin, customer, 1);
  let { data: conversation, error: conversationError } = await admin.from("whatsapp_platform_conversations")
    .select("id,connection_id,contact_id").eq("tenant_id", customer.tenant_id).eq("connection_id", connectionId).eq("contact_id", contactId).maybeSingle();
  if (conversationError) throw conversationError;
  let conversationCreated = false;
  if (!conversation) {
    const created = await admin.from("whatsapp_platform_conversations").insert({ tenant_id: customer.tenant_id, connection_id: connectionId, contact_id: contactId, status: "open", priority: "normal" })
      .select("id,connection_id,contact_id").single();
    if (created.error || !created.data) throw new Error("Conversation could not be created.");
    conversation = created.data;
    conversationCreated = true;
  }
  const secret = await decryptCredential(credential.credential_ciphertext);
  let templateDefinition: any = null;
  try {
    const templates = await fetchMetaTemplates(connection.whatsapp_business_account_id, secret.accessToken);
    templateDefinition = templates.find((item: any) => item.name === templateName && item.language === languageCode)
      || templates.find((item: any) => item.name === templateName);
  } catch (error) {
    console.warn("Template preview could not be loaded before sending", error instanceof Error ? error.message : "Unknown error");
  }
  const graphResponse = await fetch(`https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(connection.phone_number_id)}/messages`, {
    method: "POST", headers: { Authorization: `Bearer ${secret.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: contact.wa_id, type: "template", template: { name: templateName, language: { code: languageCode } } }),
  });
  const graph = await graphResponse.json().catch(() => ({}));
  if (!graphResponse.ok || !graph?.messages?.[0]?.id) {
    if (conversationCreated) await admin.from("whatsapp_platform_conversations").delete().eq("id", conversation.id).eq("tenant_id", customer.tenant_id);
    throw new Error(graph?.error?.error_user_msg || graph?.error?.message || "Template message could not be sent.");
  }
  const now = new Date().toISOString();
  const preview = formatTemplateMessage(templateDefinition?.components || []) || `Template: ${templateName}`;
  const { data: message, error: messageError } = await admin.from("whatsapp_platform_messages").insert({
    tenant_id: customer.tenant_id, conversation_id: conversation.id, connection_id: connection.id, contact_id: contact.id,
    meta_message_id: String(graph.messages[0].id), direction: "outbound", message_type: "template", body: preview,
    status: "accepted", provider_timestamp: now, created_by_user_id: customer.user_id,
    safe_metadata: { template_name: templateName, language_code: languageCode },
  }).select("id,meta_message_id,direction,message_type,body,status,safe_metadata,provider_timestamp,created_at").single();
  if (messageError) throw messageError;
  await Promise.all([
    admin.from("whatsapp_platform_conversations").update({ status: "open", last_message_at: now, last_message_preview: preview.replace(/\s+/g, " ").slice(0, 300), last_outbound_at: now, updated_at: now }).eq("id", conversation.id).eq("tenant_id", customer.tenant_id),
    admin.from("whatsapp_platform_contacts").update({ last_outbound_at: now, updated_at: now }).eq("id", contact.id).eq("tenant_id", customer.tenant_id),
  ]);
  return { conversationId: conversation.id, message };
}
async function updateConversation(admin: any, customer: any, body: any) {
  if (!["owner","admin","agent"].includes(customer.role_code)) throw new Error("Your workspace role cannot update conversations.");
  const conversationId = cleanUuid(body.conversationId, "conversation");
  const updates: any = { updated_at: new Date().toISOString() };
  if (body.markRead === true) updates.unread_count = 0;
  if (body.status !== undefined) {
    const value = String(body.status);
    if (!["open","pending","resolved"].includes(value)) throw new Error("Invalid conversation status.");
    updates.status = value;
  }
  if (body.priority !== undefined) {
    const value = String(body.priority);
    if (!["low","normal","high","urgent"].includes(value)) throw new Error("Invalid conversation priority.");
    updates.priority = value;
  }
  if (body.assignedUserId !== undefined) {
    const assignedUserId = body.assignedUserId === null || body.assignedUserId === "" ? null : cleanUuid(body.assignedUserId, "assignee");
    if (!["owner","admin"].includes(customer.role_code) && assignedUserId !== customer.user_id) throw new Error("Your workspace role cannot assign this conversation.");
    if (assignedUserId) {
      const { data: member, error: memberError } = await admin.from("whatsapp_platform_users").select("id").eq("id", assignedUserId).eq("tenant_id", customer.tenant_id).eq("status", "active").maybeSingle();
      if (memberError || !member) throw new Error("Assignee is not an active workspace member.");
    }
    updates.assigned_user_id = assignedUserId;
  }
  const { data, error } = await admin.from("whatsapp_platform_conversations").update(updates)
    .eq("id", conversationId).eq("tenant_id", customer.tenant_id).select("id,status,priority,assigned_user_id,unread_count,updated_at").single();
  if (error || !data) throw new Error("Conversation could not be updated.");
  return { conversation: data };
}
async function addNote(admin: any, customer: any, body: any) {
  if (!["owner","admin","agent"].includes(customer.role_code)) throw new Error("Your workspace role cannot add notes.");
  const conversationId = cleanUuid(body.conversationId, "conversation");
  const noteBody = String(body.body || "").trim();
  if (!noteBody || noteBody.length > 4000) throw new Error("Note must contain between 1 and 4,000 characters.");
  const { data: conversation, error: conversationError } = await admin.from("whatsapp_platform_conversations").select("id").eq("id", conversationId).eq("tenant_id", customer.tenant_id).maybeSingle();
  if (conversationError || !conversation) throw new Error("Conversation not found.");
  const { data, error } = await admin.from("whatsapp_platform_conversation_notes").insert({ tenant_id: customer.tenant_id, conversation_id: conversationId, author_user_id: customer.user_id, body: noteBody }).select("id,author_user_id,body,created_at,updated_at").single();
  if (error) throw error;
  return { note: data };
}
async function updateContact(admin: any, customer: any, body: any) {
  if (!["owner","admin","agent"].includes(customer.role_code)) throw new Error("Your workspace role cannot update contacts.");
  const contactId = cleanUuid(body.contactId, "contact");
  const { data: current, error: currentError } = await admin.from("whatsapp_platform_contacts")
    .select("id,contact_category,marketing_opt_in_at,marketing_opt_out_at")
    .eq("id", contactId).eq("tenant_id", customer.tenant_id).maybeSingle();
  if (currentError || !current) throw new Error("Contact not found.");
  const updates: any = { updated_at: new Date().toISOString() };
  if (body.displayName !== undefined) {
    const displayName = String(body.displayName || "").trim();
    if (displayName.length > 200) throw new Error("Contact name is too long.");
    updates.display_name = displayName || null;
  }
  if (body.status !== undefined) {
    if (!["owner","admin"].includes(customer.role_code)) throw new Error("Only workspace administrators can change contact messaging status.");
    const status = String(body.status);
    if (!["active","blocked"].includes(status)) throw new Error("Invalid contact status.");
    updates.status = status;
  }
  if (body.contactCategory !== undefined) {
    const category = String(body.contactCategory || "uncategorized");
    if (!["uncategorized","lead","prospect","customer","partner","vendor","other"].includes(category)) throw new Error("Select a valid contact category.");
    updates.contact_category = category;
  }
  let consentEventType = "";
  if (body.marketingConsent !== undefined) {
    const consent = String(body.marketingConsent || "unknown");
    const sources = new Set(["website","form","qr_code","keyword","inbound_request","imported_proof","manual_record","api"]);
    if (!['unknown','opted_in','opted_out'].includes(consent)) throw new Error("Select a valid marketing consent state.");
    if (consent === "opted_in") {
      const source = String(body.marketingOptInSource || "manual_record");
      if (!sources.has(source)) throw new Error("Select a valid marketing consent source.");
      updates.marketing_opt_in_at = new Date().toISOString();
      updates.marketing_opt_in_source = source;
      updates.marketing_opt_out_at = null;
      if (!current.marketing_opt_in_at || current.marketing_opt_out_at) consentEventType = "opt_in";
    } else if (consent === "opted_out") {
      updates.marketing_opt_out_at = new Date().toISOString();
      if (!current.marketing_opt_out_at) consentEventType = "opt_out";
    } else {
      updates.marketing_opt_in_at = null;
      updates.marketing_opt_in_source = null;
      updates.marketing_opt_out_at = null;
    }
  }
  const { data, error } = await admin.from("whatsapp_platform_contacts").update(updates).eq("id", contactId).eq("tenant_id", customer.tenant_id).select("id,display_name,status,contact_category,marketing_opt_in_at,marketing_opt_in_source,marketing_opt_out_at,updated_at").single();
  if (error || !data) throw new Error("Contact could not be updated.");
  if (consentEventType) {
    const { error: eventError } = await admin.from("whatsapp_platform_marketing_consent_events").insert({
      tenant_id: customer.tenant_id, connection_id: null, contact_id: contactId,
      event_type: consentEventType, source: "manual", keyword: null,
      confirmation_status: "recorded", occurred_at: new Date().toISOString(),
    });
    if (eventError) throw new Error("Contact was updated, but the consent audit event could not be recorded.");
  }
  return { contact: data };
}
async function deleteContacts(admin: any, customer: any, body: any) {
  if (!["owner", "admin"].includes(customer.role_code)) throw new Error("Only workspace administrators can delete contacts.");
  if (body.allMatching === true) {
    const { data, error } = await admin.from("whatsapp_platform_contacts").delete().eq("tenant_id", customer.tenant_id).select("id");
    if (error) throw error;
    return { deletedCount: (data || []).length };
  }
  const requested = Array.isArray(body.contactIds) ? body.contactIds : body.contactId ? [body.contactId] : [];
  const ids = [...new Set(requested.map((id: unknown) => cleanUuid(id, "contact")))];
  if (!ids.length) throw new Error("Select at least one contact to delete.");
  if (ids.length > 500) throw new Error("Delete up to 500 contacts at a time.");
  const { data, error } = await admin.from("whatsapp_platform_contacts")
    .delete().eq("tenant_id", customer.tenant_id).in("id", ids).select("id");
  if (error) throw error;
  return { deletedCount: (data || []).length };
}

async function listFlows(admin: any, customer: any, body: any) {
  const connection = await ownedBusinessNumber(admin, customer, body.connectionId);
  const { data, error } = await admin.from("whatsapp_platform_flows")
    .select("id,connection_id,name,description,status,trigger_type,trigger_config,nodes,edges,version,created_at,updated_at")
    .eq("tenant_id", customer.tenant_id).eq("connection_id", connection.id).order("updated_at", { ascending: false }).limit(200);
  if (error) throw error;
  return { flows: data || [] };
}

function validatedFlow(body: any) {
  const name = String(body.name || "").trim();
  const description = String(body.description || "").trim();
  const status = String(body.status || "draft").trim().toLowerCase();
  const triggerType = String(body.triggerType || "keyword").trim().toLowerCase();
  const triggerConfig = body.triggerConfig && typeof body.triggerConfig === "object" && !Array.isArray(body.triggerConfig) ? body.triggerConfig : {};
  const nodes = Array.isArray(body.nodes) ? body.nodes : [];
  const edges = Array.isArray(body.edges) ? body.edges : [];
  if (!name || name.length > 120) throw new Error("Flow name must contain between 1 and 120 characters.");
  if (description.length > 500) throw new Error("Flow description cannot exceed 500 characters.");
  if (!["draft","active","paused"].includes(status)) throw new Error("Select a valid flow status.");
  if (!["keyword","any_message","template_reply","manual","webhook"].includes(triggerType)) throw new Error("Select a valid flow trigger.");
  if (!nodes.length || nodes.length > 100) throw new Error("A flow must contain between 1 and 100 blocks.");
  if (status === "active" && nodes.length < 2) throw new Error("Add at least one action before activating this flow.");
  const ids = new Set<string>();
  const cleanNodes = nodes.map((node: any, index: number) => {
    const id = String(node?.id || "").trim(); const type = String(node?.type || "").trim().toLowerCase();
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(id) || ids.has(id)) throw new Error(`Flow block ${index + 1} has an invalid identifier.`);
    ids.add(id);
    if (!["start","message","media","list","catalog","single_product","multi_product","template","question","address","location","ask_media","condition","api","attribute","tag","handoff","connect","delay","end"].includes(type)) throw new Error(`Flow block ${index + 1} has an unsupported type.`);
    const title = String(node?.title || "").trim().slice(0, 80); const content = String(node?.body || "").trim().slice(0, 2048);
    const x = Math.max(0, Math.min(10000, Number(node?.x) || 0)); const y = Math.max(0, Math.min(10000, Number(node?.y) || 0));
    const config = node?.config && typeof node.config === "object" && !Array.isArray(node.config) ? node.config : {};
    if (type === "api" && config.endpoint && !/^https:\/\/[^\s]+$/i.test(String(config.endpoint))) throw new Error("API request blocks require a valid HTTPS endpoint.");
    return { id, type, title: title || "Untitled block", body: content, x, y, config };
  });
  if (cleanNodes.filter((node: any) => node.type === "start").length !== 1) throw new Error("Every flow must contain exactly one Flow start block.");
  const cleanEdges = edges.slice(0, 200).map((edge: any) => {
    const from = String(edge?.from || ""); const to = String(edge?.to || "");
    if (!ids.has(from) || !ids.has(to) || from === to) throw new Error("A flow connection references an invalid block.");
    return { id: String(edge?.id || `${from}:${to}`).slice(0, 180), from, to };
  });
  if (new TextEncoder().encode(JSON.stringify({ triggerConfig, nodes: cleanNodes, edges: cleanEdges })).byteLength > 150000) throw new Error("Flow definition is too large.");
  return { name, description: description || null, status, trigger_type: triggerType, trigger_config: triggerConfig, nodes: cleanNodes, edges: cleanEdges };
}

async function saveFlow(admin: any, customer: any, body: any) {
  if (!["owner","admin"].includes(customer.role_code)) throw new Error("Only workspace administrators can create or edit flows.");
  const connection = await ownedBusinessNumber(admin, customer, body.connectionId);
  const values = validatedFlow(body); const now = new Date().toISOString();
  if (body.flowId) {
    const flowId = cleanUuid(body.flowId, "flow");
    const { data, error } = await admin.from("whatsapp_platform_flows").update({ ...values, updated_by_user_id: customer.user_id, updated_at: now })
      .eq("id", flowId).eq("tenant_id", customer.tenant_id).eq("connection_id", connection.id)
      .select("id,connection_id,name,description,status,trigger_type,trigger_config,nodes,edges,version,created_at,updated_at").single();
    if (error || !data) throw new Error(error?.code === "23505" ? "A flow with this name already exists." : "Flow could not be updated.");
    return { flow: data };
  }
  const master = await requirePackageFeature(admin, customer, "flows");
  await assertTableCapacity(admin, customer, master, "flow_limit", "whatsapp_platform_flows", { connection_id: connection.id });
  const { data, error } = await admin.from("whatsapp_platform_flows").insert({ ...values, tenant_id: customer.tenant_id, connection_id: connection.id, created_by_user_id: customer.user_id, updated_by_user_id: customer.user_id })
    .select("id,connection_id,name,description,status,trigger_type,trigger_config,nodes,edges,version,created_at,updated_at").single();
  if (error || !data) throw new Error(error?.code === "23505" ? "A flow with this name already exists." : "Flow could not be created.");
  return { flow: data };
}

async function setFlowStatus(admin: any, customer: any, body: any) {
  if (!["owner","admin"].includes(customer.role_code)) throw new Error("Only workspace administrators can activate or pause flows.");
  const connection = await ownedBusinessNumber(admin, customer, body.connectionId);
  const flowId = cleanUuid(body.flowId, "flow"); const status = String(body.status || "").toLowerCase();
  if (!["active","paused"].includes(status)) throw new Error("Select a valid flow status.");
  const { data: current, error: currentError } = await admin.from("whatsapp_platform_flows").select("id,nodes").eq("id", flowId).eq("tenant_id", customer.tenant_id).eq("connection_id", connection.id).single();
  if (currentError || !current) throw new Error("Flow not found.");
  if (status === "active" && (!Array.isArray(current.nodes) || current.nodes.length < 2)) throw new Error("Add at least one action before activating this flow.");
  const { data, error } = await admin.from("whatsapp_platform_flows").update({ status, updated_by_user_id: customer.user_id, updated_at: new Date().toISOString() }).eq("id", flowId).eq("tenant_id", customer.tenant_id).eq("connection_id", connection.id).select("id,status,updated_at").single();
  if (error || !data) throw new Error("Flow status could not be updated.");
  return { flow: data };
}

async function deleteFlow(admin: any, customer: any, body: any) {
  if (!["owner","admin"].includes(customer.role_code)) throw new Error("Only workspace administrators can delete flows.");
  const connection = await ownedBusinessNumber(admin, customer, body.connectionId);
  const flowId = cleanUuid(body.flowId, "flow");
  const { data, error } = await admin.from("whatsapp_platform_flows").delete().eq("id", flowId).eq("tenant_id", customer.tenant_id).eq("connection_id", connection.id).select("id").single();
  if (error || !data) throw new Error("Flow not found.");
  return { deleted: true, flowId };
}

const CAMPAIGN_STATUSES = new Set(["draft","review","approved","rejected","paused"]);
const CAMPAIGN_TYPES = new Set(["announcement","reminder","follow_up","offer","reactivation"]);
const CAMPAIGN_AUDIENCES = new Set(["marketing_opt_in","recent_contact","recent_message","country_code","name_contains","manual","custom_segment"]);
const CAMPAIGN_SEGMENT_RULES = new Set(["marketing_opt_in","recent_contact","recent_message","country_code","name_contains","manual"]);

function campaignRow(row: any) {
  return {
    id: row.id,
    connectionId: row.connection_id,
    name: row.name,
    type: row.campaign_type,
    objective: row.objective || "",
    owner: row.owner_name || "",
    audience: row.audience_type === "custom_segment" ? row.audience_segment_id : row.audience_type,
    audienceType: row.audience_type,
    audienceSegmentId: row.audience_segment_id || "",
    audienceLabel: row.audience_label || "Campaign audience",
    estimatedAudience: Number(row.estimated_audience || 0),
    templateKey: `${row.template_name}|${row.template_language}`,
    templateName: row.template_name,
    templateLanguage: row.template_language,
    previewBody: row.preview_body || "",
    status: row.status,
    scheduledAt: row.scheduled_at || "",
    timezone: row.timezone,
    sendWindowStart: String(row.send_window_start || "09:00").slice(0, 5),
    sendWindowEnd: String(row.send_window_end || "18:00").slice(0, 5),
    optInConfirmed: Boolean(row.opt_in_confirmed),
    policyConfirmed: Boolean(row.policy_confirmed),
    approvalLog: Array.isArray(row.approval_log) ? row.approval_log : [],
    recipientCount: Number(row.recipient_count || 0),
    acceptedCount: Number(row.accepted_count || 0),
    deliveredCount: Number(row.delivered_count || 0),
    readCount: Number(row.read_count || 0),
    failedCount: Number(row.failed_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function campaignSegmentRow(row: any) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || "Custom campaign audience.",
    rule: row.rule_type,
    ruleValue: row.rule_value || "",
    count: Number(row.manual_count || 0),
    system: false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function countCampaignAudience(admin: any, customer: any, rule: string, ruleValue = "", manualCount = 0) {
  if (rule === "manual") return Math.max(0, Math.min(1000000, Number(manualCount) || 0));
  let query = admin.from("whatsapp_platform_contacts").select("id", { count: "exact", head: true })
    .eq("tenant_id", customer.tenant_id).eq("status", "active")
    .not("marketing_opt_in_at", "is", null).is("marketing_opt_out_at", null);
  const recentCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  if (rule === "recent_contact") query = query.gte("created_at", recentCutoff);
  if (rule === "recent_message") query = query.gte("last_inbound_at", recentCutoff);
  if (rule === "country_code") query = query.like("phone_e164", `${String(ruleValue).replace(/[^+0-9]/g, "")}%`);
  if (rule === "name_contains") query = query.or(`display_name.ilike.%${String(ruleValue).replace(/[%_,()]/g, "")}%,profile_name.ilike.%${String(ruleValue).replace(/[%_,()]/g, "")}%`);
  const { count, error } = await query;
  if (error) throw error;
  return Number(count || 0);
}

async function listCampaignSegments(admin: any, customer: any, body: any) {
  const connection = await ownedBusinessNumber(admin, customer, body.connectionId);
  const { data, error } = await admin.from("whatsapp_platform_campaign_segments")
    .select("id,name,description,rule_type,rule_value,manual_count,created_at,updated_at")
    .eq("tenant_id", customer.tenant_id).eq("connection_id", connection.id)
    .order("updated_at", { ascending: false }).limit(200);
  if (error) throw error;
  const segments = await Promise.all((data || []).map(async (row: any) => ({
    ...campaignSegmentRow(row),
    count: await countCampaignAudience(admin, customer, row.rule_type, row.rule_value, row.manual_count),
  })));
  return { segments };
}

async function saveCampaignSegment(admin: any, customer: any, body: any) {
  if (!["owner","admin"].includes(customer.role_code)) throw new Error("Only workspace administrators can manage campaign segments.");
  const connection = await ownedBusinessNumber(admin, customer, body.connectionId);
  const name = cleanText(body.name, 120);
  const description = cleanText(body.description, 500);
  const rule = String(body.rule || "marketing_opt_in");
  const ruleValue = cleanText(body.ruleValue, 200);
  const manualCount = Math.max(0, Math.min(1000000, Number(body.count) || 0));
  if (!name) throw new Error("Enter a segment name.");
  if (!CAMPAIGN_SEGMENT_RULES.has(rule)) throw new Error("Select a valid segment rule.");
  if (["country_code","name_contains"].includes(rule) && !ruleValue) throw new Error("Enter the value used by this segment rule.");
  const values = { name, description: description || null, rule_type: rule, rule_value: ruleValue || null, manual_count: manualCount, updated_at: new Date().toISOString() };
  let result: any;
  if (body.segmentId) {
    const segmentId = cleanUuid(body.segmentId, "campaign segment");
    result = await admin.from("whatsapp_platform_campaign_segments").update(values)
      .eq("id", segmentId).eq("tenant_id", customer.tenant_id).eq("connection_id", connection.id)
      .select("id,name,description,rule_type,rule_value,manual_count,created_at,updated_at").single();
  } else {
    result = await admin.from("whatsapp_platform_campaign_segments").insert({ ...values, tenant_id: customer.tenant_id, connection_id: connection.id, created_by_user_id: customer.user_id })
      .select("id,name,description,rule_type,rule_value,manual_count,created_at,updated_at").single();
  }
  if (result.error || !result.data) throw new Error(result.error?.code === "23505" ? "A segment with this name already exists." : "Campaign segment could not be saved.");
  return { segment: { ...campaignSegmentRow(result.data), count: await countCampaignAudience(admin, customer, rule, ruleValue, manualCount) } };
}

async function deleteCampaignSegment(admin: any, customer: any, body: any) {
  if (!["owner","admin"].includes(customer.role_code)) throw new Error("Only workspace administrators can delete campaign segments.");
  const connection = await ownedBusinessNumber(admin, customer, body.connectionId);
  const segmentId = cleanUuid(body.segmentId, "campaign segment");
  const { data, error } = await admin.from("whatsapp_platform_campaign_segments").delete()
    .eq("id", segmentId).eq("tenant_id", customer.tenant_id).eq("connection_id", connection.id).select("id").single();
  if (error || !data) throw new Error(error?.code === "23503" ? "This segment is used by a campaign and cannot be deleted." : "Campaign segment not found.");
  return { deleted: true, segmentId };
}

async function listCampaigns(admin: any, customer: any, body: any) {
  const connection = await ownedBusinessNumber(admin, customer, body.connectionId);
  const { data, error } = await admin.from("whatsapp_platform_campaigns")
    .select("id,connection_id,name,campaign_type,objective,owner_name,audience_type,audience_segment_id,audience_label,estimated_audience,template_name,template_language,preview_body,status,scheduled_at,timezone,send_window_start,send_window_end,opt_in_confirmed,policy_confirmed,approval_log,recipient_count,accepted_count,delivered_count,read_count,failed_count,created_at,updated_at")
    .eq("tenant_id", customer.tenant_id).eq("connection_id", connection.id)
    .order("updated_at", { ascending: false }).limit(200);
  if (error) throw error;
  return { campaigns: (data || []).map(campaignRow) };
}

async function campaignAudienceContacts(admin: any, customer: any, campaign: any) {
  let rule = campaign.audience_type;
  let ruleValue = "";
  if (rule === "custom_segment") {
    const { data: segment, error } = await admin.from("whatsapp_platform_campaign_segments")
      .select("rule_type,rule_value").eq("id", campaign.audience_segment_id)
      .eq("tenant_id", customer.tenant_id).eq("connection_id", campaign.connection_id).single();
    if (error || !segment) throw new Error("Campaign segment not found.");
    rule = segment.rule_type;
    ruleValue = segment.rule_value || "";
  }
  if (rule === "manual") throw new Error("Manual-count segments cannot be delivered because they do not identify recipients. Choose a consent-backed contact segment.");
  let query = admin.from("whatsapp_platform_contacts").select("id,wa_id,status")
    .eq("tenant_id", customer.tenant_id).eq("status", "active")
    .not("marketing_opt_in_at", "is", null).is("marketing_opt_out_at", null).limit(10000);
  const recentCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  if (rule === "recent_contact") query = query.gte("created_at", recentCutoff);
  if (rule === "recent_message") query = query.gte("last_inbound_at", recentCutoff);
  if (rule === "country_code") query = query.like("phone_e164", `${String(ruleValue).replace(/[^+0-9]/g, "")}%`);
  if (rule === "name_contains") {
    const safe = String(ruleValue).replace(/[%_,()]/g, "");
    query = query.or(`display_name.ilike.%${safe}%,profile_name.ilike.%${safe}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function dispatchCampaign(admin: any, customer: any, body: any) {
  if (!["owner","admin"].includes(customer.role_code)) throw new Error("Only workspace administrators can deliver campaigns.");
  const connection = await ownedBusinessNumber(admin, customer, body.connectionId);
  const campaignId = cleanUuid(body.campaignId, "campaign");
  const { data: campaign, error: campaignError } = await admin.from("whatsapp_platform_campaigns").select("*")
    .eq("id", campaignId).eq("tenant_id", customer.tenant_id).eq("connection_id", connection.id).single();
  if (campaignError || !campaign) throw new Error("Campaign not found.");
  if (!["approved","scheduled","sending"].includes(campaign.status)) throw new Error("Approve the campaign before starting delivery.");
  if (campaign.scheduled_at && new Date(campaign.scheduled_at).getTime() > Date.now()) {
    await admin.from("whatsapp_platform_campaigns").update({ status: "scheduled", updated_at: new Date().toISOString() }).eq("id", campaign.id);
    throw new Error(`This campaign is scheduled for ${new Date(campaign.scheduled_at).toLocaleString("en-IN")}. Delivery cannot start early.`);
  }
  if (!campaign.opt_in_confirmed || !campaign.policy_confirmed) throw new Error("Campaign consent and policy confirmations are required.");
  const contacts = await campaignAudienceContacts(admin, customer, campaign);
  if (!contacts.length) throw new Error("No explicitly opted-in contacts currently match this campaign audience.");
  const rows = contacts.map((contact: any) => ({ tenant_id: customer.tenant_id, campaign_id: campaign.id, connection_id: connection.id, contact_id: contact.id, status: "queued" }));
  const queued = await admin.from("whatsapp_platform_campaign_deliveries").upsert(rows, { onConflict: "campaign_id,contact_id", ignoreDuplicates: true });
  if (queued.error) throw queued.error;
  const { data: pending, error: pendingError } = await admin.from("whatsapp_platform_campaign_deliveries")
    .select("id,contact_id,attempt_count").eq("campaign_id", campaign.id).in("status", ["queued","failed"]).lt("attempt_count", 3).order("queued_at").limit(20);
  if (pendingError) throw pendingError;
  await assertOutboundMessageCapacity(admin, customer, (pending || []).length);
  const credentialResult = await admin.from("whatsapp_platform_provider_credentials").select("credential_ciphertext,expires_at")
    .eq("connection_id", connection.id).eq("tenant_id", customer.tenant_id).single();
  if (credentialResult.error || !credentialResult.data) throw new Error("The WhatsApp connection credential is unavailable.");
  if (credentialResult.data.expires_at && new Date(credentialResult.data.expires_at).getTime() <= Date.now()) throw new Error("The WhatsApp connection has expired. Reconnect Meta Business.");
  const secret = await decryptCredential(credentialResult.data.credential_ciphertext);
  const contactMap = new Map(contacts.map((contact: any) => [contact.id, contact]));
  await admin.from("whatsapp_platform_campaigns").update({ status: "sending", started_at: campaign.started_at || new Date().toISOString(), recipient_count: contacts.length, updated_at: new Date().toISOString() }).eq("id", campaign.id);
  await Promise.all((pending || []).map(async (delivery: any) => {
    const contact: any = contactMap.get(delivery.contact_id);
    if (!contact) {
      await admin.from("whatsapp_platform_campaign_deliveries").update({ status: "skipped", last_error_code: "marketing_ineligible", last_error_message: "Contact is no longer eligible for marketing messages.", updated_at: new Date().toISOString() }).eq("id", delivery.id).in("status", ["queued", "failed"]);
      return;
    }
    const claim = await admin.from("whatsapp_platform_campaign_deliveries").update({ status: "processing", attempt_count: Number(delivery.attempt_count || 0) + 1, updated_at: new Date().toISOString() }).eq("id", delivery.id).in("status", ["queued", "failed"]).select("id").maybeSingle();
    if (claim.error) throw claim.error;
    if (!claim.data) return;
    try {
      let { data: conversation } = await admin.from("whatsapp_platform_conversations").select("id").eq("tenant_id", customer.tenant_id).eq("connection_id", connection.id).eq("contact_id", contact.id).maybeSingle();
      if (!conversation) {
        const created = await admin.from("whatsapp_platform_conversations").insert({ tenant_id: customer.tenant_id, connection_id: connection.id, contact_id: contact.id, status: "open" }).select("id").single();
        if (created.error || !created.data) throw created.error || new Error("Conversation could not be created.");
        conversation = created.data;
      }
      const { data: eligibleContact, error: eligibilityError } = await admin.from("whatsapp_platform_contacts")
        .select("id").eq("id", contact.id).eq("tenant_id", customer.tenant_id).eq("status", "active")
        .not("marketing_opt_in_at", "is", null).is("marketing_opt_out_at", null).maybeSingle();
      if (eligibilityError) throw eligibilityError;
      if (!eligibleContact) {
        await admin.from("whatsapp_platform_campaign_deliveries").update({ status: "skipped", last_error_code: "marketing_opt_out", last_error_message: "Customer opted out before campaign delivery.", updated_at: new Date().toISOString() }).eq("id", delivery.id);
        return;
      }
      const graphResponse = await fetch(`https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(connection.phone_number_id)}/messages`, {
        method: "POST", headers: { Authorization: `Bearer ${secret.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: contact.wa_id, type: "template", template: { name: campaign.template_name, language: { code: campaign.template_language } } }),
      });
      const graph = await graphResponse.json().catch(() => ({}));
      if (!graphResponse.ok || !graph?.messages?.[0]?.id) throw new Error(graph?.error?.error_user_msg || graph?.error?.message || "Meta rejected the campaign message.");
      const now = new Date().toISOString();
      const messageResult = await admin.from("whatsapp_platform_messages").insert({
        tenant_id: customer.tenant_id, conversation_id: conversation.id, connection_id: connection.id, contact_id: contact.id,
        meta_message_id: String(graph.messages[0].id), direction: "outbound", message_type: "template", body: campaign.preview_body || `Template: ${campaign.template_name}`,
        status: "accepted", provider_timestamp: now, created_by_user_id: customer.user_id,
        safe_metadata: { template_name: campaign.template_name, language_code: campaign.template_language, campaign_id: campaign.id },
      }).select("id").single();
      if (messageResult.error || !messageResult.data) throw messageResult.error || new Error("Campaign message audit failed.");
      await Promise.all([
        admin.from("whatsapp_platform_campaign_deliveries").update({ conversation_id: conversation.id, message_id: messageResult.data.id, meta_message_id: String(graph.messages[0].id), status: "accepted", accepted_at: now, last_error_code: null, last_error_message: null, updated_at: now }).eq("id", delivery.id),
        admin.from("whatsapp_platform_conversations").update({ status: "open", last_message_at: now, last_message_preview: String(campaign.preview_body || `Template: ${campaign.template_name}`).replace(/\s+/g, " ").slice(0, 300), last_outbound_at: now, updated_at: now }).eq("id", conversation.id),
        admin.from("whatsapp_platform_contacts").update({ last_outbound_at: now, updated_at: now }).eq("id", contact.id),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Campaign message failed.";
      await admin.from("whatsapp_platform_campaign_deliveries").update({ status: "failed", failed_at: new Date().toISOString(), last_error_code: "send_failed", last_error_message: message.slice(0, 1000), updated_at: new Date().toISOString() }).eq("id", delivery.id);
    }
  }));
  const [{ count: remaining }, { count: accepted }, { count: failed }] = await Promise.all([
    admin.from("whatsapp_platform_campaign_deliveries").select("id", { count: "exact", head: true }).eq("campaign_id", campaign.id).in("status", ["queued","processing"]),
    admin.from("whatsapp_platform_campaign_deliveries").select("id", { count: "exact", head: true }).eq("campaign_id", campaign.id).in("status", ["accepted","sent","delivered","read"]),
    admin.from("whatsapp_platform_campaign_deliveries").select("id", { count: "exact", head: true }).eq("campaign_id", campaign.id).eq("status", "failed"),
  ]);
  const status = Number(remaining || 0) > 0 || Number(accepted || 0) > 0 ? "sending" : "failed";
  const result = await admin.from("whatsapp_platform_campaigns").update({ status, accepted_count: Number(accepted || 0), failed_count: Number(failed || 0), completed_at: status === "failed" ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq("id", campaign.id).select("*").single();
  if (result.error || !result.data) throw new Error("Campaign delivery state could not be updated.");
  return { campaign: campaignRow(result.data), batch: { attempted: (pending || []).length, remaining: Number(remaining || 0), accepted: Number(accepted || 0), failed: Number(failed || 0) } };
}

async function saveCampaign(admin: any, customer: any, body: any) {
  if (!["owner","admin","agent"].includes(customer.role_code)) throw new Error("Your workspace role cannot save campaign drafts.");
  const connection = await ownedBusinessNumber(admin, customer, body.connectionId);
  const master = await requirePackageFeature(admin, customer, "campaigns");
  const name = cleanText(body.name, 160);
  const type = String(body.type || "announcement");
  const objective = String(body.objective || "").trim().slice(0, 1000);
  const owner = cleanText(body.owner, 200);
  const status = String(body.status || "draft");
  const templateName = String(body.templateName || "").trim();
  const templateLanguage = String(body.templateLanguage || "").trim();
  const previewBody = String(body.previewBody || "").trim().slice(0, 10000);
  const timezone = cleanText(body.timezone || "Asia/Kolkata", 80);
  const sendWindowStart = String(body.sendWindowStart || "09:00").slice(0, 5);
  const sendWindowEnd = String(body.sendWindowEnd || "18:00").slice(0, 5);
  if (!name) throw new Error("Enter a campaign name.");
  if (!CAMPAIGN_TYPES.has(type)) throw new Error("Select a valid campaign type.");
  if (!CAMPAIGN_STATUSES.has(status)) throw new Error("Select a valid campaign status.");
  if (customer.role_code === "agent" && !["draft","review"].includes(status)) throw new Error("Agents can prepare drafts and submit them for review, but cannot approve campaigns.");
  if (!/^[a-z0-9_]{1,512}$/.test(templateName) || !/^[A-Za-z]{2,3}(?:_[A-Za-z]{2})?$/.test(templateLanguage)) throw new Error("Choose an approved message template.");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(sendWindowStart) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(sendWindowEnd) || sendWindowStart >= sendWindowEnd) throw new Error("Choose a valid campaign delivery window.");
  let audienceType = String(body.audienceType || body.audience || "marketing_opt_in");
  let audienceSegmentId: string | null = null;
  let rule = audienceType;
  let ruleValue = cleanText(body.ruleValue, 200);
  let manualCount = Math.max(0, Number(body.manualCount) || 0);
  if (!CAMPAIGN_AUDIENCES.has(audienceType)) {
    audienceSegmentId = cleanUuid(body.audienceSegmentId || body.audience, "campaign segment");
    audienceType = "custom_segment";
  }
  if (audienceType === "custom_segment") {
    audienceSegmentId = cleanUuid(body.audienceSegmentId || body.audience, "campaign segment");
    const { data: segment, error: segmentError } = await admin.from("whatsapp_platform_campaign_segments")
      .select("id,name,rule_type,rule_value,manual_count").eq("id", audienceSegmentId)
      .eq("tenant_id", customer.tenant_id).eq("connection_id", connection.id).single();
    if (segmentError || !segment) throw new Error("Campaign segment not found.");
    rule = segment.rule_type; ruleValue = segment.rule_value || ""; manualCount = Number(segment.manual_count || 0);
  }
  const estimatedAudience = await countCampaignAudience(admin, customer, rule, ruleValue, manualCount);
  const scheduledAt = body.scheduledAt ? new Date(String(body.scheduledAt)).toISOString() : null;
  if (scheduledAt && new Date(scheduledAt).getTime() <= Date.now()) throw new Error("Choose a campaign schedule in the future.");
  const now = new Date().toISOString();
  const values: any = {
    name, campaign_type: type, objective: objective || null, owner_name: owner || null,
    audience_type: audienceType, audience_segment_id: audienceSegmentId,
    audience_label: cleanText(body.audienceLabel || "Campaign audience", 160), estimated_audience: estimatedAudience,
    template_name: templateName, template_language: templateLanguage, preview_body: previewBody || null,
    status, scheduled_at: scheduledAt, timezone, send_window_start: sendWindowStart, send_window_end: sendWindowEnd,
    opt_in_confirmed: body.confirmOptIn === true, policy_confirmed: body.confirmPolicy === true,
    approval_log: Array.isArray(body.approvalLog) ? body.approvalLog.slice(0, 200) : [],
    updated_by_user_id: customer.user_id, updated_at: now,
  };
  let result: any;
  if (body.campaignId) {
    const campaignId = cleanUuid(body.campaignId, "campaign");
    result = await admin.from("whatsapp_platform_campaigns").update(values)
      .eq("id", campaignId).eq("tenant_id", customer.tenant_id).eq("connection_id", connection.id)
      .select("*").single();
  } else {
    const includedLimit = master?.package?.campaign_limit;
    const additionalLimit = (master?.addons || []).reduce((total: number, addon: any) => total + Number(addon?.entitlement_effects?.campaign_limit || 0) * Number(addon?.quantity || 0), 0);
    const campaignLimit = includedLimit === null || includedLimit === undefined ? null : Number(includedLimit || 0) + additionalLimit;
    if (campaignLimit !== null) {
      const { count, error: countError } = await admin.from("whatsapp_platform_campaigns").select("id", { count: "exact", head: true })
        .eq("tenant_id", customer.tenant_id).eq("connection_id", connection.id).not("status", "in", '(completed,cancelled)');
      if (countError) throw countError;
      if (Number(count || 0) >= campaignLimit) throw new Error(`This package allows ${campaignLimit} active campaign${campaignLimit === 1 ? "" : "s"}. Upgrade the package or complete an existing campaign first.`);
    }
    result = await admin.from("whatsapp_platform_campaigns").insert({ ...values, tenant_id: customer.tenant_id, connection_id: connection.id, created_by_user_id: customer.user_id })
      .select("*").single();
  }
  if (result.error || !result.data) throw new Error("Campaign could not be saved.");
  return { campaign: campaignRow(result.data) };
}

async function decideCampaign(admin: any, customer: any, body: any) {
  if (!["owner","admin"].includes(customer.role_code)) throw new Error("Only workspace administrators can approve or reject campaigns.");
  const connection = await ownedBusinessNumber(admin, customer, body.connectionId);
  const campaignId = cleanUuid(body.campaignId, "campaign");
  const decision = String(body.decision || "");
  const note = cleanText(body.note, 500);
  if (!['approved','rejected','paused'].includes(decision)) throw new Error("Select a valid campaign decision.");
  if (decision === "rejected" && !note) throw new Error("Add a rejection reason.");
  const { data: current, error: currentError } = await admin.from("whatsapp_platform_campaigns")
    .select("id,status,objective,estimated_audience,scheduled_at,opt_in_confirmed,policy_confirmed,approval_log")
    .eq("id", campaignId).eq("tenant_id", customer.tenant_id).eq("connection_id", connection.id).single();
  if (currentError || !current) throw new Error("Campaign not found.");
  if (decision === "approved" && (!current.objective || !current.estimated_audience || !current.scheduled_at || !current.opt_in_confirmed || !current.policy_confirmed)) {
    throw new Error("Complete the objective, consent confirmations, eligible audience and future schedule before approval.");
  }
  const entry = { id: crypto.randomUUID(), status: decision, note, actorName: customer.display_name || customer.email || "Workspace administrator", actorEmail: customer.email || "", at: new Date().toISOString() };
  const approvalLog = [entry, ...(Array.isArray(current.approval_log) ? current.approval_log : [])].slice(0, 200);
  const updates: any = { status: decision, approval_log: approvalLog, updated_by_user_id: customer.user_id, updated_at: entry.at };
  if (decision === "approved") { updates.approved_by_user_id = customer.user_id; updates.approved_at = entry.at; }
  const { data, error } = await admin.from("whatsapp_platform_campaigns").update(updates)
    .eq("id", campaignId).eq("tenant_id", customer.tenant_id).eq("connection_id", connection.id).select("*").single();
  if (error || !data) throw new Error("Campaign decision could not be recorded.");
  return { campaign: campaignRow(data) };
}

async function deleteCampaign(admin: any, customer: any, body: any) {
  if (!["owner","admin"].includes(customer.role_code)) throw new Error("Only workspace administrators can delete campaigns.");
  const connection = await ownedBusinessNumber(admin, customer, body.connectionId);
  const campaignId = cleanUuid(body.campaignId, "campaign");
  const { data, error } = await admin.from("whatsapp_platform_campaigns").delete()
    .eq("id", campaignId).eq("tenant_id", customer.tenant_id).eq("connection_id", connection.id)
    .in("status", ["draft","rejected"]).select("id").single();
  if (error || !data) throw new Error("Only draft or rejected campaigns can be deleted.");
  return { deleted: true, campaignId };
}

async function listNotifications(admin: any, customer: any, body: any) {
  const requestedLimit = Number(body.limit || 30);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 60) : 30;
  const now = new Date().toISOString();
  const { data, error } = await admin.from("whatsapp_platform_notifications")
    .select("id,category,event_code,title,message,severity,action_label,action_url,entity_type,entity_id,context,read_at,dismissed_at,created_at")
    .eq("tenant_id", customer.tenant_id)
    .eq("recipient_user_id", customer.user_id)
    .is("dismissed_at", null)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const notifications = (data || []).map((row: any) => ({
    id: row.id, category: row.category, eventCode: row.event_code, title: row.title,
    message: row.message, severity: row.severity, actionLabel: row.action_label,
    actionUrl: row.action_url, entityType: row.entity_type, entityId: row.entity_id,
    context: row.context || {}, readAt: row.read_at, createdAt: row.created_at,
  }));
  return { notifications, unreadCount: notifications.filter((item: any) => !item.readAt).length };
}

async function markNotificationRead(admin: any, customer: any, body: any) {
  const notificationId = cleanUuid(body.notificationId, "notification");
  const { data, error } = await admin.from("whatsapp_platform_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId).eq("tenant_id", customer.tenant_id).eq("recipient_user_id", customer.user_id)
    .is("read_at", null).select("id").maybeSingle();
  if (error) throw error;
  return { updated: Boolean(data), notificationId };
}

async function markAllNotificationsRead(admin: any, customer: any) {
  const { data, error } = await admin.from("whatsapp_platform_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("tenant_id", customer.tenant_id).eq("recipient_user_id", customer.user_id)
    .is("read_at", null).is("dismissed_at", null).select("id");
  if (error) throw error;
  return { updatedCount: (data || []).length };
}

async function dismissNotification(admin: any, customer: any, body: any) {
  const notificationId = cleanUuid(body.notificationId, "notification");
  const timestamp = new Date().toISOString();
  const { data, error } = await admin.from("whatsapp_platform_notifications")
    .update({ dismissed_at: timestamp, read_at: timestamp })
    .eq("id", notificationId).eq("tenant_id", customer.tenant_id).eq("recipient_user_id", customer.user_id)
    .is("dismissed_at", null).select("id").maybeSingle();
  if (error) throw error;
  return { dismissed: Boolean(data), notificationId };
}

const GOOGLE_CONTACTS_SCOPE = "openid email https://www.googleapis.com/auth/contacts.readonly";
function googleContactsCredentials() {
  const clientId = env("GOOGLE_CONTACTS_OAUTH_CLIENT_ID").trim();
  const clientSecret = env("GOOGLE_CONTACTS_OAUTH_CLIENT_SECRET").trim();
  if (!clientId || !clientSecret) throw new Error("Google Contacts import is not configured yet. Add the Google OAuth client ID and secret to the billing environment.");
  return { clientId, clientSecret };
}
function googleContactsCallbackUrl() {
  const configured = env("GOOGLE_CONTACTS_OAUTH_REDIRECT_URI").trim();
  if (configured) return configured;
  const base = env("SUPABASE_URL").replace(/\/+$/, "");
  if (!base) throw new Error("Google Contacts import is not configured yet.");
  return `${base}/functions/v1/whatsapp-platform-messaging?google_contacts_callback=1`;
}
function safeContactsReturnUrl(value: unknown) {
  const fallback = "https://varadanexus.com/whatsapp-platform/workspace/contacts/";
  try {
    const url = new URL(String(value || fallback));
    const allowed = ALLOWED_ORIGINS.has(url.origin) || isLoopback(url.origin);
    if (!allowed || !url.pathname.startsWith("/whatsapp-platform/workspace/contacts")) return fallback;
    url.hash = "";
    url.search = "";
    return url.toString();
  } catch { return fallback; }
}
function withGoogleImportResult(returnUrl: string, key: string, value: string) {
  const url = new URL(safeContactsReturnUrl(returnUrl));
  url.searchParams.set(key, value.slice(0, 500));
  return url.toString();
}
async function startGoogleContactsImport(admin: any, customer: any, body: any) {
  if (!["owner","admin","agent"].includes(customer.role_code)) throw new Error("Your workspace role cannot import contacts.");
  const { clientId } = googleContactsCredentials();
  const state = randomHex(32);
  const stateHash = await sha256(state);
  const returnUrl = safeContactsReturnUrl(body.returnUrl);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
  await admin.from("whatsapp_platform_google_contact_imports")
    .update({ status: "expired", updated_at: now.toISOString() })
    .eq("tenant_id", customer.tenant_id).eq("user_id", customer.user_id).eq("status", "pending").lt("expires_at", now.toISOString());
  const { error } = await admin.from("whatsapp_platform_google_contact_imports").insert({
    tenant_id: customer.tenant_id, user_id: customer.user_id, state_hash: stateHash,
    status: "pending", return_url: returnUrl, expires_at: expiresAt,
  });
  if (error) throw new Error("Google Contacts sign-in could not be started.");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", googleContactsCallbackUrl());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_CONTACTS_SCOPE);
  url.searchParams.set("state", state);
  url.searchParams.set("access_type", "online");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent select_account");
  return { authorizationUrl: url.toString(), expiresAt };
}
async function fetchGoogleContacts(accessToken: string) {
  const contacts: Array<{ displayName: string; phone: string }> = [];
  let pageToken = "";
  let page = 0;
  do {
    const url = new URL("https://people.googleapis.com/v1/people/me/connections");
    url.searchParams.set("personFields", "names,phoneNumbers");
    url.searchParams.set("pageSize", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.message || "Google Contacts could not be read.");
    for (const person of Array.isArray(payload.connections) ? payload.connections : []) {
      const names = Array.isArray(person?.names) ? person.names : [];
      const primaryName = names.find((item: any) => item?.metadata?.primary) || names[0] || {};
      const displayName = cleanText(primaryName.displayName || primaryName.unstructuredName || "Google contact", 200) || "Google contact";
      for (const number of Array.isArray(person?.phoneNumbers) ? person.phoneNumbers : []) {
        const phone = cleanText(number?.canonicalForm || number?.value, 64);
        if (phone && phone.replace(/\D/g, "").length >= 7) contacts.push({ displayName, phone });
      }
    }
    pageToken = String(payload.nextPageToken || "");
    page += 1;
  } while (pageToken && page < 1000);
  return contacts;
}
async function googleContactsCallback(req: Request, admin: any) {
  const requestUrl = new URL(req.url);
  const state = String(requestUrl.searchParams.get("state") || "");
  if (!/^[a-f0-9]{64}$/i.test(state)) return redirect("https://varadanexus.com/whatsapp-platform/workspace/contacts/?google_contacts_error=Invalid%20or%20expired%20Google%20sign-in");
  const stateHash = await sha256(state);
  const { data: record } = await admin.from("whatsapp_platform_google_contact_imports")
    .select("id,tenant_id,user_id,status,return_url,expires_at")
    .eq("state_hash", stateHash).maybeSingle();
  if (!record || record.status !== "pending" || new Date(record.expires_at).getTime() <= Date.now()) {
    return redirect("https://varadanexus.com/whatsapp-platform/workspace/contacts/?google_contacts_error=Invalid%20or%20expired%20Google%20sign-in");
  }
  const fail = async (message: string) => {
    const safeMessage = cleanText(message, 500) || "Google Contacts import was cancelled.";
    await admin.from("whatsapp_platform_google_contact_imports").update({ status: "failed", error_message: safeMessage, updated_at: new Date().toISOString() }).eq("id", record.id);
    return redirect(withGoogleImportResult(record.return_url, "google_contacts_error", safeMessage));
  };
  if (requestUrl.searchParams.get("error")) return fail(requestUrl.searchParams.get("error_description") || "Google Contacts access was not granted.");
  const code = String(requestUrl.searchParams.get("code") || "");
  if (!code) return fail("Google did not return an authorization code.");
  try {
    const { clientId, clientSecret } = googleContactsCredentials();
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: googleContactsCallbackUrl(), grant_type: "authorization_code" }),
    });
    const token = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !token.access_token) throw new Error(token?.error_description || "Google authorization could not be completed.");
    const [contacts, profileResponse] = await Promise.all([
      fetchGoogleContacts(String(token.access_token)),
      fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${token.access_token}`, Accept: "application/json" } }),
    ]);
    const profile = await profileResponse.json().catch(() => ({}));
    const resultToken = randomHex(32);
    const { error } = await admin.from("whatsapp_platform_google_contact_imports").update({
      status: "ready", contacts, provider_email: cleanText(profile?.email, 254) || null,
      result_token_hash: await sha256(resultToken), expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", record.id).eq("status", "pending");
    if (error) throw new Error("Google Contacts could not be prepared for review.");
    return redirect(withGoogleImportResult(record.return_url, "google_contacts_import", resultToken));
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Google Contacts import failed.");
  }
}
async function consumeGoogleContactsImport(admin: any, customer: any, body: any) {
  const token = String(body.importToken || "");
  if (!/^[a-f0-9]{64}$/i.test(token)) throw new Error("This Google Contacts import link is invalid or expired.");
  const tokenHash = await sha256(token);
  const { data: record, error } = await admin.from("whatsapp_platform_google_contact_imports")
    .select("id,status,contacts,provider_email,expires_at")
    .eq("tenant_id", customer.tenant_id).eq("user_id", customer.user_id).eq("result_token_hash", tokenHash).maybeSingle();
  if (error || !record || record.status !== "ready" || new Date(record.expires_at).getTime() <= Date.now()) throw new Error("This Google Contacts import link is invalid or expired.");
  const contacts = Array.isArray(record.contacts) ? record.contacts : [];
  const { error: updateError } = await admin.from("whatsapp_platform_google_contact_imports").update({
    status: "consumed", contacts: [], result_token_hash: null, consumed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq("id", record.id).eq("status", "ready");
  if (updateError) throw new Error("Google Contacts could not be opened for review.");
  return { contacts, providerEmail: record.provider_email || "" };
}

Deno.serve(async (req) => {
  const admin = adminClient();
  if (req.method === "GET" && new URL(req.url).searchParams.get("google_contacts_callback") === "1") {
    return googleContactsCallback(req, admin);
  }
  if (req.method === "OPTIONS") {
    if (!allowedOrigin(req)) return json(req, { error: "Origin not allowed" }, 403);
    return new Response("ok", { headers: headers(req) });
  }
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  if (!allowedOrigin(req)) return json(req, { error: "Origin not allowed" }, 403);
  if (!(req.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) return json(req, { error: "Content type must be application/json" }, 415);
  if (Number(req.headers.get("content-length") || 0) > MAX_BODY_BYTES) return json(req, { error: "Request too large" }, 413);
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return json(req, { error: "Request too large" }, 413);
    const body = raw ? JSON.parse(raw) : {};
    const customer = await customerSession(admin, body.sessionToken);
    const action = String(body.action || "list");
    if (action !== "package_master" && !NOTIFICATION_ACTIONS.has(action)) {
      const entitlement = await billingEntitlement(admin, customer);
      if (!entitlement.allowed) return json(req, { error: entitlement.reason, code: "BILLING_ACCESS_REQUIRED", billing: entitlement }, 402);
    }
    if (customer.role_code === "agent" && !AGENT_ACTIONS.has(action)) {
      return json(req, { error: "Your agent role cannot access this workspace area." }, 403);
    }
    const featureByAction: Record<string, string> = {
      list: "team_inbox", thread: "team_inbox", send_text: "team_inbox", start_chat: "team_inbox",
      update_conversation: "team_inbox", add_note: "team_inbox",
      list_contacts: "contacts", create_contact: "contacts", preview_contact_import: "contacts", import_contacts: "contacts", start_google_contacts_import: "contacts", consume_google_contacts_import: "contacts", update_contact: "contacts", delete_contacts: "contacts",
      list_marketing_consent_events: "contacts",
      list_templates: "templates", list_template_library: "templates", create_template: "templates",
      list_flows: "flows", save_flow: "flows", set_flow_status: "flows", delete_flow: "flows",
      list_campaigns: "campaigns", list_campaign_segments: "campaigns", save_campaign_segment: "campaigns",
      delete_campaign_segment: "campaigns", save_campaign: "campaigns", decide_campaign: "campaigns", delete_campaign: "campaigns", dispatch_campaign: "campaigns",
    };
    if (featureByAction[action] && action !== "save_campaign") await requirePackageFeature(admin, customer, featureByAction[action]);
    if (action === "list") return json(req, await listConversations(admin, customer, body));
    if (action === "list_team") return json(req, await listTeam(admin, customer));
    if (action === "list_notifications") return json(req, await listNotifications(admin, customer, body));
    if (action === "mark_notification_read") return json(req, await markNotificationRead(admin, customer, body));
    if (action === "mark_all_notifications_read") return json(req, await markAllNotificationsRead(admin, customer));
    if (action === "dismiss_notification") return json(req, await dismissNotification(admin, customer, body));
    if (action === "package_master") return json(req, await packageMaster(admin, customer));
    if (action === "workspace_messaging_preferences") return json(req, await workspaceMessagingPreferences(admin, customer));
    if (action === "update_workspace_messaging_preferences") return json(req, await updateWorkspaceMessagingPreferences(admin, customer, body));
    if (action === "invite_team_member") return json(req, await inviteTeamMember(admin, customer, body));
    if (action === "update_team_member") return json(req, await updateTeamMember(admin, customer, body));
    if (action === "list_contacts") return json(req, await listContacts(admin, customer, body));
    if (action === "list_marketing_consent_events") return json(req, await listMarketingConsentEvents(admin, customer, body));
    if (action === "get_business_profile") return json(req, await getBusinessProfile(admin, customer, body));
    if (action === "update_business_profile") return json(req, await updateBusinessProfile(admin, customer, body));
    if (action === "list_templates") return json(req, await listTemplates(admin, customer, body));
    if (action === "list_template_library") return json(req, await listTemplateLibrary(admin, customer, body));
    if (action === "create_template") return json(req, await createTemplate(admin, customer, body));
    if (action === "list_flows") return json(req, await listFlows(admin, customer, body));
    if (action === "save_flow") return json(req, await saveFlow(admin, customer, body));
    if (action === "set_flow_status") return json(req, await setFlowStatus(admin, customer, body));
    if (action === "delete_flow") return json(req, await deleteFlow(admin, customer, body));
    if (action === "list_campaigns") return json(req, await listCampaigns(admin, customer, body));
    if (action === "list_campaign_segments") return json(req, await listCampaignSegments(admin, customer, body));
    if (action === "save_campaign_segment") return json(req, await saveCampaignSegment(admin, customer, body));
    if (action === "delete_campaign_segment") return json(req, await deleteCampaignSegment(admin, customer, body));
    if (action === "save_campaign") return json(req, await saveCampaign(admin, customer, body));
    if (action === "decide_campaign") return json(req, await decideCampaign(admin, customer, body));
    if (action === "dispatch_campaign") return json(req, await dispatchCampaign(admin, customer, body));
    if (action === "delete_campaign") return json(req, await deleteCampaign(admin, customer, body));
    if (action === "thread") return json(req, await thread(admin, customer, body));
    if (action === "send_text") return json(req, await sendText(admin, customer, body));
    if (action === "create_contact") return json(req, await createContact(admin, customer, body));
    if (action === "preview_contact_import") return json(req, await previewContactImport(admin, customer, body));
    if (action === "import_contacts") return json(req, await importContacts(admin, customer, body));
    if (action === "start_google_contacts_import") return json(req, await startGoogleContactsImport(admin, customer, body));
    if (action === "consume_google_contacts_import") return json(req, await consumeGoogleContactsImport(admin, customer, body));
    if (action === "start_chat") return json(req, await startChat(admin, customer, body));
    if (action === "update_conversation") return json(req, await updateConversation(admin, customer, body));
    if (action === "add_note") return json(req, await addNote(admin, customer, body));
    if (action === "update_contact") return json(req, await updateContact(admin, customer, body));
    if (action === "delete_contacts") return json(req, await deleteContacts(admin, customer, body));
    if (action === "delete_contacts") return json(req, await deleteContacts(admin, customer, body));
    return json(req, { error: "Unsupported action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    const status = /unauthorized/i.test(message) ? 401 : /cannot send|role|only workspace administrators/i.test(message) ? 403 : /not found/i.test(message) ? 404 : 400;
    return json(req, { error: message }, status);
  }
});
