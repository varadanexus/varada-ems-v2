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
  const { error } = await client.from("transport_trips").update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
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
    .select("*", { count: "exact" })
    .is("deleted_at", null)
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
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
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
