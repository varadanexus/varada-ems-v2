import { getSupabaseClient } from "../config/supabase.js";
import { notifyMarketingWhatsAppSafely } from "./marketing-whatsapp-api.js";

function db() { return getSupabaseClient(); }
function arr(value) { return Array.isArray(value) ? value : []; }
const EXTERNAL_SESSION_KEY = "ems_external_portal_session";
function externalPortalSession() {
  try { return JSON.parse(localStorage.getItem(EXTERNAL_SESSION_KEY) || "null"); } catch { return null; }
}
function externalPortalToken() { return externalPortalSession()?.sessionToken || null; }
export function getMarketingPortalSessionToken() { return externalPortalToken(); }
async function run(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}
async function portalRead(resource, id = null) {
  return run(db().rpc("marketing_portal_read", {
    p_session_token: externalPortalToken(), p_resource: resource, p_id: id
  }));
}
async function portalWrite(action, id = null, payload = {}) {
  return run(db().rpc("marketing_portal_write", {
    p_session_token: externalPortalToken(), p_action: action, p_id: id, p_payload: payload
  }));
}
async function clientBillingRead(resource) {
  return run(db().rpc("marketing_client_portal_billing", {
    p_session_token: externalPortalToken(), p_resource: resource
  }));
}
async function vendorFinanceRead(resource) {
  return run(db().rpc("marketing_vendor_portal_finance", {
    p_session_token: externalPortalToken(), p_resource: resource
  }));
}

export function isMarketingSchemaMissing(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || error || "").toLowerCase();
  return code === "PGRST205" || code === "42P01" ||
    (message.includes("schema cache") && message.includes("marketing_")) ||
    (message.includes("could not find") && message.includes("marketing_"));
}

export function marketingSetupMessage(error) {
  if (isMarketingSchemaMissing(error)) {
    return "The Marketing database setup is pending. Apply migration 20260713055323_marketing_client_vendor_portals.sql, then refresh this page.";
  }
  return error?.message || "The delivery workspace could not be loaded.";
}

export async function getMarketingIdentity() {
  if (externalPortalToken()) return portalRead("identity");
  const { data: { session } } = await db().auth.getSession();
  if (!session?.user) return null;
  const [clientRows, vendorRows] = await Promise.all([
    run(db().from("marketing_clients").select("*").eq("auth_user_id", session.user.id).limit(1)),
    run(db().from("marketing_vendors").select("*").eq("auth_user_id", session.user.id).limit(1))
  ]);
  if (clientRows?.[0]) return { kind: "client", profile: clientRows[0], user: session.user };
  if (vendorRows?.[0]) return { kind: "vendor", profile: vendorRows[0], user: session.user };
  return { kind: "staff", profile: null, user: session.user };
}

export async function signInMarketingPortal(email, password, expectedKind) {
  const { data, error } = await db().auth.signInWithPassword({ email, password });
  if (error) throw error;
  const identity = await getMarketingIdentity();
  if (!identity || identity.kind === "staff" || (expectedKind && identity.kind !== expectedKind)) {
    await db().auth.signOut();
    throw new Error(`This account does not have ${expectedKind || "Marketing portal"} access.`);
  }
  return identity;
}

export async function signOutMarketingPortal() {
  const token = externalPortalToken();
  if (token) {
    try { await run(db().rpc("external_portal_logout", { p_session_token: token })); } finally {
      try { localStorage.removeItem(EXTERNAL_SESSION_KEY); } catch {}
    }
    return;
  }
  await db().auth.signOut();
}

export async function listMarketingClients() {
  return arr(await run(db().from("marketing_clients").select("*").order("created_at", { ascending: false })));
}
export async function listMarketingVendors() {
  return arr(await run(db().from("marketing_vendors").select("*").order("created_at", { ascending: false })));
}
export async function listMarketingProjects() {
  if (externalPortalToken()) return arr(await portalRead("projects"));
  return arr(await run(db().from("marketing_projects").select("*, marketing_clients(company_name,contact_name,email)").order("created_at", { ascending: false })));
}
export async function completeMarketingProject(project) {
  const now = new Date().toISOString();
  if (project.ds_project_id) {
    return run(db().from("ds_projects").update({ status: "completed", updated_at: now }).eq("id", project.ds_project_id).select().single());
  }
  return run(db().from("marketing_projects").update({ status: "completed", updated_at: now }).eq("id", project.id).select().single());
}
export async function listMarketingAssignments() {
  if (externalPortalToken()) return arr(await portalRead("assignments"));
  return arr(await run(db().from("marketing_project_assignments").select("*, marketing_vendors(vendor_code,legal_name,internal_alias,contact_name,gstin,vendor_type), marketing_projects(project_code,title,ds_project_id)").order("assigned_at", { ascending: false })));
}
export async function assignMarketingVendor(projectId, vendorId) {
  const assignment = await run(db().from("marketing_project_assignments").upsert({
    project_id: projectId,
    vendor_id: vendorId,
    assignment_status: "assigned",
    assigned_at: new Date().toISOString(),
    accepted_at: null
  }, { onConflict: "project_id,vendor_id" }).select("*, marketing_vendors(vendor_code,legal_name,internal_alias,contact_name,gstin,vendor_type)").single());
  await notifyMarketingWhatsAppSafely("vendor_project_assigned", assignment.id);
  return assignment;
}
export async function removeMarketingAssignment(id) {
  return run(db().from("marketing_project_assignments").delete().eq("id", id));
}
export async function listMarketingFinances() {
  return arr(await run(db().from("marketing_project_finance").select("*")));
}
export async function listMarketingDeliverables(projectId = null) {
  if (externalPortalToken()) return arr(await portalRead("deliverables", projectId));
  let query = db().from("marketing_deliverables").select("*").order("sort_order").order("due_date");
  if (projectId) query = query.eq("project_id", projectId);
  return arr(await run(query));
}
export async function listMarketingQueries(projectId = null) {
  if (externalPortalToken()) return arr(await portalRead("queries", projectId));
  let query = db().from("marketing_queries").select("*").order("last_message_at", { ascending: false });
  if (projectId) query = query.eq("project_id", projectId);
  return arr(await run(query));
}
export async function listMarketingMessages(queryId) {
  if (externalPortalToken()) return arr(await portalRead("messages", queryId));
  return arr(await run(db().from("marketing_query_messages").select("*").eq("query_id", queryId).order("created_at")));
}
export async function listMarketingClientInvoices() {
  if (!externalPortalToken()) return [];
  return arr(await clientBillingRead("invoices"));
}
export async function listMarketingClientPayments() {
  if (!externalPortalToken()) return [];
  return arr(await clientBillingRead("payments"));
}
export async function listMarketingVendorInvoices() {
  if (!externalPortalToken()) return [];
  return arr(await vendorFinanceRead("invoices"));
}
export async function listMarketingVendorPayments() {
  if (!externalPortalToken()) return [];
  return arr(await vendorFinanceRead("payments"));
}
export async function listMarketingVendorInvoiceSubmissions() {
  return arr(await run(db().from("marketing_vendor_invoices").select(
    "*, marketing_vendors(vendor_code,legal_name,gstin,contact_name), marketing_projects(project_code,title,ds_project_id)"
  ).order("created_at", { ascending: false })));
}
export async function reviewMarketingVendorInvoice(id, status, reviewNote = "") {
  const result = await run(db().rpc("marketing_review_vendor_invoice", {
    p_invoice_id: id, p_status: status, p_review_note: reviewNote || null
  }));
  await notifyMarketingWhatsAppSafely("vendor_invoice_status", id);
  return result;
}

async function nextCode(prefix, table, column) {
  return run(db().rpc("marketing_next_code", { p_prefix: prefix, p_table: table, p_column: column }));
}
function marketingVendorRow(payload) {
  return {
    legal_name: payload.legalName, contact_name: payload.contactName,
    vendor_type: payload.vendorType === "freelancer" ? "freelancer" : "firm",
    internal_alias: payload.internalAlias || "Varada Nexus Delivery Team", email: payload.email || null,
    phone: payload.phone || null,
    gstin: String(payload.gstin || "").trim().toUpperCase() || null,
    pan: String(payload.pan || "").trim().toUpperCase() || null,
    legal_address: String(payload.legalAddress || "").trim() || null,
    city: String(payload.city || "").trim() || null,
    state: String(payload.state || "").trim() || null,
    postal_code: String(payload.postalCode || "").trim() || null,
    specialties: String(payload.specialties || "").split(",").map((v) => v.trim()).filter(Boolean),
    updated_at: new Date().toISOString()
  };
}
export async function createMarketingVendor(payload) {
  const vendorCode = await nextCode("MV", "marketing_vendors", "vendor_code");
  return run(db().from("marketing_vendors").insert({
    ...marketingVendorRow(payload), vendor_code: vendorCode, auth_user_id: payload.authUserId || null
  }).select().single());
}
export async function updateMarketingVendor(id, payload) {
  return run(db().from("marketing_vendors").update(marketingVendorRow(payload)).eq("id", id).select().single());
}
export async function deleteMarketingVendor(id) {
  return run(db().rpc("marketing_delete_vendor", { p_vendor_id: id }));
}
export async function createMarketingDeliverable(payload) {
  return run(db().from("marketing_deliverables").insert({
    project_id: payload.projectId, title: payload.title, description: payload.description || null,
    due_date: payload.dueDate || null, client_visible: payload.clientVisible !== false
  }).select().single());
}
export async function updateMarketingDeliverable(id, patch) {
  if (externalPortalToken()) return portalWrite("update_deliverable", id, patch);
  return run(db().from("marketing_deliverables").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id));
}
export async function updateMarketingAssignment(id, patch) {
  if (externalPortalToken()) return portalWrite("update_assignment", id, patch);
  return run(db().from("marketing_project_assignments").update(patch).eq("id", id));
}
export async function createMarketingQuery(payload) {
  let query;
  if (externalPortalToken()) {
    query = await portalWrite("create_query", null, payload);
    if (payload.message) await portalWrite("add_message", query.id, { body: payload.message });
  } else {
    query = await run(db().from("marketing_queries").insert({
      query_number: "", project_id: payload.projectId, subject: payload.subject,
      category: payload.category || "general", priority: payload.priority || "normal"
    }).select().single());
    if (payload.message) await addMarketingMessage(query.id, payload.message, { suppressWhatsApp: true });
  }
  await notifyMarketingWhatsAppSafely("query_raised", query.id);
  return query;
}
export async function addMarketingMessage(queryId, body, { suppressWhatsApp = false } = {}) {
  const message = externalPortalToken()
    ? await portalWrite("add_message", queryId, { body })
    : await run(db().from("marketing_query_messages").insert({ query_id: queryId, body }).select().single());
  if (!suppressWhatsApp) await notifyMarketingWhatsAppSafely("query_reply", queryId);
  return message;
}
export async function updateMarketingQuery(id, patch) {
  if (externalPortalToken()) {
    if (patch.status !== "resolved") throw new Error("Portal users can only resolve a query.");
    return portalWrite("resolve_query", id, patch);
  }
  const data = { ...patch, updated_at: new Date().toISOString() };
  if (patch.status === "resolved") data.resolved_at = new Date().toISOString();
  return run(db().from("marketing_queries").update(data).eq("id", id));
}
export function subscribeToMarketingQueries(onChange) {
  if (externalPortalToken()) {
    return { portalTimer: window.setInterval(onChange, 10000) };
  }
  return db().channel(`marketing-queries-${crypto.randomUUID()}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "marketing_queries" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "marketing_query_messages" }, onChange)
    .subscribe();
}
export async function unsubscribeMarketing(channel) {
  if (channel?.portalTimer) { window.clearInterval(channel.portalTimer); return; }
  if (channel) await db().removeChannel(channel);
}
