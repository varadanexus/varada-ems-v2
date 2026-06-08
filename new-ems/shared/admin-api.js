import { getSupabaseClient } from "../config/supabase.js";

function debugLog(message, data = null) {
  if (!window.EMS_DEBUG_AUTH_FLOW) return;
  if (data === null) {
    console.info(`[EMS_DEBUG] ${message}`);
    return;
  }
  console.info(`[EMS_DEBUG] ${message}`, data);
}

export async function getAppUserByAuthId(authUserId) {
  debugLog("lookup app_users by auth_user_id", { authUserId });
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("app_users")
    .select("id,auth_user_id,email,display_name,status,tenant_id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error) throw error;
  debugLog("app_users lookup result", {
    found: Boolean(data),
    appUserId: data?.id || null,
    status: data?.status || null,
    email: data?.email || null
  });
  return data;
}

export async function getUserRoleCodes(appUserId) {
  debugLog("lookup user_roles", { appUserId });
  const client = getSupabaseClient();
  const { data: userRoles, error } = await client
    .from("user_roles")
    .select("role_id")
    .eq("user_id", appUserId);
  if (error) throw error;

  const roleIds = (userRoles || []).map((x) => x.role_id).filter((v) => v !== null && v !== undefined);
  if (!roleIds.length) {
    debugLog("roles lookup result", { roleCodes: [] });
    return [];
  }

  const { data: roles, error: roleErr } = await client
    .from("roles")
    .select("id,code")
    .in("id", roleIds);
  if (roleErr) throw roleErr;

  const roleCodes = (roles || []).map((r) => r.code).filter(Boolean);
  debugLog("roles lookup result", { roleCodes });
  return roleCodes;
}

export async function getAllowedModulesForRoles(roleCodes) {
  if (!roleCodes?.length) return [];
  debugLog("lookup permissions for role codes", { roleCodes });
  const client = getSupabaseClient();

  const { data: roles, error: roleErr } = await client
    .from("roles")
    .select("id,code")
    .in("code", roleCodes);
  if (roleErr) throw roleErr;

  const roleIds = (roles || []).map((r) => r.id);
  if (!roleIds.length) return [];

  const { data: grants, error: grantErr } = await client
    .from("role_permissions")
    .select("allow, permission_id")
    .in("role_id", roleIds)
    .eq("allow", true);
  if (grantErr) throw grantErr;

  const permissionIds = (grants || [])
    .map((g) => g.permission_id)
    .filter((v) => v !== null && v !== undefined);
  if (!permissionIds.length) {
    debugLog("permissions lookup result", { allowedModules: [] });
    return [];
  }

  const { data: permissions, error: permErr } = await client
    .from("permissions")
    .select("id,module_code,action_code")
    .in("id", permissionIds);
  if (permErr) throw permErr;

  const moduleSet = new Set();
  (permissions || []).forEach((p) => {
    if (p?.action_code === "view" && p?.module_code) moduleSet.add(p.module_code);
  });
  const allowedModules = Array.from(moduleSet);
  debugLog("permissions lookup result", { allowedModules });
  return allowedModules;
}

export async function listUsers() {
  const client = getSupabaseClient();
  const { data: users, error } = await client
    .from("app_users")
    .select("id,email,display_name,status,is_locked,last_login_at")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const userIds = (users || []).map((u) => u.id);
  if (!userIds.length) return [];

  const [{ data: userRoleRows, error: urErr }, { data: userDivisionRows, error: udErr }] = await Promise.all([
    client.from("user_roles").select("user_id,role_id").in("user_id", userIds),
    client.from("user_divisions").select("user_id,division_id").in("user_id", userIds)
  ]);
  if (urErr) throw urErr;
  if (udErr) throw udErr;

  const roleIds = Array.from(new Set((userRoleRows || []).map((r) => r.role_id).filter((v) => v !== null && v !== undefined)));
  const divisionIds = Array.from(new Set((userDivisionRows || []).map((d) => d.division_id).filter((v) => v !== null && v !== undefined)));

  const [{ data: roles, error: rErr }, { data: divisions, error: dErr }] = await Promise.all([
    roleIds.length ? client.from("roles").select("id,code,name").in("id", roleIds) : Promise.resolve({ data: [], error: null }),
    divisionIds.length ? client.from("divisions").select("id,code,name").in("id", divisionIds) : Promise.resolve({ data: [], error: null })
  ]);
  if (rErr) throw rErr;
  if (dErr) throw dErr;

  const roleById = new Map((roles || []).map((r) => [String(r.id), r]));
  const divisionById = new Map((divisions || []).map((d) => [String(d.id), d]));

  return (users || []).map((u) => {
    const userRoles = (userRoleRows || [])
      .filter((ur) => ur.user_id === u.id)
      .map((ur) => ({ roles: roleById.get(String(ur.role_id)) || null }));

    const userDivisions = (userDivisionRows || [])
      .filter((ud) => ud.user_id === u.id)
      .map((ud) => ({ divisions: divisionById.get(String(ud.division_id)) || null }));

    return {
      ...u,
      user_roles: userRoles,
      user_divisions: userDivisions
    };
  });
}

export async function updateUserStatus(userId, status) {
  const client = getSupabaseClient();
  const { error } = await client
    .from("app_users")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) throw error;
}

export async function updateUserSecurity(userId, updates = {}) {
  const client = getSupabaseClient();
  const payload = { ...updates, updated_at: new Date().toISOString() };
  const { error } = await client.from("app_users").update(payload).eq("id", userId);
  if (error) throw error;
}

export async function markUserLogin(authUserId) {
  const client = getSupabaseClient();
  const { error } = await client
    .from("app_users")
    .update({ last_login_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("auth_user_id", authUserId);
  if (error) throw error;
}

export async function listRoles() {
  const client = getSupabaseClient();
  const { data, error } = await client.from("roles").select("id,code,name,is_active").order("name");
  if (error) throw error;
  return data || [];
}

export async function listDivisions() {
  const client = getSupabaseClient();
  const { data, error } = await client.from("divisions").select("id,code,name,is_active").order("name");
  if (error) throw error;
  return data || [];
}

export async function getDivisionByCode(code) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("divisions")
    .select("id,code,name,is_active")
    .eq("code", code)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function resolveWorkspaceDivision(workspace) {
  if (workspace === "transportation") {
    return await getDivisionByCode("TRANSPORT");
  }
  return null;
}

export async function assignUserRole(userId, roleId) {
  const client = getSupabaseClient();
  const { error: delErr } = await client.from("user_roles").delete().eq("user_id", userId);
  if (delErr) throw delErr;
  const { error } = await client.from("user_roles").insert({ user_id: userId, role_id: roleId });
  if (error) throw error;
}

export async function assignUserDivision(userId, divisionId) {
  const client = getSupabaseClient();
  const { error: delErr } = await client.from("user_divisions").delete().eq("user_id", userId);
  if (delErr) throw delErr;
  if (!divisionId) return;
  const { error } = await client.from("user_divisions").insert({ user_id: userId, division_id: divisionId, scope: "assigned" });
  if (error) throw error;
}

export async function provisionUserViaEdge({ email, password, displayName, roleCode, divisionCode }) {
  const client = getSupabaseClient();
  const { data } = await client.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("Missing session token");

  const fnUrl = `${window.EMS_RUNTIME_CONFIG?.supabaseUrl}/functions/v1/admin-provision-user`;
  const res = await fetch(fnUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: window.EMS_RUNTIME_CONFIG?.supabaseAnonKey || ""
    },
    body: JSON.stringify({ email, password, displayName, roleCode, divisionCode })
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || "Provisioning failed");
  return json;
}

export async function requestUserPasswordReset(targetEmail) {
  const client = getSupabaseClient();
  const { data } = await client.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("Missing session token");

  const fnUrl = `${window.EMS_RUNTIME_CONFIG?.supabaseUrl}/functions/v1/admin-provision-user`;
  const res = await fetch(fnUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: window.EMS_RUNTIME_CONFIG?.supabaseAnonKey || ""
    },
    body: JSON.stringify({ action: "reset_password", email: targetEmail })
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || "Password reset request failed");
  return json;
}

export async function listPermissions() {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("permissions")
    .select("id,module_code,action_code,label,is_active")
    .order("module_code");
  if (error) throw error;
  return data || [];
}

export async function listRolePermissions() {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("role_permissions")
    .select("id,allow,role_id,permission_id")
    .eq("allow", true);
  if (error) throw error;
  return data || [];
}

export async function setRolePermission(roleId, permissionId, allow) {
  const client = getSupabaseClient();
  const { data: existing, error: checkErr } = await client
    .from("role_permissions")
    .select("id")
    .eq("role_id", roleId)
    .eq("permission_id", permissionId)
    .maybeSingle();
  if (checkErr) throw checkErr;

  if (existing?.id) {
    const { error } = await client.from("role_permissions").update({ allow }).eq("id", existing.id);
    if (error) throw error;
    return;
  }

  const { error } = await client.from("role_permissions").insert({ role_id: roleId, permission_id: permissionId, allow });
  if (error) throw error;
}

export async function listSystemSettings() {
  const client = getSupabaseClient();
  const { data, error } = await client.from("system_settings").select("id,key,value,updated_at").order("key");
  if (error) throw error;
  return data || [];
}

export async function upsertSystemSetting(key, value, updatedBy = null) {
  const client = getSupabaseClient();
  const payload = { key, value, updated_by: updatedBy, updated_at: new Date().toISOString() };
  const { error } = await client.from("system_settings").upsert(payload, { onConflict: "key" });
  if (error) throw error;
}

export async function listAuditLogs(limit = 50) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("audit_logs")
    .select("id,event_type,action,module_code,entity_type,entity_id,details,before_data,after_data,user_agent,ip_address,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export const MASTER_TABLES = {
  clients: "master_clients",
  contractors: "master_contractors",
  transporters: "master_transporters",
  agents: "master_agents",
  commodities: "master_commodities",
  routes: "master_routes",
  units: "master_units",
  taxCodes: "master_tax_codes",
  documentTypes: "master_document_types",
  divisions: "divisions",
  transportTruckOwners: "transport_truck_owners",
  transportClients: "transport_clients",
  transportTransporters: "transport_transporters",
  transportAgents: "transport_agents",
  transportCommodities: "transport_commodities",
  transportTrucks: "transport_trucks",
  transportDrivers: "transport_drivers",
  transportRateMaster: "transport_rate_master",
  transportClientBills: "transport_client_bills",
  transportClientBillTrips: "transport_client_bill_trips",
  transportTransporterStatements: "transport_transporter_statements",
  transportTransporterStatementTrips: "transport_transporter_statement_trips",
  transportGstInvoices: "transport_gst_invoices",
  transportClientReceipts: "transport_client_receipts",
  transportTransporterPayments: "transport_transporter_payments",
  transportLedgerAccounts: "transport_ledger_accounts",
  transportLedgerEntries: "transport_ledger_entries",
  transportRouteMaster: "transport_route_master",
  transportClientMapping: "transport_client_mapping",
  transportTransporterMapping: "transport_transporter_mapping",
  transportTruckAgentCommissionMapping: "transport_truck_agent_commission_mapping"
};

export async function listMasterRecords(table, { search = "", page = 1, pageSize = 10 } = {}) {
  const client = getSupabaseClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const divisionId = arguments?.[1]?.divisionId || null;
  const searchColumns = arguments?.[1]?.searchColumns || ["name", "code"];

  let query = client.from(table).select("*", { count: "exact" }).is("deleted_at", null).order("created_at", { ascending: false });
  if (divisionId) query = query.eq("division_id", divisionId);
  if (search) {
    const orExpr = searchColumns.map((c) => `${c}.ilike.%${search}%`).join(",");
    query = query.or(orExpr);
  }

  const { data, error, count } = await query.range(from, to);
  if (error) throw error;
  return { rows: data || [], count: count || 0 };
}

export async function listActiveOptions(table, { labelField = "name", valueField = "id", divisionId = null } = {}) {
  const client = getSupabaseClient();
  let query = client.from(table).select(`${valueField},${labelField}`).is("deleted_at", null).eq("is_active", true).order(labelField);
  if (divisionId) query = query.eq("division_id", divisionId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((row) => ({ value: row[valueField], label: row[labelField] }));
}

export async function getTransporterByTruck(truckId) {
  if (!truckId) return null;
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("transport_trucks")
    .select("id,transporter_id,transport_transporter_id")
    .eq("id", truckId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  const resolvedTransporterId = data?.transport_transporter_id || data?.transporter_id || null;
  if (!resolvedTransporterId) return null;
  let transporterName = null;
  if (data?.transport_transporter_id) {
    const { data: transporterRow, error: transporterErr } = await client
      .from("transport_transporters")
      .select("id,name")
      .eq("id", data.transport_transporter_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (transporterErr) throw transporterErr;
    transporterName = transporterRow?.name || null;
  }
  return {
    transporter_id: resolvedTransporterId,
    transporter_name: transporterName
  };
}

export async function getActiveAgentByTruck(truckId, tripDate = null) {
  if (!truckId) return null;
  const client = getSupabaseClient();
  let query = client
    .from("transport_truck_agent_commission_mapping")
    .select("id,truck_id,transport_agent_id,effective_from,effective_to,transport_agents(id,name)")
    .eq("truck_id", truckId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("effective_from", { ascending: false })
    .limit(50);
  if (tripDate) {
    query = query.lte("effective_from", tripDate).or(`effective_to.is.null,effective_to.gte.${tripDate}`);
  }
  const { data, error } = await query;
  if (error) throw error;
  const row = (data || [])[0];
  if (!row?.transport_agent_id) return null;
  return {
    transport_agent_id: row.transport_agent_id,
    transport_agent_name: row.transport_agents?.name || null
  };
}

export async function findTransportRateForTrip({
  divisionId,
  tripDate,
  transportClientId,
  transportTransporterId,
  routeId,
  transportCommodityId,
  truckOwnerId = null,
  truckId = null
} = {}) {
  if (!divisionId || !tripDate || !transportClientId || !transportTransporterId || !routeId || !transportCommodityId) return null;
  const client = getSupabaseClient();
  let query = client
    .from("transport_rate_master")
    .select("id,division_id,transport_client_id,transport_transporter_id,route_id,transport_commodity_id,truck_owner_id,truck_id,client_rate_per_mt,transporter_rate_per_mt,rate_per_mt,effective_from,effective_to,is_active,deleted_at")
    .is("deleted_at", null)
    .eq("is_active", true)
    .eq("division_id", divisionId)
    .eq("transport_client_id", transportClientId)
    .eq("transport_transporter_id", transportTransporterId)
    .eq("route_id", routeId)
    .eq("transport_commodity_id", transportCommodityId)
    .lte("effective_from", tripDate)
    .or(`effective_to.is.null,effective_to.gte.${tripDate}`);

  const { data, error } = await query.limit(500);
  if (error) throw error;
  const rows = data || [];
  if (!rows.length) return null;

  const candidates = rows.filter((r) => {
    const truckMatch = !r.truck_id || String(r.truck_id) === String(truckId || "");
    const ownerMatch = !r.truck_owner_id || String(r.truck_owner_id) === String(truckOwnerId || "");
    return truckMatch && ownerMatch;
  });
  if (!candidates.length) return null;

  const score = (r) => (r.truck_id ? 3 : 0) + (r.truck_owner_id ? 2 : 0);
  candidates.sort((a, b) => {
    const sa = score(a), sb = score(b);
    if (sa !== sb) return sb - sa;
    const da = new Date(a.effective_from || "1970-01-01").getTime();
    const db = new Date(b.effective_from || "1970-01-01").getTime();
    return db - da;
  });

  const best = candidates[0];
  const clientRate = best.client_rate_per_mt ?? best.rate_per_mt ?? null;
  const transporterRate = best.transporter_rate_per_mt ?? best.rate_per_mt ?? null;
  if (clientRate === null || transporterRate === null) return null;
  return {
    id: best.id,
    client_rate_per_mt: Number(clientRate),
    transporter_rate_per_mt: Number(transporterRate),
    source: "RATE_MASTER"
  };
}

export async function existsActiveDuplicate(table, filters = {}, excludeId = null) {
  const client = getSupabaseClient();
  let query = client.from(table).select("id", { count: "exact", head: true }).is("deleted_at", null);
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") query = query.eq(k, v);
  });
  if (excludeId) query = query.neq("id", excludeId);
  const { count, error } = await query;
  if (error) throw error;
  return (count || 0) > 0;
}

export async function createMasterRecord(table, payload) {
  const client = getSupabaseClient();
  const { data, error } = await client.from(table).insert(payload).select("*").single();
  if (error) throw error;
  return data;
}

export async function updateMasterRecord(table, id, payload) {
  const client = getSupabaseClient();
  const { data, error } = await client.from(table).update({ ...payload, updated_at: new Date().toISOString() }).eq("id", id).select("*").single();
  if (error) throw error;
  return data;
}

export async function softDeleteMasterRecord(table, id) {
  const client = getSupabaseClient();
  const { error } = await client.from(table).update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export const TRIP_STATUS_FLOW = [
  "draft",
  "assigned",
  "dispatched",
  "loading",
  "loaded",
  "in_transit",
  "unloading",
  "completed",
  "financial_review"
];

export async function createTrip(payload) {
  const client = getSupabaseClient();
  const { data, error } = await client.from("transport_trips").insert(payload).select("*").single();
  if (error) throw error;
  return data;
}

export async function listTrips({ search = "", status = "", divisionId = null, page = 1, pageSize = 10 } = {}) {
  const client = getSupabaseClient();
  let query = client.from("transport_trips").select("*", { count: "exact" }).is("deleted_at", null).order("created_at", { ascending: false });
  if (divisionId) query = query.eq("division_id", divisionId);
  if (status) query = query.eq("status", status);
  if (search) query = query.or(`trip_no.ilike.%${search}%,notes.ilike.%${search}%`);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await query.range(from, to);
  if (error) throw error;
  return { rows: data || [], count: count || 0 };
}

export async function getTripById(id) {
  const client = getSupabaseClient();
  const { data, error } = await client.from("transport_trips").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateTrip(id, payload) {
  const client = getSupabaseClient();
  const { data, error } = await client.from("transport_trips").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", id).select("*").single();
  if (error) throw error;
  return data;
}

export async function softDeleteTrip(id) {
  const client = getSupabaseClient();
  const now = new Date().toISOString();
  const { error: tripErr } = await client.from("transport_trips").update({ deleted_at: now, updated_at: now }).eq("id", id);
  if (tripErr) throw tripErr;

  const { error: expErr } = await client
    .from("transport_trip_expenses")
    .update({ deleted_at: now, updated_at: now, is_active: false })
    .eq("trip_id", id)
    .is("deleted_at", null);
  if (expErr) throw expErr;

  const { error: docErr } = await client
    .from("transport_trip_documents")
    .update({ deleted_at: now, updated_at: now, is_active: false })
    .eq("trip_id", id)
    .is("deleted_at", null);
  if (docErr) throw docErr;
}

export async function addTripTimeline(payload) {
  const client = getSupabaseClient();
  const { data, error } = await client.from("transport_trip_timeline").insert(payload).select("*").single();
  if (error) throw error;
  return data;
}

export async function listTripTimeline(tripId) {
  const client = getSupabaseClient();
  const { data, error } = await client.from("transport_trip_timeline").select("*").eq("trip_id", tripId).order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function listTripOptions({ divisionId = null, limit = 200 } = {}) {
  const client = getSupabaseClient();
  let query = client
    .from("transport_trips")
    .select("id,trip_no,trip_date,status,transport_client_id,transport_transporter_id,truck_id,driver_id,route_id,transport_commodity_id,quantity_kg,quantity_mt,client_rate_per_mt,transporter_rate_per_mt,client_gross_amount,transporter_gross_amount,company_margin")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (divisionId) query = query.eq("division_id", divisionId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function createTripExpense(payload) {
  const client = getSupabaseClient();
  const { data, error } = await client.from("transport_trip_expenses").insert(payload).select("*").single();
  if (error) throw error;
  return data;
}

export async function listTripExpenses({ tripId, divisionId = null, search = "", category = "", fromDate = "", toDate = "", page = 1, pageSize = 20 } = {}) {
  const client = getSupabaseClient();
  let query = client
    .from("transport_trip_expenses")
    .select("*,transport_trips!inner(id,deleted_at)", { count: "exact" })
    .is("deleted_at", null)
    .is("transport_trips.deleted_at", null)
    .eq("trip_id", tripId)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (divisionId) query = query.eq("division_id", divisionId);
  if (category) query = query.eq("category", category);
  if (fromDate) query = query.gte("expense_date", fromDate);
  if (toDate) query = query.lte("expense_date", toDate);
  if (search) query = query.or(`expense_no.ilike.%${search}%,notes.ilike.%${search}%`);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await query.range(from, to);
  if (error) throw error;
  return { rows: data || [], count: count || 0 };
}

export async function listTransportClientBillableTrips({ divisionId = null, transportClientId = null } = {}) {
  if (!divisionId || !transportClientId) return [];
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("list_transport_client_billable_trips", {
    p_division_id: divisionId,
    p_transport_client_id: transportClientId
  });
  if (error) throw error;
  return data || [];
}

export async function createTransportClientBill({ divisionId = null, transportClientId = null, billDate = null, remarks = null, tripIds = [] } = {}) {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("create_transport_client_bill", {
    p_division_id: divisionId,
    p_transport_client_id: transportClientId,
    p_bill_date: billDate,
    p_remarks: remarks,
    p_trip_ids: tripIds
  });
  if (error) throw error;
  return Array.isArray(data) ? (data[0] || null) : data;
}

export async function listTransportClientBills({ divisionId = null, transportClientId = "", status = "", fromDate = "", toDate = "" } = {}) {
  const client = getSupabaseClient();
  let query = client
    .from("transport_client_bills")
    .select("id,bill_no,transport_client_id,bill_date,status,gross_total,support_deduction_total,net_receivable,remarks,created_at,updated_at,approved_at,transport_clients(id,name,company_name)")
    .is("deleted_at", null)
    .order("bill_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (divisionId) query = query.eq("division_id", divisionId);
  if (transportClientId) query = query.eq("transport_client_id", transportClientId);
  if (status) query = query.eq("status", status);
  if (fromDate) query = query.gte("bill_date", fromDate);
  if (toDate) query = query.lte("bill_date", toDate);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getTransportClientBillDetails(billId) {
  if (!billId) return null;
  const client = getSupabaseClient();
  const { data: bill, error: billError } = await client
    .from("transport_client_bills")
    .select("id,bill_no,transport_client_id,bill_date,status,gross_total,support_deduction_total,net_receivable,remarks,created_at,updated_at,approved_at,transport_clients(id,name,company_name)")
    .eq("id", billId)
    .is("deleted_at", null)
    .maybeSingle();
  if (billError) throw billError;
  if (!bill) return null;
  const { data: trips, error: tripsError } = await client
    .from("transport_client_bill_trips")
    .select("id,bill_id,trip_id,trip_no,trip_date,quantity_mt,client_rate_per_mt,client_gross_amount,support_deduction_amount,client_net_receivable,created_at")
    .eq("bill_id", billId)
    .is("deleted_at", null)
    .order("trip_date", { ascending: true })
    .order("trip_no", { ascending: true });
  if (tripsError) throw tripsError;
  return { ...bill, trip_lines: trips || [] };
}

export async function cancelTransportClientBill(billId) {
  if (!billId) throw new Error("billId is required");
  const client = getSupabaseClient();
  const { data: current, error: currentError } = await client
    .from("transport_client_bills")
    .select("id,status")
    .eq("id", billId)
    .is("deleted_at", null)
    .maybeSingle();
  if (currentError) throw currentError;
  if (!current) return null;
  if (current.status === "approved") throw new Error("Approved bill cannot be cancelled.");
  if (current.status === "cancelled") return null;
  const { data, error } = await client
    .from("transport_client_bills")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", billId)
    .is("deleted_at", null)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function approveTransportClientBill(billId) {
  if (!billId) throw new Error("billId is required");
  const client = getSupabaseClient();
  const { data: bill, error: billError } = await client
    .from("transport_client_bills")
    .select("id,status,gross_total,net_receivable")
    .eq("id", billId)
    .is("deleted_at", null)
    .maybeSingle();
  if (billError) throw billError;
  if (!bill) throw new Error("Bill not found.");
  if (bill.status === "cancelled") throw new Error("Cancelled bill cannot be approved.");
  if (bill.status === "approved") throw new Error("Bill is already approved.");
  const { count, error: countError } = await client
    .from("transport_client_bill_trips")
    .select("id", { count: "exact", head: true })
    .eq("bill_id", billId)
    .is("deleted_at", null);
  if (countError) throw countError;
  if (!count) throw new Error("Cannot approve empty bill.");
  if (Number(bill.gross_total || 0) <= 0 || Number(bill.net_receivable || 0) <= 0) throw new Error("Cannot approve bill with zero total.");
  const now = new Date().toISOString();
  const { data, error } = await client
    .from("transport_client_bills")
    .update({ status: "approved", approved_at: now, updated_at: now })
    .eq("id", billId)
    .eq("status", "draft")
    .is("deleted_at", null)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Only draft bills can be approved.");
  return data;
}

export async function listTransporterStatementableTrips({ divisionId = null, transportTransporterId = null } = {}) {
  if (!divisionId || !transportTransporterId) return [];
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("list_transport_transporter_statementable_trips", {
    p_division_id: divisionId,
    p_transport_transporter_id: transportTransporterId
  });
  if (error) throw error;
  return data || [];
}

export async function createTransporterStatement({ divisionId = null, transportTransporterId = null, statementDate = null, remarks = null, tripIds = [] } = {}) {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("create_transport_transporter_statement", {
    p_division_id: divisionId,
    p_transport_transporter_id: transportTransporterId,
    p_statement_date: statementDate,
    p_remarks: remarks,
    p_trip_ids: tripIds
  });
  if (error) throw error;
  return Array.isArray(data) ? (data[0] || null) : data;
}

export async function listTransporterStatements({ divisionId = null, transportTransporterId = "", status = "", fromDate = "", toDate = "" } = {}) {
  const client = getSupabaseClient();
  let query = client
    .from("transport_transporter_statements")
    .select("id,statement_no,transport_transporter_id,statement_date,status,gross_payable_total,support_deduction_total,net_payable_total,remarks,created_at,updated_at,approved_at,transport_transporters(id,name)")
    .is("deleted_at", null)
    .order("statement_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (divisionId) query = query.eq("division_id", divisionId);
  if (transportTransporterId) query = query.eq("transport_transporter_id", transportTransporterId);
  if (status) query = query.eq("status", status);
  if (fromDate) query = query.gte("statement_date", fromDate);
  if (toDate) query = query.lte("statement_date", toDate);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getTransporterStatementDetails(statementId) {
  if (!statementId) return null;
  const client = getSupabaseClient();
  const { data: header, error: headerError } = await client
    .from("transport_transporter_statements")
    .select("id,statement_no,transport_transporter_id,statement_date,status,gross_payable_total,support_deduction_total,net_payable_total,remarks,created_at,updated_at,approved_at,transport_transporters(id,name)")
    .eq("id", statementId)
    .is("deleted_at", null)
    .maybeSingle();
  if (headerError) throw headerError;
  if (!header) return null;
  const { data: lines, error: linesError } = await client
    .from("transport_transporter_statement_trips")
    .select("id,statement_id,trip_id,trip_no,trip_date,quantity_mt,transporter_rate_per_mt,transporter_gross_payable,support_deduction_amount,transporter_net_payable,created_at")
    .eq("statement_id", statementId)
    .is("deleted_at", null)
    .order("trip_date", { ascending: true })
    .order("trip_no", { ascending: true });
  if (linesError) throw linesError;
  return { ...header, trip_lines: lines || [] };
}

export async function approveTransporterStatement(statementId) {
  if (!statementId) throw new Error("statementId is required");
  const client = getSupabaseClient();
  const { data: statement, error: statementError } = await client
    .from("transport_transporter_statements")
    .select("id,status,gross_payable_total,net_payable_total")
    .eq("id", statementId)
    .is("deleted_at", null)
    .maybeSingle();
  if (statementError) throw statementError;
  if (!statement) throw new Error("Statement not found.");
  if (statement.status === "cancelled") throw new Error("Cancelled statement cannot be approved.");
  if (statement.status === "approved") throw new Error("Statement is already approved.");
  const { count, error: countError } = await client
    .from("transport_transporter_statement_trips")
    .select("id", { count: "exact", head: true })
    .eq("statement_id", statementId)
    .is("deleted_at", null);
  if (countError) throw countError;
  if (!count) throw new Error("Cannot approve empty statement.");
  if (Number(statement.gross_payable_total || 0) <= 0 || Number(statement.net_payable_total || 0) <= 0) throw new Error("Cannot approve statement with zero total.");
  const now = new Date().toISOString();
  const { data, error } = await client
    .from("transport_transporter_statements")
    .update({ status: "approved", approved_at: now, updated_at: now })
    .eq("id", statementId)
    .eq("status", "draft")
    .is("deleted_at", null)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Only draft statements can be approved.");
  return data;
}

export async function cancelTransporterStatement(statementId) {
  if (!statementId) throw new Error("statementId is required");
  const client = getSupabaseClient();
  const { data: current, error: currentError } = await client
    .from("transport_transporter_statements")
    .select("id,status")
    .eq("id", statementId)
    .is("deleted_at", null)
    .maybeSingle();
  if (currentError) throw currentError;
  if (!current) return null;
  if (current.status === "approved") throw new Error("Approved statement cannot be cancelled.");
  if (current.status === "cancelled") return null;
  const { data, error } = await client
    .from("transport_transporter_statements")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", statementId)
    .is("deleted_at", null)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function listEligibleClientBillsForInvoice({ divisionId = null } = {}) {
  if (!divisionId) return [];
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("list_transport_gst_invoice_eligible_bills", {
    p_division_id: divisionId
  });
  if (error) throw error;
  return data || [];
}

export async function createTransportGstInvoice({ divisionId = null, clientBillId = null, invoiceDate = null, gstMode = null, gstBase = null, gstPercentage = null, remarks = null } = {}) {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("create_transport_gst_invoice", {
    p_division_id: divisionId,
    p_client_bill_id: clientBillId,
    p_invoice_date: invoiceDate,
    p_gst_mode: gstMode,
    p_gst_base: gstBase,
    p_gst_percentage: gstPercentage,
    p_remarks: remarks
  });
  if (error) throw error;
  return Array.isArray(data) ? (data[0] || null) : data;
}

export async function listTransportGstInvoices({ divisionId = null, status = "", fromDate = "", toDate = "" } = {}) {
  const client = getSupabaseClient();
  let query = client
    .from("transport_gst_invoices")
    .select("id,invoice_no,client_bill_id,transport_client_id,invoice_date,taxable_value,gst_base,margin_amount,gst_percentage,gst_amount,invoice_total,status,remarks,created_at,updated_at,transport_client_bills(id,bill_no,net_receivable),transport_clients(id,name,company_name)")
    .is("deleted_at", null)
    .order("invoice_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (divisionId) query = query.eq("division_id", divisionId);
  if (status) query = query.eq("status", status);
  if (fromDate) query = query.gte("invoice_date", fromDate);
  if (toDate) query = query.lte("invoice_date", toDate);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getTransportGstInvoiceDetails(invoiceId) {
  if (!invoiceId) return null;
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("transport_gst_invoices")
    .select("id,invoice_no,client_bill_id,transport_client_id,invoice_date,taxable_value,gst_base,margin_amount,gst_percentage,gst_amount,invoice_total,status,remarks,created_at,updated_at,transport_client_bills(id,bill_no,gross_total,support_deduction_total,net_receivable),transport_clients(id,name,company_name)")
    .eq("id", invoiceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function approveTransportGstInvoice(invoiceId) {
  if (!invoiceId) throw new Error("invoiceId is required");
  const client = getSupabaseClient();
  const { data: invoice, error: invoiceError } = await client
    .from("transport_gst_invoices")
    .select("id,status,invoice_total")
    .eq("id", invoiceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (invoiceError) throw invoiceError;
  if (!invoice) throw new Error("Invoice not found.");
  if (invoice.status === "cancelled") throw new Error("Cancelled invoice cannot be approved.");
  if (invoice.status === "approved") throw new Error("Invoice is already approved.");
  if (Number(invoice.invoice_total || 0) <= 0) throw new Error("Invoice total must be greater than zero.");
  const { data, error } = await client
    .from("transport_gst_invoices")
    .update({ status: "approved", updated_at: new Date().toISOString() })
    .eq("id", invoiceId)
    .eq("status", "draft")
    .is("deleted_at", null)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Only draft invoices can be approved.");
  return data;
}

export async function cancelTransportGstInvoice(invoiceId) {
  if (!invoiceId) throw new Error("invoiceId is required");
  const client = getSupabaseClient();
  const { data: current, error: currentError } = await client
    .from("transport_gst_invoices")
    .select("id,status")
    .eq("id", invoiceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (currentError) throw currentError;
  if (!current) return null;
  if (current.status === "approved") throw new Error("Approved invoice cannot be cancelled.");
  if (current.status === "cancelled") return null;
  const { data, error } = await client
    .from("transport_gst_invoices")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", invoiceId)
    .eq("status", "draft")
    .is("deleted_at", null)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function listClientReceiptBillOptions({ divisionId = null, transportClientId = null } = {}) {
  if (!divisionId || !transportClientId) return [];
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("list_transport_client_receipt_bill_options", {
    p_division_id: divisionId,
    p_transport_client_id: transportClientId
  });
  if (error) throw error;
  return data || [];
}

export async function getClientReceiptOutstanding({ divisionId = null, transportClientId = null, clientBillId = null } = {}) {
  if (!divisionId || !transportClientId) return null;
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("get_transport_client_receipt_outstanding", {
    p_division_id: divisionId,
    p_transport_client_id: transportClientId,
    p_client_bill_id: clientBillId || null
  });
  if (error) throw error;
  return Array.isArray(data) ? (data[0] || null) : data;
}

export async function createTransportClientReceipt({ divisionId = null, transportClientId = null, clientBillId = null, receiptDate = null, amountReceived = null, paymentMode = null, referenceNo = null, remarks = null } = {}) {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("create_transport_client_receipt", {
    p_division_id: divisionId,
    p_transport_client_id: transportClientId,
    p_client_bill_id: clientBillId || null,
    p_receipt_date: receiptDate,
    p_amount_received: amountReceived,
    p_payment_mode: paymentMode,
    p_reference_no: referenceNo,
    p_remarks: remarks
  });
  if (error) throw error;
  return Array.isArray(data) ? (data[0] || null) : data;
}

export async function listTransportClientReceipts({ divisionId = null, transportClientId = "", status = "", fromDate = "", toDate = "" } = {}) {
  const client = getSupabaseClient();
  let query = client
    .from("transport_client_receipts")
    .select("id,receipt_no,transport_client_id,client_bill_id,receipt_date,amount_received,payment_mode,reference_no,remarks,status,created_at,updated_at,transport_clients(id,name,company_name),transport_client_bills(id,bill_no)")
    .is("deleted_at", null)
    .order("receipt_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (divisionId) query = query.eq("division_id", divisionId);
  if (transportClientId) query = query.eq("transport_client_id", transportClientId);
  if (status) query = query.eq("status", status);
  if (fromDate) query = query.gte("receipt_date", fromDate);
  if (toDate) query = query.lte("receipt_date", toDate);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getTransportClientReceiptDetails(receiptId) {
  if (!receiptId) return null;
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("transport_client_receipts")
    .select("id,receipt_no,transport_client_id,client_bill_id,receipt_date,amount_received,payment_mode,reference_no,remarks,status,created_at,updated_at,transport_clients(id,name,company_name),transport_client_bills(id,bill_no,net_receivable)")
    .eq("id", receiptId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function confirmTransportClientReceipt(receiptId) {
  if (!receiptId) throw new Error("receiptId is required");
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("confirm_transport_client_receipt", { p_receipt_id: receiptId });
  if (error) throw error;
  return Array.isArray(data) ? (data[0] || null) : data;
}

export async function cancelTransportClientReceipt(receiptId) {
  if (!receiptId) throw new Error("receiptId is required");
  const client = getSupabaseClient();
  const { data: current, error: currentError } = await client.from("transport_client_receipts").select("id,status").eq("id", receiptId).is("deleted_at", null).maybeSingle();
  if (currentError) throw currentError;
  if (!current) return null;
  if (current.status === "confirmed") throw new Error("Confirmed receipt cannot be cancelled.");
  if (current.status === "cancelled") return null;
  const { data, error } = await client.from("transport_client_receipts").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", receiptId).eq("status", "draft" ).is("deleted_at", null).select("*").maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function listTransporterPaymentStatementOptions({ divisionId = null, transportTransporterId = null } = {}) {
  if (!divisionId || !transportTransporterId) return [];
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("list_transport_transporter_payment_statement_options", {
    p_division_id: divisionId,
    p_transport_transporter_id: transportTransporterId
  });
  if (error) throw error;
  return data || [];
}

export async function getTransporterPaymentOutstanding({ divisionId = null, transportTransporterId = null, transporterStatementId = null } = {}) {
  if (!divisionId || !transportTransporterId) return null;
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("get_transport_transporter_payment_outstanding", {
    p_division_id: divisionId,
    p_transport_transporter_id: transportTransporterId,
    p_transporter_statement_id: transporterStatementId || null
  });
  if (error) throw error;
  return Array.isArray(data) ? (data[0] || null) : data;
}

export async function createTransporterPayment({ divisionId = null, transportTransporterId = null, transporterStatementId = null, paymentDate = null, amountPaid = null, paymentMode = null, referenceNo = null, remarks = null } = {}) {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("create_transport_transporter_payment", {
    p_division_id: divisionId,
    p_transport_transporter_id: transportTransporterId,
    p_transporter_statement_id: transporterStatementId || null,
    p_payment_date: paymentDate,
    p_amount_paid: amountPaid,
    p_payment_mode: paymentMode,
    p_reference_no: referenceNo,
    p_remarks: remarks
  });
  if (error) throw error;
  return Array.isArray(data) ? (data[0] || null) : data;
}

export async function listTransporterPayments({ divisionId = null, transportTransporterId = "", status = "", fromDate = "", toDate = "" } = {}) {
  const client = getSupabaseClient();
  let query = client
    .from("transport_transporter_payments")
    .select("id,payment_no,transport_transporter_id,transporter_statement_id,payment_date,amount_paid,payment_mode,reference_no,remarks,status,created_at,updated_at,transport_transporters(id,name),transport_transporter_statements(id,statement_no)")
    .is("deleted_at", null)
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (divisionId) query = query.eq("division_id", divisionId);
  if (transportTransporterId) query = query.eq("transport_transporter_id", transportTransporterId);
  if (status) query = query.eq("status", status);
  if (fromDate) query = query.gte("payment_date", fromDate);
  if (toDate) query = query.lte("payment_date", toDate);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getTransporterPaymentDetails(paymentId) {
  if (!paymentId) return null;
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("transport_transporter_payments")
    .select("id,payment_no,transport_transporter_id,transporter_statement_id,payment_date,amount_paid,payment_mode,reference_no,remarks,status,created_at,updated_at,transport_transporters(id,name),transport_transporter_statements(id,statement_no,net_payable_total)")
    .eq("id", paymentId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function confirmTransporterPayment(paymentId) {
  if (!paymentId) throw new Error("paymentId is required");
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("confirm_transport_transporter_payment", { p_payment_id: paymentId });
  if (error) throw error;
  return Array.isArray(data) ? (data[0] || null) : data;
}

export async function cancelTransporterPayment(paymentId) {
  if (!paymentId) throw new Error("paymentId is required");
  const client = getSupabaseClient();
  const { data: current, error: currentError } = await client.from("transport_transporter_payments").select("id,status").eq("id", paymentId).is("deleted_at", null).maybeSingle();
  if (currentError) throw currentError;
  if (!current) return null;
  if (current.status === "confirmed") throw new Error("Confirmed payment cannot be cancelled.");
  if (current.status === "cancelled") return null;
  const { data, error } = await client.from("transport_transporter_payments").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", paymentId).eq("status", "draft").is("deleted_at", null).select("*").maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function listPendingLedgerEvents({ divisionId = null, sourceType = "" } = {}) {
  if (!divisionId || !sourceType) return [];
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("list_transport_pending_ledger_events", {
    p_division_id: divisionId,
    p_source_type: sourceType
  });
  if (error) throw error;
  return data || [];
}

async function postTransportLedgerSource(divisionId, sourceType, sourceId) {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("post_transport_ledger_source", {
    p_division_id: divisionId,
    p_source_type: sourceType,
    p_source_id: sourceId
  });
  if (error) throw error;
  return Array.isArray(data) ? (data[0] || null) : data;
}

export async function postClientBillLedger({ divisionId = null, sourceId = null } = {}) {
  return await postTransportLedgerSource(divisionId, "CLIENT_BILL", sourceId);
}

export async function postGstInvoiceLedger({ divisionId = null, sourceId = null } = {}) {
  return await postTransportLedgerSource(divisionId, "GST_INVOICE", sourceId);
}

export async function postClientReceiptLedger({ divisionId = null, sourceId = null } = {}) {
  return await postTransportLedgerSource(divisionId, "CLIENT_RECEIPT", sourceId);
}

export async function postTransporterStatementLedger({ divisionId = null, sourceId = null } = {}) {
  return await postTransportLedgerSource(divisionId, "TRANSPORTER_STATEMENT", sourceId);
}

export async function postTransporterPaymentLedger({ divisionId = null, sourceId = null } = {}) {
  return await postTransportLedgerSource(divisionId, "TRANSPORTER_PAYMENT", sourceId);
}

export async function listLedgerEntries({ divisionId = null, sourceType = "", accountCode = "", fromDate = "", toDate = "", entryNo = "" } = {}) {
  if (!divisionId) return [];
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("list_transport_ledger_entries", {
    p_division_id: divisionId,
    p_source_type: sourceType || null,
    p_account_code: accountCode || null,
    p_from_date: fromDate || null,
    p_to_date: toDate || null,
    p_entry_no: entryNo || null
  });
  if (error) throw error;
  return data || [];
}

export async function getLedgerEntryDetails({ divisionId = null, entryNo = "" } = {}) {
  if (!divisionId || !entryNo) return [];
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("get_transport_ledger_entry_details", {
    p_division_id: divisionId,
    p_entry_no: entryNo
  });
  if (error) throw error;
  return data || [];
}

export async function getTransportClientFinancialReconciliation({ divisionId = null } = {}) {
  if (!divisionId) return null;
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("get_transport_client_financial_reconciliation", {
    p_division_id: divisionId
  });
  if (error) throw error;
  return Array.isArray(data) ? (data[0] || null) : data;
}

export async function getTransporterFinancialReconciliation({ divisionId = null } = {}) {
  if (!divisionId) return null;
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("get_transport_transporter_financial_reconciliation", {
    p_division_id: divisionId
  });
  if (error) throw error;
  return Array.isArray(data) ? (data[0] || null) : data;
}

export async function updateTripExpense(id, payload) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("transport_trip_expenses")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function softDeleteTripExpense(id) {
  const client = getSupabaseClient();
  const { error } = await client
    .from("transport_trip_expenses")
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString(), is_active: false })
    .eq("id", id);
  if (error) throw error;
}

export async function createTripDocument(payload) {
  const client = getSupabaseClient();
  const { data, error } = await client.from("transport_trip_documents").insert(payload).select("*").single();
  if (error) throw error;
  return data;
}

export async function updateTripDocument(id, payload) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("transport_trip_documents")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTripDocument(id) {
  const client = getSupabaseClient();
  const { error } = await client
    .from("transport_trip_documents")
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString(), is_active: false })
    .eq("id", id);
  if (error) throw error;
}

export async function listTripDocuments(tripId) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("transport_trip_documents")
    .select("*")
    .eq("trip_id", tripId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}
