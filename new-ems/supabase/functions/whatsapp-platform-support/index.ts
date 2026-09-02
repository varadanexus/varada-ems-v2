// @ts-nocheck
// Tenant-isolated WhatsApp Platform customer support and staff operations.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_BODY_BYTES = 48 * 1024;
const ALLOWED_ORIGINS = new Set(["https://www.varadanexus.com", "https://varadanexus.com"]);
const CUSTOMER_ACTIONS = new Set(["customer_list", "customer_thread", "customer_create", "customer_reply", "customer_close"]);
const STAFF_ACTIONS = new Set(["staff_list", "staff_thread", "staff_reply", "staff_update", "staff_create", "staff_update_customer", "staff_invite_customer_user", "staff_update_customer_user", "staff_delete_customer_user"]);
const CUSTOMER_REPLY_TIMEOUT_MS = 48 * 60 * 60 * 1000;

function env(name: string) { return Deno.env.get(name) || ""; }
function isLoopback(origin: string) { try { return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(new URL(origin).hostname); } catch { return false; } }
function allowedOrigin(req: Request) { const origin = req.headers.get("origin") || ""; return !origin ? "https://www.varadanexus.com" : (ALLOWED_ORIGINS.has(origin) || isLoopback(origin) ? origin : ""); }
function headers(req: Request) { const origin = allowedOrigin(req); return { ...(origin ? { "Access-Control-Allow-Origin": origin } : {}), "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Max-Age": "600", "Cache-Control": "no-store", "Content-Type": "application/json", "Vary": "Origin", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer" }; }
function json(req: Request, body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: headers(req) }); }
function adminClient() { return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } }); }
function text(value: unknown, max: number) { return String(value || "").trim().replace(/\s+/g, " ").slice(0, max); }
function bodyText(value: unknown, max = 5000) { return String(value || "").trim().replace(/\r\n/g, "\n").slice(0, max); }
function uuid(value: unknown) { const result = String(value || ""); if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(result)) throw new Error("Invalid ticket."); return result; }
function html(value: unknown) { return String(value || "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] || character)); }
function randomCode() { return Array.from(crypto.getRandomValues(new Uint8Array(4))).map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase(); }
function randomHex(byteLength = 32) { return Array.from(crypto.getRandomValues(new Uint8Array(byteLength))).map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
async function sha256(value: string) { const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
function email(value: unknown) { const result = text(value, 254).toLowerCase(); if (!/^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i.test(result)) throw new Error("Enter a valid email address."); return result; }
function mobile(value: unknown) { const digits = String(value || "").replace(/\D/g, ""); const normalized = digits.length === 10 ? `+91${digits}` : `+${digits}`; if (!/^\+[1-9][0-9]{7,14}$/.test(normalized)) throw new Error("Enter a valid mobile number with country code."); return normalized; }
function sla(priority: string) { const hours = ({ low: [24, 120], normal: [8, 72], high: [4, 24], urgent: [1, 8] } as any)[priority] || [8, 72]; return { first_response_due_at: new Date(Date.now() + hours[0] * 3600000).toISOString(), resolution_due_at: new Date(Date.now() + hours[1] * 3600000).toISOString() }; }
async function audit(admin: any, req: Request, eventType: string, ticketId: string, details: any, actorAppUserId: string | null = null) { await admin.from("audit_logs").insert({ event_type: eventType, action: eventType, module_code: "whatsapp-platform", actor_app_user_id: actorAppUserId, entity_type: "whatsapp_platform_support_tickets", entity_id: ticketId, details, user_agent: req.headers.get("user-agent") || null, ip_address: (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null }); }

async function customerSession(admin: any, tokenValue: unknown) {
  const token = String(tokenValue || "");
  if (!/^[a-f0-9]{64}$/i.test(token)) throw new Error("Unauthorized");
  const { data, error } = await admin.rpc("whatsapp_platform_validate_session", { p_session_token: token });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row?.tenant_id || !row?.user_id) throw new Error("Unauthorized");
  const { data: user, error: userError } = await admin.from("whatsapp_platform_users").select("id,tenant_id,display_name,email,status").eq("id", row.user_id).eq("tenant_id", row.tenant_id).single();
  if (userError || !user || user.status !== "active") throw new Error("Unauthorized");
  return user;
}

async function staffSession(req: Request) {
  const authorization = req.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) throw new Error("Authentication required.");
  const caller = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: authorization } } });
  const [{ data: appUserId }, { data: full }, { data: canView }, { data: canEdit }] = await Promise.all([
    caller.rpc("current_app_user_id"), caller.rpc("has_full_system_authority"),
    caller.rpc("has_permission", { module_code: "whatsapp-platform", action_code: "view" }),
    caller.rpc("has_permission", { module_code: "whatsapp-platform", action_code: "edit" }),
  ]);
  if (!appUserId || !(full === true || canView === true || canEdit === true)) throw new Error("WhatsApp Platform support access is required.");
  return { id: appUserId, canEdit: full === true || canEdit === true };
}

async function ticketThread(admin: any, ticket: any, includeInternal: boolean) {
  let query = admin.from("whatsapp_platform_support_messages").select("id,customer_user_id,app_user_id,body,is_internal,created_at").eq("ticket_id", ticket.id).order("created_at");
  if (!includeInternal) query = query.eq("is_internal", false);
  const { data: messages, error } = await query; if (error) throw error;
  const customerIds = [...new Set((messages || []).map((item: any) => item.customer_user_id).filter(Boolean))];
  const staffIds = [...new Set((messages || []).map((item: any) => item.app_user_id).filter(Boolean))];
  const [{ data: customers }, { data: staff }] = await Promise.all([
    customerIds.length ? admin.from("whatsapp_platform_users").select("id,display_name,email").in("id", customerIds) : Promise.resolve({ data: [] }),
    staffIds.length ? admin.from("app_users").select("id,display_name,email").in("id", staffIds) : Promise.resolve({ data: [] }),
  ]);
  const names = new Map([...(customers || []), ...(staff || [])].map((item: any) => [item.id, item]));
  return (messages || []).map((message: any) => ({ ...message, author: names.get(message.customer_user_id || message.app_user_id) || null, authorKind: message.customer_user_id ? "customer" : "support" }));
}

function publicTicket(ticket: any) { return { id: ticket.id, ticketNumber: ticket.ticket_number, tenantId: ticket.tenant_id, subject: ticket.subject, description: ticket.description, category: ticket.category, priority: ticket.priority, status: ticket.status, assignedToAppUserId: ticket.assigned_to_app_user_id, firstResponseDueAt: ticket.first_response_due_at, resolutionDueAt: ticket.resolution_due_at, firstRespondedAt: ticket.first_responded_at, resolvedAt: ticket.resolved_at, autoCloseAt: ticket.auto_close_at, lastActivityAt: ticket.last_activity_at, createdAt: ticket.created_at, tenant: ticket.tenant || null, requester: ticket.requester || null, assignee: ticket.assignee || null } }

async function getTicket(admin: any, id: string) {
  const { data, error } = await admin.from("whatsapp_platform_support_tickets").select("*,tenant:whatsapp_platform_tenants(id,name,owner_email),requester:whatsapp_platform_users!created_by_user_id(id,display_name,email),assignee:app_users!assigned_to_app_user_id(id,display_name,email)").eq("id", id).single();
  if (error || !data) throw new Error("Support ticket not found."); return data;
}

function supportPortalPath(ticketId: string) { return `/whatsapp-platform/workspace/support/?ticket=${encodeURIComponent(ticketId)}`; }
function supportAdminPath(ticketId: string) { return `/new-ems/modules/whatsapp-platform-admin/index.html?view=customer-support&ticket=${encodeURIComponent(ticketId)}`; }
function background(task: Promise<unknown>) {
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(task.catch((error) => console.warn("Background support task failed", error?.message || error)));
  else task.catch((error) => console.warn("Background support task failed", error?.message || error));
}
async function notifyCustomer(admin: any, ticket: any, eventCode: string, title: string, message: string, severity = "info", unique = eventCode) {
  const row = {
    tenant_id: ticket.tenant_id,
    recipient_user_id: ticket.created_by_user_id,
    category: "support",
    event_code: eventCode,
    title,
    message,
    severity,
    action_label: "Open ticket",
    action_url: supportPortalPath(ticket.id),
    entity_type: "whatsapp_platform_support_ticket",
    entity_id: ticket.id,
    dedupe_key: `support:${ticket.id}:${unique}`,
    context: { ticket_number: ticket.ticket_number, status: ticket.status },
  };
  const { error } = await admin.from("whatsapp_platform_notifications").upsert(row, { onConflict: "recipient_user_id,dedupe_key", ignoreDuplicates: true });
  if (error) throw error;
}
async function notifyStaff(admin: any, ticket: any, eventCode: string, title: string, message: string, severity = "info", targetUserId: string | null = null) {
  const { error } = await admin.rpc("dispatch_ems_notification", {
    p_module_code: "whatsapp-platform",
    p_event_code: eventCode,
    p_category: "customer_support",
    p_title: title,
    p_message: message,
    p_severity: severity,
    p_action_label: "Open ticket",
    p_action_url: supportAdminPath(ticket.id),
    p_entity_type: "whatsapp_platform_support_ticket",
    p_entity_id: ticket.id,
    p_context: { ticket_number: ticket.ticket_number, tenant_id: ticket.tenant_id, status: ticket.status },
    p_target_mode: targetUserId ? "user_ids" : "role_codes",
    p_target_user_ids: targetUserId ? [targetUserId] : null,
    p_target_role_codes: targetUserId ? null : ["chairman_managing_director", "super_admin", "admin"],
    p_target_division_ids: null,
    p_channel_plan: { in_app: true, push: true },
  });
  if (error) throw error;
}

function closureMessage(status: "resolved" | "closed", automatic = false) {
  if (status === "resolved") return "This ticket has been resolved. Reply here to reopen it if you still need help.";
  return automatic
    ? "This ticket was closed automatically because we did not receive a reply within 48 hours of our last response. Reply here to reopen it."
    : "This ticket has been closed. Reply here to reopen it if you need further help.";
}

async function addStatusMessage(admin: any, ticket: any, status: "resolved" | "closed", appUserId: string, automatic = false) {
  const { data, error } = await admin.from("whatsapp_platform_support_messages").insert({ ticket_id: ticket.id, app_user_id: appUserId, body: closureMessage(status, automatic), is_internal: false }).select("id").single();
  if (error) throw error;
  return data.id;
}

function zeptoAuthorization() { const raw = env("ZEPTO_SEND_MAIL_TOKEN").trim(); if (!raw) throw new Error("ZeptoMail delivery is not configured."); return raw.toLowerCase().startsWith("zoho-enczapikey") ? raw : `Zoho-enczapikey ${raw}`; }
async function sendSupportEmail(admin: any, ticket: any, eventKind: string, messageId: string | null = null) {
  const recipient = String(ticket.requester?.email || "").toLowerCase(); if (!recipient) return;
  const ledger = { ticket_id: ticket.id, message_id: messageId, dedupe_key: `${ticket.id}:${messageId || "ticket"}:${eventKind}:${recipient}`, event_kind: eventKind, recipient_email: recipient, status: "sending", updated_at: new Date().toISOString() };
  let { data: claimed, error: claimError } = await admin.from("whatsapp_platform_support_email_deliveries").upsert(ledger, { onConflict: "dedupe_key", ignoreDuplicates: true }).select("id").maybeSingle();
  if (claimError) throw claimError;
  if (!claimed?.id) {
    const { data: existing } = await admin.from("whatsapp_platform_support_email_deliveries").select("id,status").eq("dedupe_key", ledger.dedupe_key).maybeSingle();
    if (!existing || existing.status === "sent" || existing.status === "sending") return;
    await admin.from("whatsapp_platform_support_email_deliveries").update({ status: "sending", error_message: null, updated_at: new Date().toISOString() }).eq("id", existing.id);
    claimed = existing;
  }
  const conversation = await ticketThread(admin, ticket, false);
  const rows = conversation.map((item: any) => `<div style="padding:14px 0;border-top:1px solid #e3ebe7"><strong>${html(item.authorKind === "support" ? "Varada Nexus Support" : item.author?.display_name || "Customer")}</strong><small style="display:block;color:#718079;margin:3px 0 7px">${html(new Date(item.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }))}</small><div style="white-space:pre-wrap;line-height:1.55">${html(item.body)}</div></div>`).join("");
  const portalUrl = `https://www.varadanexus.com/whatsapp-platform/workspace/support/?ticket=${encodeURIComponent(ticket.id)}`;
  const titles: any = { ticket_created: "We received your support request", support_replied: "Varada Nexus Support replied", ticket_resolved: "Your support ticket was resolved", ticket_closed: "Your support ticket was closed" };
  const subject = `[${ticket.ticket_number}] ${titles[eventKind] || "Support ticket update"}`;
  const followUp = ["ticket_resolved", "ticket_closed"].includes(eventKind) ? `<p style="font-size:13px;color:#718079">For a separate query, email <a href="mailto:connect@varadanexus.com" style="color:#0b8f58">connect@varadanexus.com</a>.</p>` : "";
  const htmlBody = `<div style="margin:0;background:#f3f7f5;padding:32px 14px;font-family:Arial,Helvetica,sans-serif;color:#13231c"><div style="max-width:640px;margin:auto;background:#fff;border:1px solid #d7e4dd;border-radius:18px;overflow:hidden"><div style="padding:27px 32px;background:#061d14;color:#fff"><div style="font-size:12px;letter-spacing:.15em;text-transform:uppercase;color:#35dd94">Varada Nexus · WhatsApp Solutions</div><h1 style="font-size:25px;margin:10px 0 3px">${html(titles[eventKind])}</h1><div style="color:#bdd1c8">${html(ticket.ticket_number)} · ${html(ticket.subject)}</div></div><div style="padding:28px 32px"><p>Hello ${html(ticket.requester?.display_name || "there")},</p><p style="line-height:1.6">Your support conversation is shown below. To respond securely, sign in to your WhatsApp Solutions workspace.</p><div style="margin:22px 0">${rows || `<div style="white-space:pre-wrap">${html(ticket.description)}</div>`}</div><p style="margin:28px 0"><a href="${html(portalUrl)}" style="display:inline-block;background:#19bd74;color:#062418;text-decoration:none;font-weight:700;padding:14px 21px;border-radius:10px">Open support ticket</a></p><p style="font-size:13px;color:#718079"><strong>Please do not reply to this email.</strong> Email replies are not monitored or added to the ticket. Sign in and reply from the support page.</p>${followUp}</div><div style="padding:17px 32px;background:#f7faf8;color:#718079;font-size:12px">Varada Nexus Private Limited · Secure customer support</div></div></div>`;
  try {
    const sendFrom = async (address: string) => { const response = await fetch(`${(env("ZEPTO_API_BASE_URL") || "https://api.zeptomail.in").replace(/\/+$/, "")}/v1.1/email`, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: zeptoAuthorization() }, body: JSON.stringify({ from: { address, name: "Varada Nexus Support" }, to: [{ email_address: { address: recipient, name: ticket.requester?.display_name || "Customer" } }], reply_to: [{ address: "noreply@varadanexus.com", name: "No Reply" }], subject, htmlbody: htmlBody, textbody: `${titles[eventKind]}\n${ticket.ticket_number}: ${ticket.subject}\n\nSign in to view and reply: ${portalUrl}\n\nDo not reply to this email.`, track_clicks: true, track_opens: true, client_reference: `wp-support-${claimed.id}` }) }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload?.error?.message || payload?.message || `ZeptoMail rejected the message (${response.status}).`); return payload; };
    let payload; try { payload = await sendFrom("nexusconnect@varadanexus.com"); } catch { payload = await sendFrom("noreply@varadanexus.com"); }
    await admin.from("whatsapp_platform_support_email_deliveries").update({ status: "sent", provider_request_id: payload?.request_id || payload?.data?.[0]?.message_id || null, updated_at: new Date().toISOString() }).eq("id", claimed.id);
  } catch (error) { await admin.from("whatsapp_platform_support_email_deliveries").update({ status: "failed", error_message: String(error?.message || error).slice(0, 1000), updated_at: new Date().toISOString() }).eq("id", claimed.id); throw error; }
}

async function sendTeamInviteEmail(details: { email: string; displayName: string; companyName: string; roleCode: string; inviteUrl: string }) {
  const roleLabel = ({ admin: "Administrator", agent: "Agent", viewer: "Viewer" } as Record<string, string>)[details.roleCode] || "Member";
  const htmlBody = `<div style="margin:0;background:#f3f7f5;padding:32px 14px;font-family:Arial,Helvetica,sans-serif;color:#13231c"><div style="max-width:620px;margin:auto;background:#fff;border:1px solid #d7e4dd;border-radius:18px;overflow:hidden"><div style="padding:27px 32px;background:#061d14;color:#fff"><div style="font-size:12px;letter-spacing:.15em;text-transform:uppercase;color:#35dd94">Varada Nexus · WhatsApp Solutions</div><h1 style="font-size:25px;margin:10px 0 3px">Join ${html(details.companyName)}</h1></div><div style="padding:28px 32px"><p>Hello ${html(details.displayName)},</p><p>You have been invited as a <strong>${html(roleLabel)}</strong>.</p><p style="margin:28px 0"><a href="${html(details.inviteUrl)}" style="display:inline-block;background:#19bd74;color:#062418;text-decoration:none;font-weight:700;padding:14px 21px;border-radius:10px">Accept invitation</a></p><p style="font-size:13px;color:#718079">This single-use link expires after seven days.</p></div></div></div>`;
  const response = await fetch(`${(env("ZEPTO_API_BASE_URL") || "https://api.zeptomail.in").replace(/\/+$/, "")}/v1.1/email`, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: zeptoAuthorization() }, body: JSON.stringify({ from: { address: "nexusconnect@varadanexus.com", name: "Varada Nexus Connect" }, to: [{ email_address: { address: details.email, name: details.displayName } }], reply_to: [{ address: "noreply@varadanexus.com", name: "No Reply" }], subject: `You're invited to ${details.companyName}`, htmlbody: htmlBody, textbody: `Hello ${details.displayName},\n\nYou have been invited to join ${details.companyName} as a ${roleLabel}.\n\nAccept: ${details.inviteUrl}\n\nThis link expires after seven days.`, track_clicks: true, track_opens: true, client_reference: `wa-ems-invite-${Date.now()}` }) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || payload?.message || "Invitation email could not be sent.");
}

async function listTickets(admin: any, customer: any | null) {
  let query = admin.from("whatsapp_platform_support_tickets").select("*,tenant:whatsapp_platform_tenants(id,name,owner_email),requester:whatsapp_platform_users!created_by_user_id(id,display_name,email),assignee:app_users!assigned_to_app_user_id(id,display_name,email)").order("last_activity_at", { ascending: false }).limit(250);
  if (customer) query = query.eq("tenant_id", customer.tenant_id);
  const { data, error } = await query; if (error) throw error; return { tickets: (data || []).map(publicTicket) };
}

async function listEligibleAssignees(admin: any) {
  const [{ data: authorityRoles, error: authorityError }, { data: permissions, error: permissionError }] = await Promise.all([
    admin.from("roles").select("id").in("code", ["chairman_managing_director", "super_admin", "admin"]).eq("is_active", true),
    admin.from("permissions").select("id").eq("module_code", "whatsapp-platform").in("action_code", ["view", "edit", "approve"]).eq("is_active", true),
  ]);
  if (authorityError) throw authorityError;
  if (permissionError) throw permissionError;
  const permissionIds = (permissions || []).map((row: any) => row.id);
  const { data: permissionRoles, error: rolePermissionError } = permissionIds.length
    ? await admin.from("role_permissions").select("role_id").in("permission_id", permissionIds).eq("allow", true)
    : { data: [], error: null };
  if (rolePermissionError) throw rolePermissionError;
  const roleIds = [...new Set([...(authorityRoles || []).map((row: any) => row.id), ...(permissionRoles || []).map((row: any) => row.role_id)])];
  if (!roleIds.length) return [];
  const { data: userRoles, error: userRoleError } = await admin.from("user_roles").select("user_id").in("role_id", roleIds);
  if (userRoleError) throw userRoleError;
  const userIds = [...new Set((userRoles || []).map((row: any) => row.user_id))];
  if (!userIds.length) return [];
  const { data: users, error: userError } = await admin.from("app_users").select("id,display_name,email").in("id", userIds).eq("status", "active").eq("is_locked", false).is("deleted_at", null).order("display_name");
  if (userError) throw userError;
  return users || [];
}

async function customerIntelligence(admin: any, tenantId: string) {
  const [{ data: tenant, error: tenantError }, { data: users, error: usersError }, { data: connections, error: connectionsError }, { data: subscription, error: subscriptionError }, { data: verification, error: verificationError }, { data: payments, error: paymentsError }, { data: invoices, error: invoicesError }] = await Promise.all([
    admin.from("whatsapp_platform_tenants").select("id,name,slug,owner_email,contact_mobile,status,plan_code,additional_team_seats,verification_status,created_at,updated_at").eq("id", tenantId).single(),
    admin.from("whatsapp_platform_users").select("id,display_name,email,job_title,role_code,status,last_login_at,invited_at,invite_expires_at,created_at").eq("tenant_id", tenantId).order("created_at"),
    admin.from("whatsapp_platform_connections").select("id,provider,meta_business_id,whatsapp_business_account_id,phone_number_id,display_phone_number,verified_name,status,onboarding_metadata,connected_at,created_at,updated_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
    admin.from("whatsapp_platform_billing_subscriptions").select("id,status,package_code,billing_interval,quantity,paid_count,remaining_count,current_start,current_end,charge_at,ended_at,cancel_at_cycle_end,activated_at,cancelled_at,safe_metadata,updated_at").eq("tenant_id", tenantId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("whatsapp_platform_business_verifications").select("id,status,entity_type,registration_number,gstin,authorised_representative_name,authorised_representative_title,submitted_at,reviewed_at").eq("tenant_id", tenantId).maybeSingle(),
    admin.from("whatsapp_platform_billing_payments").select("id,amount_paise,currency,status,captured,payment_method,paid_at,created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(25),
    admin.from("whatsapp_platform_billing_invoices").select("id,invoice_number,invoice_date,status,currency,total_paise,package_code,billing_interval,issued_at").eq("tenant_id", tenantId).order("invoice_date", { ascending: false }).limit(25),
  ]);
  if (tenantError) throw tenantError;
  if (usersError) throw usersError;
  if (connectionsError) throw connectionsError;
  if (subscriptionError) throw subscriptionError;
  if (verificationError) throw verificationError;
  if (paymentsError) throw paymentsError;
  if (invoicesError) throw invoicesError;
  const userIds = (users || []).map((user: any) => user.id);
  let activeSessionCount = 0;
  if (userIds.length) {
    const { count, error: sessionError } = await admin.from("whatsapp_platform_sessions").select("id", { count: "exact", head: true }).in("user_id", userIds).is("revoked_at", null).gt("expires_at", new Date().toISOString());
    if (sessionError) throw sessionError;
    activeSessionCount = Number(count || 0);
  }
  const subscriptionActive = subscription?.status === "active" && (!subscription.current_end || new Date(subscription.current_end).getTime() > Date.now());
  const trialActive = subscription?.status === "authenticated" && subscription.charge_at && new Date(subscription.charge_at).getTime() > Date.now();
  const workspaceActive = tenant.status === "active";
  const billingAllowed = workspaceActive && (subscriptionActive || trialActive);
  const packageCode = subscription?.package_code || tenant.plan_code || null;
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    ownerEmail: tenant.owner_email,
    contactMobile: tenant.contact_mobile,
    status: tenant.status,
    planCode: packageCode === "starter" ? "launch" : packageCode,
    additionalTeamSeats: Number(tenant.additional_team_seats || 0),
    verificationStatus: verification?.status || tenant.verification_status || "not_started",
    createdAt: tenant.created_at,
    updatedAt: tenant.updated_at,
    userCount: (users || []).filter((user: any) => ["active", "invited"].includes(user.status)).length,
    activeSessionCount,
    users: (users || []).map((user: any) => ({ id: user.id, displayName: user.display_name, email: user.email, jobTitle: user.job_title, roleCode: user.role_code, status: user.status, lastLoginAt: user.last_login_at, invitedAt: user.invited_at, inviteExpiresAt: user.invite_expires_at, createdAt: user.created_at })),
    connections: (connections || []).map((connection: any) => ({ id: connection.id, provider: connection.provider, metaBusinessId: connection.meta_business_id, whatsappBusinessAccountId: connection.whatsapp_business_account_id, phoneNumberId: connection.phone_number_id, displayPhoneNumber: connection.display_phone_number, verifiedName: connection.verified_name, status: connection.status, onboardingMetadata: connection.onboarding_metadata || {}, connectedAt: connection.connected_at, createdAt: connection.created_at, updatedAt: connection.updated_at })),
    verification: verification ? { id: verification.id, status: verification.status, entityType: verification.entity_type, registrationNumber: verification.registration_number, gstin: verification.gstin, representativeName: verification.authorised_representative_name, representativeTitle: verification.authorised_representative_title, submittedAt: verification.submitted_at, reviewedAt: verification.reviewed_at } : null,
    billingAccess: {
      subscriptionId: subscription?.id || null,
      allowed: billingAllowed,
      state: !workspaceActive ? "workspace_inactive" : subscriptionActive ? "paid" : trialActive ? "trial" : "payment_required",
      reason: !workspaceActive ? "Workspace access is inactive." : subscriptionActive ? "Active paid subscription" : trialActive ? "Authorized trial access" : "No current billing entitlement.",
      subscriptionStatus: subscription?.status || null,
      packageCode,
      accessUntil: subscription?.current_end || subscription?.charge_at || null,
      billingInterval: subscription?.billing_interval || null,
      currentStart: subscription?.current_start || null,
      currentEnd: subscription?.current_end || null,
      activatedAt: subscription?.activated_at || null,
      cancelledAt: subscription?.cancelled_at || null,
      cancelAtCycleEnd: subscription?.cancel_at_cycle_end === true,
    },
    payments: payments || [],
    invoices: invoices || [],
    capturedPaymentTotalPaise: (payments || []).filter((payment: any) => payment.captured).reduce((sum: number, payment: any) => sum + Number(payment.amount_paise || 0), 0),
  };
}

async function listCustomerUsers(admin: any) {
  const { data, error } = await admin.from("whatsapp_platform_users").select("id,tenant_id,display_name,email,tenant:whatsapp_platform_tenants(id,name)").eq("status", "active").order("display_name").limit(500);
  if (error) throw error;
  return data || [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: headers(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  if (!allowedOrigin(req)) return json(req, { error: "Origin not allowed" }, 403);
  try {
    const raw = await req.text(); if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return json(req, { error: "Request too large" }, 413);
    const body = raw ? JSON.parse(raw) : {}; const action = String(body.action || ""); const admin = adminClient();
    if (action === "system_close_stale") {
      const { data: validSecret } = await admin.rpc("whatsapp_platform_validate_support_cron_secret", { p_secret: req.headers.get("x-support-cron-secret") || "" });
      if (validSecret !== true) throw new Error("Unauthorized");
      const now = new Date().toISOString();
      const fallbackStaffId = (await listEligibleAssignees(admin))[0]?.id || null;
      const { data: dueTickets, error: dueError } = await admin.from("whatsapp_platform_support_tickets").select("id").eq("status", "waiting_on_customer").not("auto_close_at", "is", null).lte("auto_close_at", now).limit(100);
      if (dueError) throw dueError;
      let closed = 0;
      for (const due of dueTickets || []) {
        const ticket = await getTicket(admin, due.id);
        const actorId = ticket.assigned_to_app_user_id || fallbackStaffId;
        const { data: changed, error: closeError } = await admin.from("whatsapp_platform_support_tickets").update({ status: "closed", closed_at: now, auto_close_at: null, last_activity_at: now, updated_at: now }).eq("id", ticket.id).eq("status", "waiting_on_customer").lte("auto_close_at", now).select("id").maybeSingle();
        if (closeError) throw closeError;
        if (!changed?.id) continue;
        const messageId = actorId ? await addStatusMessage(admin, ticket, "closed", actorId, true) : null;
        const updated = await getTicket(admin, ticket.id);
        await notifyCustomer(admin, updated, "support_ticket_auto_closed", `${updated.ticket_number} was closed`, "No reply was received within 48 hours. Reply in the ticket to reopen it.", "success", `auto-closed:${updated.closed_at}`).catch((error) => console.warn("Support notification failed", error.message));
        await notifyStaff(admin, updated, "customer_support_auto_closed", `${updated.ticket_number} closed automatically`, "The customer did not reply within 48 hours.", "success", updated.assigned_to_app_user_id || actorId).catch((error) => console.warn("Support notification failed", error.message));
        await audit(admin, req, "whatsapp_customer_support_ticket_auto_closed", ticket.id, { tenant_id: ticket.tenant_id, auto_close_at: ticket.auto_close_at }).catch(() => {});
        background(sendSupportEmail(admin, updated, "ticket_closed", messageId));
        closed += 1;
      }
      return json(req, { success: true, closed });
    }
    if (CUSTOMER_ACTIONS.has(action)) {
      const customer = await customerSession(admin, body.sessionToken);
      if (action === "customer_list") return json(req, await listTickets(admin, customer));
      if (action === "customer_create") {
        const category = ["technical","billing","onboarding","templates","flows","api_webhooks","account_access","other"].includes(body.category) ? body.category : "technical";
        const priority = ["low","normal","high","urgent"].includes(body.priority) ? body.priority : "normal";
        const subject = text(body.subject, 180), description = bodyText(body.description); if (subject.length < 5 || description.length < 10) throw new Error("Enter a subject and a clear description.");
        const ticketNumber = `WPS-${new Date().toISOString().slice(0,10).replace(/-/g, "")}-${randomCode()}`;
        const { data, error } = await admin.from("whatsapp_platform_support_tickets").insert({ ticket_number: ticketNumber, tenant_id: customer.tenant_id, created_by_user_id: customer.id, category, priority, subject, description, source_url: text(body.sourceUrl, 500) || null, safe_environment: { path: text(body.environment?.path, 300), viewport: text(body.environment?.viewport, 40) }, ...sla(priority), last_customer_reply_at: new Date().toISOString() }).select("id").single(); if (error) throw error;
        const ticket = await getTicket(admin, data.id); await audit(admin, req, "whatsapp_customer_support_ticket_created", ticket.id, { tenant_id: customer.tenant_id, customer_user_id: customer.id, ticket_number: ticket.ticket_number, category, priority }).catch(() => {});
        await Promise.all([
          notifyStaff(admin, ticket, "customer_support_ticket_created", `New customer ticket ${ticket.ticket_number}`, `${ticket.tenant?.name || "Customer"}: ${ticket.subject}`, priority === "urgent" ? "error" : priority === "high" ? "warning" : "info"),
          notifyCustomer(admin, ticket, "support_ticket_received", `Ticket ${ticket.ticket_number} received`, "Your support request is now in the customer support queue.", "success", "created"),
        ]).catch((error) => console.warn("Support notification failed", error.message));
        background(sendSupportEmail(admin, ticket, "ticket_created"));
        return json(req, { ticket: publicTicket(ticket), emailQueued: true });
      }
      const ticket = await getTicket(admin, uuid(body.ticketId)); if (ticket.tenant_id !== customer.tenant_id) throw new Error("Support ticket not found.");
      if (action === "customer_thread") return json(req, { ticket: publicTicket(ticket), messages: await ticketThread(admin, ticket, false) });
      if (action === "customer_reply") {
        const message = bodyText(body.message);
        if (!message) throw new Error("Write a reply.");
        const now = new Date().toISOString();
        const { data, error } = await admin.from("whatsapp_platform_support_messages").insert({ ticket_id: ticket.id, customer_user_id: customer.id, body: message }).select("id").single();
        if (error) throw error;
        const wasCompleted = ["resolved", "closed"].includes(ticket.status);
        const nextStatus = wasCompleted ? "reopened" : ticket.status === "waiting_on_customer" ? "open" : ticket.status;
        const ticketUpdate: Record<string, unknown> = { status: nextStatus, auto_close_at: null, last_customer_reply_at: now, last_activity_at: now, updated_at: now };
        if (wasCompleted) Object.assign(ticketUpdate, { resolved_at: null, closed_at: null });
        const { error: updateError } = await admin.from("whatsapp_platform_support_tickets").update(ticketUpdate).eq("id", ticket.id);
        if (updateError) throw updateError;
        await audit(admin, req, "whatsapp_customer_support_reply_added", ticket.id, { tenant_id: customer.tenant_id, customer_user_id: customer.id, message_id: data.id, previous_status: ticket.status, status: nextStatus }).catch(() => {});
        await notifyStaff(admin, { ...ticket, status: nextStatus }, "customer_support_customer_replied", `Customer replied to ${ticket.ticket_number}`, message.slice(0, 220), "info", ticket.assigned_to_app_user_id || null).catch((error) => console.warn("Support notification failed", error.message));
        return json(req, { success: true, messageId: data.id, status: nextStatus });
      }
      if (action === "customer_close") { const now = new Date().toISOString(); await admin.from("whatsapp_platform_support_tickets").update({ status: "closed", closed_at: now, auto_close_at: null, last_activity_at: now, updated_at: now }).eq("id", ticket.id); await audit(admin, req, "whatsapp_customer_support_ticket_closed", ticket.id, { tenant_id: customer.tenant_id, customer_user_id: customer.id }).catch(() => {}); await notifyStaff(admin, { ...ticket, status: "closed" }, "customer_support_customer_closed", `Customer closed ${ticket.ticket_number}`, ticket.subject, "success", ticket.assigned_to_app_user_id || null).catch((error) => console.warn("Support notification failed", error.message)); return json(req, { success: true }); }
    }
    if (STAFF_ACTIONS.has(action)) {
      const staff = await staffSession(req);
      if (action === "staff_list") return json(req, { ...(await listTickets(admin, null)), assignees: await listEligibleAssignees(admin), customers: await listCustomerUsers(admin) });
      if (action === "staff_create") {
        if (!staff.canEdit) throw new Error("Edit access is required.");
        const customerUserId = uuid(body.customerUserId);
        const { data: customer, error: customerError } = await admin.from("whatsapp_platform_users").select("id,tenant_id,display_name,email,status").eq("id", customerUserId).eq("status", "active").single();
        if (customerError || !customer) throw new Error("Select an active customer.");
        const category = ["technical","billing","onboarding","templates","flows","api_webhooks","account_access","other"].includes(body.category) ? body.category : "technical";
        const priority = ["low","normal","high","urgent"].includes(body.priority) ? body.priority : "normal";
        const subject = text(body.subject, 180), description = bodyText(body.description);
        if (subject.length < 5 || description.length < 10) throw new Error("Enter a subject and a clear description.");
        const ticketNumber = `WPS-${new Date().toISOString().slice(0,10).replace(/-/g, "")}-${randomCode()}`;
        const now = new Date().toISOString();
        const { data, error } = await admin.from("whatsapp_platform_support_tickets").insert({ ticket_number: ticketNumber, tenant_id: customer.tenant_id, created_by_user_id: customer.id, assigned_to_app_user_id: staff.id, category, priority, subject, description, source_url: supportAdminPath("new"), safe_environment: { created_on_behalf: true }, ...sla(priority), first_responded_at: now, last_support_reply_at: now, auto_close_at: new Date(Date.now() + CUSTOMER_REPLY_TIMEOUT_MS).toISOString(), last_activity_at: now }).select("id").single();
        if (error) throw error;
        await admin.from("whatsapp_platform_support_messages").insert({ ticket_id: data.id, app_user_id: staff.id, body: description, is_internal: false });
        const ticket = await getTicket(admin, data.id);
        await notifyCustomer(admin, ticket, "support_ticket_opened_by_staff", `Support opened ${ticket.ticket_number}`, "We opened this ticket on your behalf. Reply within 48 hours if we need more information.", "info", "staff-created").catch((error) => console.warn("Support notification failed", error.message));
        background(sendSupportEmail(admin, ticket, "support_replied"));
        await audit(admin, req, "whatsapp_customer_support_ticket_created_by_staff", ticket.id, { tenant_id: customer.tenant_id, customer_user_id: customer.id, ticket_number: ticket.ticket_number }, staff.id).catch(() => {});
        return json(req, { ticket: publicTicket(ticket), emailQueued: true });
      }
      if (["staff_update_customer", "staff_invite_customer_user", "staff_update_customer_user", "staff_delete_customer_user"].includes(action)) {
        if (!staff.canEdit) throw new Error("Edit access is required.");
        const tenantId = uuid(body.tenantId);
        const { data: tenant, error: tenantError } = await admin.from("whatsapp_platform_tenants").select("id,name,owner_email,status").eq("id", tenantId).single();
        if (tenantError || !tenant) throw new Error("Customer workspace not found.");
        if (action === "staff_update_customer") {
          const name = text(body.name, 120); if (name.length < 2) throw new Error("Enter the company name.");
          const ownerEmail = email(body.ownerEmail);
          const contactMobile = mobile(body.contactMobile);
          const { data: owner, error: ownerError } = await admin.from("whatsapp_platform_users").select("id,email").eq("tenant_id", tenantId).eq("role_code", "owner").limit(1).maybeSingle();
          if (ownerError) throw ownerError;
          const { error } = await admin.from("whatsapp_platform_tenants").update({ name, owner_email: ownerEmail, contact_mobile: contactMobile, updated_at: new Date().toISOString() }).eq("id", tenantId);
          if (error) throw error;
          if (owner?.id && owner.email !== ownerEmail) { const { error: userError } = await admin.from("whatsapp_platform_users").update({ email: ownerEmail, updated_at: new Date().toISOString() }).eq("id", owner.id); if (userError) throw userError; }
          await admin.from("audit_logs").insert({ event_type: "whatsapp_customer_account_contact_updated", action: "update_customer_contact", module_code: "whatsapp-platform", actor_app_user_id: staff.id, entity_type: "whatsapp_platform_tenant", entity_id: tenantId, details: { before: { name: tenant.name, owner_email: tenant.owner_email }, after: { name, owner_email: ownerEmail, contact_mobile: contactMobile } } });
          return json(req, { customer: await customerIntelligence(admin, tenantId) });
        }
        if (action === "staff_invite_customer_user") {
          const displayName = text(body.displayName, 100); if (displayName.length < 2) throw new Error("Enter the user's full name.");
          const userEmail = email(body.email);
          const roleCode = ["admin", "agent", "viewer"].includes(body.roleCode) ? body.roleCode : "agent";
          const { data: owner, error: ownerError } = await admin.from("whatsapp_platform_users").select("id").eq("tenant_id", tenantId).eq("role_code", "owner").eq("status", "active").limit(1).single();
          if (ownerError || !owner) throw new Error("An active workspace owner is required to issue an invitation.");
          const inviteToken = randomHex(32), expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
          const { data, error } = await admin.rpc("whatsapp_platform_create_invite", { p_tenant_id: tenantId, p_display_name: displayName, p_email: userEmail, p_role_code: roleCode, p_invite_token_hash: await sha256(inviteToken), p_invite_expires_at: expiresAt, p_invited_by_user_id: owner.id });
          if (error) throw error;
          const row = Array.isArray(data) ? data[0] : data;
          const inviteUrl = `https://www.varadanexus.com/whatsapp-platform/access/?invite=${inviteToken}`;
          await sendTeamInviteEmail({ email: userEmail, displayName, companyName: tenant.name, roleCode, inviteUrl });
          await admin.from("audit_logs").insert({ event_type: "whatsapp_customer_user_invited_by_staff", action: "invite_customer_user", module_code: "whatsapp-platform", actor_app_user_id: staff.id, entity_type: "whatsapp_platform_user", entity_id: row?.user_id, details: { tenant_id: tenantId, email: userEmail, role_code: roleCode } });
          return json(req, { customer: await customerIntelligence(admin, tenantId), emailSent: true });
        }
        const userId = uuid(body.userId);
        const { data: user, error: userError } = await admin.from("whatsapp_platform_users").select("id,display_name,email,role_code,status").eq("id", userId).eq("tenant_id", tenantId).single();
        if (userError || !user) throw new Error("Customer user not found.");
        if (action === "staff_delete_customer_user") {
          if (user.role_code === "owner") throw new Error("The workspace owner cannot be deleted.");
          const { error } = await admin.from("whatsapp_platform_users").delete().eq("id", userId).eq("tenant_id", tenantId); if (error) throw error;
          await admin.from("audit_logs").insert({ event_type: "whatsapp_customer_user_deleted_by_staff", action: "delete_customer_user", module_code: "whatsapp-platform", actor_app_user_id: staff.id, entity_type: "whatsapp_platform_user", entity_id: userId, details: { tenant_id: tenantId, email: user.email, role_code: user.role_code } });
          return json(req, { customer: await customerIntelligence(admin, tenantId) });
        }
        const displayName = text(body.displayName, 100); if (displayName.length < 2) throw new Error("Enter the user's full name.");
        const userEmail = email(body.email);
        const roleCode = user.role_code === "owner" ? "owner" : (["admin", "agent", "viewer"].includes(body.roleCode) ? body.roleCode : user.role_code);
        const userStatus = user.role_code === "owner" ? "active" : (["active", "invited", "disabled"].includes(body.status) ? body.status : user.status);
        const { error } = await admin.from("whatsapp_platform_users").update({ display_name: displayName, email: userEmail, role_code: roleCode, status: userStatus, updated_at: new Date().toISOString() }).eq("id", userId).eq("tenant_id", tenantId); if (error) throw error;
        if (user.role_code === "owner") await admin.from("whatsapp_platform_tenants").update({ owner_email: userEmail, updated_at: new Date().toISOString() }).eq("id", tenantId);
        if (userStatus === "disabled") await admin.from("whatsapp_platform_sessions").update({ revoked_at: new Date().toISOString() }).eq("user_id", userId).is("revoked_at", null);
        await admin.from("audit_logs").insert({ event_type: "whatsapp_customer_user_updated_by_staff", action: "update_customer_user", module_code: "whatsapp-platform", actor_app_user_id: staff.id, entity_type: "whatsapp_platform_user", entity_id: userId, details: { tenant_id: tenantId, before: user, after: { display_name: displayName, email: userEmail, role_code: roleCode, status: userStatus } } });
        return json(req, { customer: await customerIntelligence(admin, tenantId) });
      }
      const ticket = await getTicket(admin, uuid(body.ticketId));
      if (action === "staff_thread") return json(req, { ticket: publicTicket(ticket), messages: await ticketThread(admin, ticket, true), customer: await customerIntelligence(admin, ticket.tenant_id) });
      if (!staff.canEdit) throw new Error("Edit access is required.");
      if (action === "staff_reply") { const message = bodyText(body.message), internal = body.internal === true; if (!message) throw new Error("Write a response."); const now = new Date().toISOString(); const autoCloseAt = new Date(Date.now() + CUSTOMER_REPLY_TIMEOUT_MS).toISOString(); const { data, error } = await admin.from("whatsapp_platform_support_messages").insert({ ticket_id: ticket.id, app_user_id: staff.id, body: message, is_internal: internal }).select("id").single(); if (error) throw error; await admin.from("whatsapp_platform_support_tickets").update({ status: internal ? ticket.status : "waiting_on_customer", assigned_to_app_user_id: ticket.assigned_to_app_user_id || staff.id, first_responded_at: ticket.first_responded_at || (internal ? null : now), last_support_reply_at: internal ? ticket.last_support_reply_at : now, auto_close_at: internal ? ticket.auto_close_at : autoCloseAt, last_activity_at: now, updated_at: now }).eq("id", ticket.id); await audit(admin, req, internal ? "whatsapp_customer_support_internal_note_added" : "whatsapp_customer_support_response_added", ticket.id, { tenant_id: ticket.tenant_id, message_id: data.id, auto_close_at: internal ? ticket.auto_close_at : autoCloseAt }, staff.id).catch(() => {}); if (!internal) { const updated = await getTicket(admin, ticket.id); await notifyCustomer(admin, updated, "support_replied", `Support replied to ${updated.ticket_number}`, `${message.slice(0, 180)} Reply within 48 hours to keep this ticket open.`, "info", `reply:${data.id}`).catch((error) => console.warn("Support notification failed", error.message)); background(sendSupportEmail(admin, updated, "support_replied", data.id)); } return json(req, { success: true, messageId: data.id, status: internal ? ticket.status : "waiting_on_customer", autoCloseAt: internal ? ticket.auto_close_at : autoCloseAt, emailQueued: !internal }); }
      if (action === "staff_update") { const now = new Date().toISOString(); const update: any = { updated_at: now, last_activity_at: now }; if (["open","acknowledged","in_progress","waiting_on_customer","resolved","closed","reopened"].includes(body.status)) { update.status = body.status; update.auto_close_at = body.status === "waiting_on_customer" ? (ticket.auto_close_at || new Date(Date.now() + CUSTOMER_REPLY_TIMEOUT_MS).toISOString()) : null; } if (["low","normal","high","urgent"].includes(body.priority)) Object.assign(update, { priority: body.priority, ...sla(body.priority) }); if (body.assignToMe === true) update.assigned_to_app_user_id = staff.id; if (body.clearAssignee === true || body.assignedToAppUserId === "") update.assigned_to_app_user_id = null; if (body.assignedToAppUserId) { const requestedAssignee = uuid(body.assignedToAppUserId); const assignees = await listEligibleAssignees(admin); if (!assignees.some((user: any) => user.id === requestedAssignee)) throw new Error("Select an active user with WhatsApp Platform access."); update.assigned_to_app_user_id = requestedAssignee; } if (update.status === "resolved") update.resolved_at = now; if (update.status === "closed") update.closed_at = now; const statusChanged = update.status && update.status !== ticket.status; const { error } = await admin.from("whatsapp_platform_support_tickets").update(update).eq("id", ticket.id); if (error) throw error; let statusMessageId = null; if (statusChanged && ["resolved", "closed"].includes(update.status)) statusMessageId = await addStatusMessage(admin, ticket, update.status, staff.id); const updated = await getTicket(admin, ticket.id); await audit(admin, req, "whatsapp_customer_support_ticket_updated", ticket.id, { tenant_id: ticket.tenant_id, before: { status: ticket.status, priority: ticket.priority, assignee: ticket.assigned_to_app_user_id }, after: { status: updated.status, priority: updated.priority, assignee: updated.assigned_to_app_user_id } }, staff.id).catch(() => {}); if (statusChanged) { await notifyCustomer(admin, updated, "support_status_changed", `${updated.ticket_number} is ${updated.status.replaceAll("_", " ")}`, ["resolved", "closed"].includes(updated.status) ? closureMessage(updated.status) : updated.subject, ["resolved", "closed"].includes(updated.status) ? "success" : "info", `status:${updated.status}:${updated.updated_at}`).catch((error) => console.warn("Support notification failed", error.message)); } if (updated.assigned_to_app_user_id && updated.assigned_to_app_user_id !== ticket.assigned_to_app_user_id) { await notifyStaff(admin, updated, "customer_support_ticket_assigned", `${updated.ticket_number} assigned to you`, updated.subject, updated.priority === "urgent" ? "error" : "info", updated.assigned_to_app_user_id).catch((error) => console.warn("Support assignment notification failed", error.message)); } if (statusChanged && updated.status === "resolved") background(sendSupportEmail(admin, updated, "ticket_resolved", statusMessageId)); if (statusChanged && updated.status === "closed") background(sendSupportEmail(admin, updated, "ticket_closed", statusMessageId)); return json(req, { ticket: publicTicket(updated) }); }
    }
    return json(req, { error: "Unsupported support action." }, 400);
  } catch (error) { const message = String(error?.message || "Support request failed."); return json(req, { error: message }, /Unauthorized|Authentication/.test(message) ? 401 : /required/.test(message) ? 403 : 400); }
});
