import { getSupabaseClient } from "../config/supabase.js";

function db() { return getSupabaseClient(); }
function arr(value) { return Array.isArray(value) ? value : []; }
async function run(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data;
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

export async function signOutMarketingPortal() { await db().auth.signOut(); }

export async function listMarketingClients() {
  return arr(await run(db().from("marketing_clients").select("*").order("created_at", { ascending: false })));
}
export async function listMarketingVendors() {
  return arr(await run(db().from("marketing_vendors").select("*").order("created_at", { ascending: false })));
}
export async function listMarketingProjects() {
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
  return arr(await run(db().from("marketing_project_assignments").select("*, marketing_vendors(vendor_code,legal_name,internal_alias,contact_name), marketing_projects(project_code,title)").order("assigned_at", { ascending: false })));
}
export async function listMarketingFinances() {
  return arr(await run(db().from("marketing_project_finance").select("*")));
}
export async function listMarketingDeliverables(projectId = null) {
  let query = db().from("marketing_deliverables").select("*").order("sort_order").order("due_date");
  if (projectId) query = query.eq("project_id", projectId);
  return arr(await run(query));
}
export async function listMarketingQueries(projectId = null) {
  let query = db().from("marketing_queries").select("*").order("last_message_at", { ascending: false });
  if (projectId) query = query.eq("project_id", projectId);
  return arr(await run(query));
}
export async function listMarketingMessages(queryId) {
  return arr(await run(db().from("marketing_query_messages").select("*").eq("query_id", queryId).order("created_at")));
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
  return run(db().from("marketing_deliverables").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id));
}
export async function updateMarketingAssignment(id, patch) {
  return run(db().from("marketing_project_assignments").update(patch).eq("id", id));
}
export async function createMarketingQuery(payload) {
  const query = await run(db().from("marketing_queries").insert({
    query_number: "", project_id: payload.projectId, subject: payload.subject,
    category: payload.category || "general", priority: payload.priority || "normal"
  }).select().single());
  if (payload.message) await addMarketingMessage(query.id, payload.message);
  return query;
}
export async function addMarketingMessage(queryId, body) {
  return run(db().from("marketing_query_messages").insert({ query_id: queryId, body }).select().single());
}
export async function updateMarketingQuery(id, patch) {
  const data = { ...patch, updated_at: new Date().toISOString() };
  if (patch.status === "resolved") data.resolved_at = new Date().toISOString();
  return run(db().from("marketing_queries").update(data).eq("id", id));
}
export function subscribeToMarketingQueries(onChange) {
  return db().channel(`marketing-queries-${crypto.randomUUID()}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "marketing_queries" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "marketing_query_messages" }, onChange)
    .subscribe();
}
export async function unsubscribeMarketing(channel) { if (channel) await db().removeChannel(channel); }
