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
    .select("id,auth_user_id,email,display_name,status,is_locked,tenant_id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error) throw error;
  debugLog("app_users lookup result", {
    found: Boolean(data),
    appUserId: data?.id || null,
    status: data?.status || null,
    is_locked: data?.is_locked ?? null,
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

// Sprint 13F.11: the CURRENT user's role codes via SECURITY DEFINER RPC, so
// non-admins (blocked by RLS from reading roles) still get their role name.
export async function getMyRoleCodes() {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("get_my_role_codes");
  if (error) throw error;
  return (data || [])
    .map((row) => (typeof row === "string" ? row : (row?.get_my_role_codes ?? Object.values(row || {})[0])))
    .filter(Boolean);
}

// Sprint 13F.9: resolve the CURRENT user's allowed modules via a SECURITY DEFINER
// RPC that bypasses the admin-only RLS on role_permissions. Works for non-admins.
export async function getMyAllowedModules() {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("get_my_allowed_modules");
  if (error) throw error;
  return (data || [])
    .map((row) => (typeof row === "string" ? row : (row?.get_my_allowed_modules ?? Object.values(row || {})[0])))
    .filter(Boolean);
}

// Sprint 13F.14: the CURRENT user's full (module, action) permission set via
// SECURITY DEFINER RPC, so edit/create/delete grants work for non-admins too.
export async function getMyPermissions() {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("get_my_permissions");
  if (error) throw error;
  return (data || []).filter((row) => row && row.module_code && row.action_code);
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
    .select("id,auth_user_id,email,username,phone,display_name,status,is_locked,last_login_at,auth_provider")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const userIds = (users || []).map((u) => u.id);
  if (!userIds.length) return [];

  const [{ data: userRoleRows, error: urErr }, { data: userDivisionRows, error: udErr }] = await Promise.all([
    client.from("user_roles").select("user_id,role_id").in("user_id", userIds),
    client.from("user_divisions").select("user_id,division_id,scope").in("user_id", userIds)
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
      .map((ud) => ({ scope: ud.scope, divisions: divisionById.get(String(ud.division_id)) || null }));

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

export async function getDivisionById(id) {
  if (!id) return null;
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("divisions")
    .select("id,code,name,is_active")
    .eq("id", id)
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

export async function syncUserAccessMappings(userId, roleIds = [], divisionIds = []) {
  const client = getSupabaseClient();
  const normalizedRoleIds = Array.from(new Set((roleIds || []).filter(Boolean).map((value) => String(value))));
  const normalizedDivisionIds = Array.from(new Set((divisionIds || []).filter(Boolean).map((value) => String(value))));
  if (!normalizedRoleIds.length) {
    throw new Error("At least one role is required");
  }
  const { error } = await client.rpc("sync_user_access_mappings", {
    p_user_id: userId,
    p_role_ids: normalizedRoleIds,
    p_division_ids: normalizedDivisionIds
  });
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

// Sprint 13F: create a LOCAL staff account (no Supabase Auth). Super-admin only
// (enforced in the SECURITY DEFINER RPC). Returns the new app_users id.
export async function provisionLocalUser({ email, username, phone, displayName, password, roleCode, divisionCode, divisionScope = "assigned" }) {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("provision_local_app_user", {
    p_email: email,
    p_username: username || null,
    p_phone: phone || null,
    p_display_name: displayName || null,
    p_password: password,
    p_role_code: roleCode,
    p_division_code: divisionCode || null,
    p_division_scope: divisionScope || "assigned"
  });
  if (error) throw error;
  return data;
}

// Admin resets a local staff user's password (revokes their sessions).
export async function setLocalUserPassword(appUserId, newPassword) {
  const client = getSupabaseClient();
  const { error } = await client.rpc("ems_local_set_password", {
    p_app_user_id: appUserId,
    p_new_password: newPassword
  });
  if (error) throw error;
}

// Edit a staff account's identity (super-admin only). For local accounts updates
// email/username/phone/display name; for Supabase-backed accounts only display name.
export async function updateAppUserDetails(appUserId, { email, username, phone, displayName }) {
  const client = getSupabaseClient();
  const { error } = await client.rpc("admin_update_app_user_details", {
    p_app_user_id: appUserId,
    p_email: email || null,
    p_username: username || null,
    p_phone: phone || null,
    p_display_name: displayName || null
  });
  if (error) throw error;
}

// Delete a staff account (super-admin only). Hard-deletes when possible,
// otherwise soft-deletes. Returns 'deleted' or 'soft_deleted'.
export async function deleteAppUser(appUserId) {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("admin_delete_app_user", { p_app_user_id: appUserId });
  if (error) throw error;
  return data;
}

// Restricted reveal of a local staff user's current password (allowlisted admins).
export async function revealLocalUserPassword(appUserId, reason = null) {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("reveal_ems_local_password", {
    p_app_user_id: appUserId,
    p_reason: reason
  });
  if (error) throw error;
  return data;
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
  // PostgREST caps results (default 1000 rows). With many roles × permissions the
  // grant count exceeds that, so page through with .range() to fetch them all —
  // otherwise some grants are silently dropped and appear unchecked/"reverted".
  const pageSize = 1000;
  let from = 0;
  const all = [];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await client
      .from("role_permissions")
      .select("id,allow,role_id,permission_id")
      .eq("allow", true)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const batch = data || [];
    all.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return all;
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

export async function publishTermsPolicy(title = null) {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("publish_terms_policy", { p_title: title || null });
  if (error) throw error;
  return data;
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
  transportClientCreditNotes: "transport_client_credit_notes",
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
  const pageModule = window.EMS_PAGE_MODULE_CODE || null;
  if (pageModule && labelField === "name" && valueField === "id") {
    const { data, error } = await client.rpc("get_page_lookup_options", {
      p_page_module: pageModule,
      p_table_name: table,
      p_division_id: divisionId
    });
    if (error) throw error;
    return (data || []).map((row) => ({ value: row.value, label: row.label }));
  }
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
  // Sprint 13E.8: deletes are hard deletes with a server-side snapshot retained
  // in a restricted archive (super-admin visibility only).
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("purge_transport_trip", { p_trip_id: id });
  if (error) throw error;
  return data;
}

export async function purgeTransportGstInvoice(id) {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("purge_transport_gst_invoice", { p_invoice_id: id });
  if (error) throw error;
  return data;
}

export async function listSystemMaintenanceEntries({ entityType = null, limit = 100 } = {}) {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("list_system_maintenance_entries", { p_entity_type: entityType, p_limit: limit });
  if (error) throw error;
  return data || [];
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
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (tripId) query = query.eq("trip_id", tripId);
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

export async function listRateRoutesForCommodity({ divisionId = null, transportCommodityId = null } = {}) {
  if (!transportCommodityId) return null;
  const client = getSupabaseClient();
  let query = client
    .from("transport_rate_master")
    .select("route_id")
    .is("deleted_at", null)
    .eq("is_active", true)
    .eq("transport_commodity_id", transportCommodityId);
  if (divisionId) query = query.eq("division_id", divisionId);
  const { data, error } = await query;
  if (error) throw error;
  return [...new Set((data || []).map((r) => r.route_id).filter(Boolean))];
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

export async function createTransportClientBill({ divisionId = null, transportClientId = null, billDate = null, remarks = null, tripIds = [], billingType = "NON_GST", gstBase = null, gstMode = null, gstPercentage = null } = {}) {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("create_transport_client_bill", {
    p_division_id: divisionId,
    p_transport_client_id: transportClientId,
    p_bill_date: billDate,
    p_remarks: remarks,
    p_trip_ids: tripIds,
    p_billing_type: billingType,
    p_gst_base: gstBase,
    p_gst_mode: gstMode,
    p_gst_percentage: gstPercentage
  });
  if (error) throw error;
  return Array.isArray(data) ? (data[0] || null) : data;
}

export async function listTransportClientBills({ divisionId = null, transportClientId = "", status = "", fromDate = "", toDate = "" } = {}) {
  const client = getSupabaseClient();
  let query = client
    .from("transport_client_bills")
    .select("id,bill_no,transport_client_id,bill_date,status,billing_type,gst_base,gst_mode,gst_percentage,taxable_value,gst_amount,invoice_total,transporter_cost,margin_amount,gross_total,support_deduction_total,net_receivable,remarks,created_at,updated_at,approved_at,transport_clients(id,name,company_name)")
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
    .select("id,bill_no,transport_client_id,bill_date,status,billing_type,gst_base,gst_mode,gst_percentage,taxable_value,gst_amount,invoice_total,transporter_cost,margin_amount,gross_total,support_deduction_total,net_receivable,remarks,created_at,updated_at,approved_at,transport_clients(id,code,name,company_name,contact_person_name,phone_number,contact_no,address,email,gstin,gst_number,pan_number,aadhaar_number,is_active)")
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
  // Sprint 13E.9: cancelling permanently removes the bill (snapshot kept in the
  // restricted archive) so its invoice number is freed for reuse.
  const { data, error } = await client.rpc("purge_transport_client_bill", { p_bill_id: billId });
  if (error) throw error;
  return { id: billId, bill_no: data, status: "deleted" };
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

export async function createTransporterStatement({
  divisionId = null,
  transportTransporterId = null,
  statementDate = null,
  remarks = null,
  tripIds = [],
  penaltyAmount = 0,
  penaltyReason = null,
  gstInputApplicable = false,
  gstInputMode = null,
  gstInputPercentage = null
} = {}) {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("create_transport_transporter_statement", {
    p_division_id: divisionId,
    p_transport_transporter_id: transportTransporterId,
    p_statement_date: statementDate,
    p_remarks: remarks,
    p_trip_ids: tripIds,
    p_penalty_amount: penaltyAmount,
    p_penalty_reason: penaltyReason,
    p_gst_input_applicable: gstInputApplicable,
    p_gst_input_mode: gstInputMode,
    p_gst_input_percentage: gstInputPercentage
  });
  if (error) throw error;
  return Array.isArray(data) ? (data[0] || null) : data;
}

export async function listTransporterStatements({ divisionId = null, transportTransporterId = "", status = "", fromDate = "", toDate = "" } = {}) {
  const client = getSupabaseClient();
  let query = client
    .from("transport_transporter_statements")
    .select("id,statement_no,transport_transporter_id,statement_date,status,gross_payable_total,support_deduction_total,penalty_amount,penalty_reason,gst_input_applicable,gst_input_mode,gst_input_percentage,gst_input_amount,net_payable_total,remarks,created_at,updated_at,approved_at,transport_transporters(id,name,phone_number,address,email,gst_number,pan_number,aadhaar_number,bank_name,account_number,ifsc_code,contact_no,gstin)")
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
    .select("id,statement_no,transport_transporter_id,statement_date,status,gross_payable_total,support_deduction_total,penalty_amount,penalty_reason,gst_input_applicable,gst_input_mode,gst_input_percentage,gst_input_amount,net_payable_total,remarks,created_at,updated_at,approved_at,transport_transporters(id,name,phone_number,address,email,gst_number,pan_number,aadhaar_number,bank_name,account_number,ifsc_code,contact_no,gstin)")
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
    .select("id,status,gross_payable_total,support_deduction_total,penalty_amount,net_payable_total")
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
  if (Number(statement.gross_payable_total || 0) <= 0) throw new Error("Cannot approve statement with zero gross total.");
  if (Number(statement.penalty_amount || 0) < 0) throw new Error("Penalty amount cannot be negative.");
  if (Number(statement.penalty_amount || 0) > Number((Number(statement.gross_payable_total || 0) - Number(statement.support_deduction_total || 0)).toFixed(2))) {
    throw new Error("Penalty amount cannot exceed gross less support deduction.");
  }
  if (Number(statement.net_payable_total || 0) < 0) throw new Error("Net payable total cannot be negative.");
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
    .select("id,invoice_no,client_bill_id,transport_client_id,invoice_date,taxable_value,gst_base,gst_mode,margin_amount,gst_percentage,gst_amount,invoice_total,status,remarks,created_at,updated_at,transport_client_bills(id,bill_no,gross_total,support_deduction_total,net_receivable),transport_clients(id,name,company_name)")
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
  // Sprint 13E.9: cancelling permanently removes the invoice (snapshot kept in the
  // restricted archive) so its invoice number is freed for reuse.
  const { data, error } = await client.rpc("purge_transport_gst_invoice", { p_invoice_id: invoiceId });
  if (error) throw error;
  return { id: invoiceId, invoice_no: data, status: "deleted" };
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

export async function createTransportClientCreditNote({ divisionId = null, transportClientId = null, clientBillId = null, creditNoteDate = null, creditNoteAmount = null, reason = null, remarks = null } = {}) {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("create_transport_client_credit_note", {
    p_division_id: divisionId,
    p_transport_client_id: transportClientId,
    p_client_bill_id: clientBillId,
    p_credit_note_date: creditNoteDate,
    p_credit_note_amount: creditNoteAmount,
    p_reason: reason,
    p_remarks: remarks
  });
  if (error) throw error;
  return Array.isArray(data) ? (data[0] || null) : data;
}

export async function listTransportClientCreditNotes({ divisionId = null, transportClientId = "", status = "", fromDate = "", toDate = "" } = {}) {
  const client = getSupabaseClient();
  let query = client
    .from("transport_client_credit_notes")
    .select("id,credit_note_no,transport_client_id,client_bill_id,credit_note_date,credit_note_amount,reason,remarks,status,approved_at,created_at,updated_at,transport_clients(id,name,company_name),transport_client_bills(id,bill_no,billing_type,net_receivable,invoice_total)")
    .is("deleted_at", null)
    .order("credit_note_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (divisionId) query = query.eq("division_id", divisionId);
  if (transportClientId) query = query.eq("transport_client_id", transportClientId);
  if (status) query = query.eq("status", status);
  if (fromDate) query = query.gte("credit_note_date", fromDate);
  if (toDate) query = query.lte("credit_note_date", toDate);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getTransportClientCreditNoteDetails(creditNoteId) {
  if (!creditNoteId) return null;
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("transport_client_credit_notes")
    .select("id,credit_note_no,transport_client_id,client_bill_id,credit_note_date,credit_note_amount,reason,remarks,status,approved_at,created_at,updated_at,transport_clients(id,name,company_name),transport_client_bills(id,bill_no,billing_type,net_receivable,invoice_total,gst_amount)")
    .eq("id", creditNoteId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function approveTransportClientCreditNote(creditNoteId) {
  if (!creditNoteId) throw new Error("creditNoteId is required");
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("approve_transport_client_credit_note", { p_credit_note_id: creditNoteId });
  if (error) throw error;
  return Array.isArray(data) ? (data[0] || null) : data;
}

export async function cancelTransportClientCreditNote(creditNoteId) {
  if (!creditNoteId) throw new Error("creditNoteId is required");
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("cancel_transport_client_credit_note", { p_credit_note_id: creditNoteId });
  if (error) throw error;
  return Array.isArray(data) ? (data[0] || null) : data;
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
    .select("id,receipt_no,transport_client_id,client_bill_id,receipt_date,amount_received,payment_mode,reference_no,remarks,status,created_at,updated_at,transport_clients(id,name,company_name,address,gst_number,gstin),transport_client_bills(id,bill_no,bill_date,billing_type,net_receivable,invoice_total,gst_amount)")
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
    .select("id,receipt_no,transport_client_id,client_bill_id,receipt_date,amount_received,payment_mode,reference_no,remarks,status,created_at,updated_at,transport_clients(id,name,company_name,address,gst_number,gstin),transport_client_bills(id,bill_no,bill_date,billing_type,net_receivable,invoice_total,gst_amount)")
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
    .select("id,payment_no,transport_transporter_id,transporter_statement_id,payment_date,amount_paid,payment_mode,reference_no,remarks,status,created_at,updated_at,transport_transporters(id,name,address,phone_number,contact_no,gst_number,gstin),transport_transporter_statements(id,statement_no,statement_date,penalty_amount,gst_input_amount,net_payable_total)")
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
    .select("id,payment_no,transport_transporter_id,transporter_statement_id,payment_date,amount_paid,payment_mode,reference_no,remarks,status,created_at,updated_at,transport_transporters(id,name,address,phone_number,contact_no,gst_number,gstin),transport_transporter_statements(id,statement_no,statement_date,penalty_amount,gst_input_amount,net_payable_total)")
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

export async function postClientCreditNoteLedger({ divisionId = null, sourceId = null } = {}) {
  return await postTransportLedgerSource(divisionId, "CREDIT_NOTE", sourceId);
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

export async function getCentralAccountsDashboardMetrics() {
  const client = getSupabaseClient();
  const [
    readyToPostRes,
    postedRes,
    failedRes,
    docsRes,
    receivablesRes,
    payablesRes
  ] = await Promise.all([
    client.from("posting_queue").select("id", { count: "exact", head: true }).eq("queue_status", "ready_to_post"),
    client.from("posting_queue").select("id", { count: "exact", head: true }).eq("queue_status", "posted"),
    client.from("posting_queue").select("id", { count: "exact", head: true }).eq("queue_status", "failed"),
    client.from("financial_documents").select("id", { count: "exact", head: true }),
    client.from("receivable_open_items").select("open_amount"),
    client.from("payable_open_items").select("open_amount")
  ]);
  [readyToPostRes, postedRes, failedRes, docsRes, receivablesRes, payablesRes].forEach((res) => {
    if (res.error) throw res.error;
  });
  return {
    readyToPost: readyToPostRes.count || 0,
    posted: postedRes.count || 0,
    failed: failedRes.count || 0,
    financialDocuments: docsRes.count || 0,
    receivables: (receivablesRes.data || []).reduce((sum, row) => sum + Number(row.open_amount || 0), 0),
    payables: (payablesRes.data || []).reduce((sum, row) => sum + Number(row.open_amount || 0), 0)
  };
}

export async function listCentralFinancialDocuments({ status = "", family = "", search = "" } = {}) {
  const client = getSupabaseClient();
  let query = client
    .from("financial_documents")
    .select(`
      id, document_family, source_module, source_table, source_document_id, source_document_no,
      status, document_date, effective_date, gross_amount, taxable_amount, tax_amount, net_amount,
      finance_approved_at, posted_at, created_at,
      reporting_dimensions!financial_documents_counterparty_dimension_id_fkey(id, code, name)
    `)
    .order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  if (family) query = query.eq("document_family", family);
  if (search) query = query.or(`source_document_no.ilike.%${search}%,document_family.ilike.%${search}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getCentralFinancialDocumentDetails(documentId) {
  if (!documentId) return null;
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("financial_documents")
    .select(`
      *,
      reporting_dimensions!financial_documents_counterparty_dimension_id_fkey(id, code, name),
      posting_queue(id, queue_status, queue_attempt, last_error, processed_at, created_at),
      document_postings(id, posting_sequence, posting_status, failure_reason, posted_at, failed_at, created_at)
    `)
    .eq("id", documentId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function listCentralPostingQueue({ status = "", search = "" } = {}) {
  const client = getSupabaseClient();
  let query = client
    .from("posting_queue")
    .select(`
      id, financial_document_id, queue_status, queue_attempt, last_error, created_at, updated_at, processed_at,
      financial_documents(
        id, document_family, source_module, source_table, source_document_id, source_document_no, status, net_amount,
        document_postings(id, posting_sequence, posting_status, posted_at, failed_at)
      )
    `)
    .order("created_at", { ascending: false });
  if (status) query = query.eq("queue_status", status);
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data || []).filter((row) => {
    if (!search) return true;
    const haystack = [
      row.queue_status,
      row.financial_documents?.document_family,
      row.financial_documents?.source_document_no,
      row.financial_documents?.source_module,
      row.financial_documents?.source_table,
      row.financial_documents?.document_postings?.[0]?.posting_sequence
    ].join(" ").toLowerCase();
    return haystack.includes(String(search).toLowerCase());
  });
  return rows;
}

export async function postCentralAccountsTransportDocument(financialDocumentId) {
  if (!financialDocumentId) throw new Error("Financial document id is required");
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("execute_central_accounts_transport_posting", {
    p_financial_document_id: financialDocumentId
  });
  if (error) throw error;
  return Array.isArray(data) ? (data[0] || null) : data;
}

export async function postCentralAccountsInteriorsDocument(financialDocumentId) {
  if (!financialDocumentId) throw new Error("Financial document id is required");
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("execute_central_accounts_interiors_posting", {
    p_financial_document_id: financialDocumentId
  });
  if (error) throw error;
  return Array.isArray(data) ? (data[0] || null) : data;
}

export async function listCentralJournals({ search = "" } = {}) {
  const client = getSupabaseClient();
  let query = client
    .from("journal_entries")
    .select("id,journal_no,posting_sequence,entry_date,source_module,source_document_family,status,posted_at,financial_document_id,source_document_id,created_at")
    .order("posted_at", { ascending: false })
    .order("created_at", { ascending: false });
  const { data, error } = await query;
  if (error) throw error;
  const rows = data || [];
  if (!search) return rows;
  const needle = String(search).toLowerCase();
  return rows.filter((row) => [row.journal_no, row.posting_sequence, row.source_module, row.source_document_family, row.status].join(" ").toLowerCase().includes(needle));
}

export async function getCentralJournalDetails(journalEntryId) {
  if (!journalEntryId) return null;
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("journal_entries")
    .select(`
      id,journal_no,posting_sequence,entry_date,source_module,source_document_id,source_document_family,financial_document_id,division_id,status,posted_at,created_at,
      financial_documents(id,source_document_no,document_family,status,net_amount),
      journal_lines(id,line_no,debit_amount,credit_amount,line_memo,ledger_account_id,division_id,counterparty_dimension_id,project_dimension_id,profit_center_dimension_id)
    `)
    .eq("id", journalEntryId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function listCentralAuditEvents({ search = "" } = {}) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("central_accounts_audit_events")
    .select(`
      id,event_type,entity_type,entity_id,actor_app_user_id,financial_document_id,journal_entry_id,details,created_at,
      financial_documents(id,source_document_no,document_family),
      journal_entries(id,journal_no,posting_sequence),
      app_users!central_accounts_audit_events_actor_app_user_id_fkey(id,display_name,email)
    `)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = data || [];
  if (!search) return rows;
  const needle = String(search).toLowerCase();
  return rows.filter((row) => [row.event_type, row.entity_type, row.entity_id, row.financial_documents?.source_document_no, row.journal_entries?.journal_no, row.app_users?.display_name, row.app_users?.email].join(" ").toLowerCase().includes(needle));
}

export async function listCentralReceivables({ search = "" } = {}) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("receivable_open_items")
    .select(`
      id,financial_document_id,due_date,original_amount,open_amount,status,created_at,updated_at,
      financial_documents(id,source_document_no,document_family,document_date),
      reporting_dimensions!receivable_open_items_counterparty_dimension_id_fkey(id,code,name)
    `)
    .order("due_date", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = data || [];
  if (!search) return rows;
  const needle = String(search).toLowerCase();
  return rows.filter((row) => [row.financial_documents?.source_document_no, row.financial_documents?.document_family, row.reporting_dimensions?.name, row.reporting_dimensions?.code, row.status].join(" ").toLowerCase().includes(needle));
}

export async function listCentralPayables({ search = "" } = {}) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("payable_open_items")
    .select(`
      id,financial_document_id,due_date,original_amount,open_amount,status,created_at,updated_at,
      financial_documents(id,source_document_no,document_family,document_date),
      reporting_dimensions!payable_open_items_counterparty_dimension_id_fkey(id,code,name)
    `)
    .order("due_date", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = data || [];
  if (!search) return rows;
  const needle = String(search).toLowerCase();
  return rows.filter((row) => [row.financial_documents?.source_document_no, row.financial_documents?.document_family, row.reporting_dimensions?.name, row.reporting_dimensions?.code, row.status].join(" ").toLowerCase().includes(needle));
}
export async function getVendorAccountingDataset(){const c=getSupabaseClient();const [v,b,a,s,coa,div]=await Promise.all([
c.from("accounting_vendors").select("*").is("deleted_at",null).order("legal_name"),c.from("purchase_bills").select("*,accounting_vendors(id,vendor_code,legal_name),accounting_vouchers(id,voucher_no,status,journal_entry_id)").is("deleted_at",null).order("bill_date",{ascending:false}),c.from("vendor_advances").select("*,accounting_vendors(id,legal_name)").order("advance_date",{ascending:false}),c.from("vendor_settlements").select("*").order("settlement_date",{ascending:false}),c.from("coa_accounts").select("id,code,name,is_posting_allowed").eq("is_active",true).eq("is_posting_allowed",true).order("code"),c.from("divisions").select("id,name").eq("is_active",true).order("name")]);[v,b,a,s,coa,div].forEach(r=>{if(r.error)throw r.error});return{vendors:v.data||[],bills:b.data||[],advances:a.data||[],settlements:s.data||[],accounts:coa.data||[],divisions:div.data||[]}}
export async function saveAccountingVendor(p){const c=getSupabaseClient(),q=p.id?c.from("accounting_vendors").update({...p,updated_at:new Date().toISOString()}).eq("id",p.id):c.from("accounting_vendors").insert(p),{data,error}=await q.select("*").single();if(error)throw error;return data}
export async function savePurchaseBill(p){const c=getSupabaseClient(),q=p.id?c.from("purchase_bills").update({...p,updated_at:new Date().toISOString()}).eq("id",p.id):c.from("purchase_bills").insert({...p,open_amount:p.total_amount,status:"submitted"}),{data,error}=await q.select("*").single();if(error)throw error;return data}
export async function saveVendorAdvance(p){const c=getSupabaseClient();const{data,error}=await c.from("vendor_advances").insert({...p,unadjusted_amount:p.amount}).select("*").single();if(error)throw error;return data}
export async function approvePurchaseBill(id){const c=getSupabaseClient();const{error}=await c.rpc("approve_purchase_bill",{p_bill_id:id});if(error)throw error;}
export async function postPurchaseBill(id){const c=getSupabaseClient();const{data,error}=await c.rpc("post_purchase_bill",{p_bill_id:id});if(error)throw error;return data;}

export async function listCentralTreasuryAccounts({ search = "" } = {}) {
  const client = getSupabaseClient();
  const [cashRes, bankRes] = await Promise.all([
    client
      .from("cash_accounts")
      .select(`
        id, code, name, ledger_account_id, is_active, created_at,
        coa_accounts:ledger_account_id(id, code, name)
      `)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    client
      .from("bank_accounts")
      .select(`
        id, code, bank_name, account_title, masked_account_number, ifsc_code, ledger_account_id, is_active, created_at,
        coa_accounts:ledger_account_id(id, code, name)
      `)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
  ]);
  if (cashRes.error) throw cashRes.error;
  if (bankRes.error) throw bankRes.error;

  const ledgerAccountIds = Array.from(new Set([
    ...(cashRes.data || []).map((row) => row.ledger_account_id).filter(Boolean),
    ...(bankRes.data || []).map((row) => row.ledger_account_id).filter(Boolean)
  ]));

  let balanceByLedgerAccountId = new Map();
  if (ledgerAccountIds.length) {
    const { data: journalLineRows, error: journalLinesError } = await client
      .from("journal_lines")
      .select("ledger_account_id,debit_amount,credit_amount")
      .in("ledger_account_id", ledgerAccountIds);
    if (journalLinesError) throw journalLinesError;

    balanceByLedgerAccountId = (journalLineRows || []).reduce((map, row) => {
      const key = String(row.ledger_account_id || "");
      if (!key) return map;
      const nextBalance = (map.get(key) || 0) + Number(row.debit_amount || 0) - Number(row.credit_amount || 0);
      map.set(key, nextBalance);
      return map;
    }, new Map());
  }

  const cashRows = (cashRes.data || []).map((row) => ({
    id: row.id,
    source_type: "cash",
    account_code: row.code || row.coa_accounts?.code || "—",
    account_name: row.name || row.coa_accounts?.name || "—",
    account_type: "Cash",
    current_balance: getCentralTreasuryBalance(balanceByLedgerAccountId, row.ledger_account_id),
    status: row.is_active ? "active" : "inactive",
    created_at: row.created_at,
    raw: row
  }));

  const bankRows = (bankRes.data || []).map((row) => ({
    id: row.id,
    source_type: "bank",
    account_code: row.code || row.coa_accounts?.code || "—",
    account_name: row.account_title || row.bank_name || row.coa_accounts?.name || "—",
    account_type: "Bank",
    current_balance: getCentralTreasuryBalance(balanceByLedgerAccountId, row.ledger_account_id),
    status: row.is_active ? "active" : "inactive",
    created_at: row.created_at,
    raw: row
  }));

  const rows = [...cashRows, ...bankRows];
  if (!search) return rows;
  const needle = String(search).toLowerCase();
  return rows.filter((row) => [row.account_code, row.account_name, row.account_type, row.status].join(" ").toLowerCase().includes(needle));
}

export async function getBankReconciliationDataset({ search = "" } = {}) {
  const client = getSupabaseClient();
  const accounts = (await listCentralTreasuryAccounts({ search })).filter((row) => row.source_type === "bank");
  const bankAccountIds = accounts.map((row) => row.id).filter(Boolean);
  const ledgerAccountIds = accounts.map((row) => row.raw?.ledger_account_id).filter(Boolean);

  const [importsRes, certsRes, journalLinesRes] = await Promise.all([
    bankAccountIds.length
      ? client
        .from("bank_statement_imports")
        .select("*,bank_accounts(id,code,bank_name,account_title,masked_account_number,ledger_account_id)")
        .in("bank_account_id", bankAccountIds)
        .order("imported_at", { ascending: false })
        .limit(50)
      : Promise.resolve({ data: [], error: null }),
    client
      .from("bank_reconciliation_certificates")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50),
    ledgerAccountIds.length
      ? client
        .from("journal_lines")
        .select("id,journal_entry_id,line_no,ledger_account_id,debit_amount,credit_amount,line_memo,journal_entries(id,journal_no,entry_date,source_module,source_document_family,source_document_id,status)")
        .in("ledger_account_id", ledgerAccountIds)
        .order("id", { ascending: false })
        .limit(500)
      : Promise.resolve({ data: [], error: null })
  ]);
  [importsRes, certsRes, journalLinesRes].forEach((res) => { if (res.error) throw res.error; });

  const importIds = (importsRes.data || []).map((row) => row.id);
  let lines = [];
  if (importIds.length) {
    const { data, error } = await client
      .from("bank_statement_lines")
      .select("*,journal_lines(id,journal_entry_id,line_no,debit_amount,credit_amount,line_memo,journal_entries(id,journal_no,entry_date,source_module,source_document_family,status))")
      .in("import_id", importIds)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    lines = data || [];
  }

  return {
    accounts,
    imports: importsRes.data || [],
    lines,
    certificates: certsRes.data || [],
    journalLines: journalLinesRes.data || []
  };
}

export async function createBankStatementImport({ importRow, lines }) {
  const client = getSupabaseClient();
  const { data: createdImport, error: importError } = await client
    .from("bank_statement_imports")
    .insert(importRow)
    .select("*")
    .single();
  if (importError) throw importError;

  const normalizedLines = (lines || []).map((line) => ({ ...line, import_id: createdImport.id }));
  if (normalizedLines.length) {
    const { error: linesError } = await client.from("bank_statement_lines").insert(normalizedLines);
    if (linesError) throw linesError;
  }
  return createdImport;
}

export async function updateBankStatementLineMatch(id, payload) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("bank_statement_lines")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function saveBankReconciliationCertificate(payload) {
  const client = getSupabaseClient();
  const now = new Date().toISOString();
  const { data, error } = await client
    .from("bank_reconciliation_certificates")
    .upsert({ ...payload, prepared_at: payload.prepared_at || now, updated_at: now }, { onConflict: "import_id" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function markBankStatementImportStatus(id, status) {
  const client = getSupabaseClient();
  const patch = { status, updated_at: new Date().toISOString() };
  if (status === "reconciled") patch.reconciled_at = new Date().toISOString();
  const { data, error } = await client
    .from("bank_statement_imports")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

function getCentralTreasuryBalance(balanceByLedgerAccountId, ledgerAccountId) {
  if (!ledgerAccountId) return null;
  const key = String(ledgerAccountId);
  return balanceByLedgerAccountId.has(key) ? balanceByLedgerAccountId.get(key) : null;
}

export async function getCentralAccountsReportingDataset() {
  const client = getSupabaseClient();
  const [
    coaRes,
    fyRes,
    periodsRes,
    journalsRes,
    linesRes,
    docsRes,
    postingsRes,
    recvRes,
    payRes,
    cashRes,
    bankRes
  ] = await Promise.all([
    client.from("coa_accounts").select("id,code,name,account_class,account_group,parent_account_id,hierarchy_level,is_posting_allowed,is_control_account,is_active,effective_from,effective_to").is("deleted_at", null).order("code"),
    client.from("fiscal_years").select("id,code,start_date,end_date,status,is_year_end_locked,closed_at,reopened_at").order("start_date", { ascending: false }),
    client.from("accounting_periods").select("id,fiscal_year_id,period_code,period_name,period_index,start_date,end_date,status,closed_at,reopened_at").order("start_date", { ascending: false }),
    client.from("journal_entries").select("id,journal_no,posting_sequence,accounting_period_id,fiscal_year_id,financial_document_id,entry_date,source_module,source_document_id,source_document_family,division_id,status,created_by,posted_by,posted_at,created_at").order("entry_date", { ascending: false }).limit(5000),
    client.from("journal_lines").select("id,journal_entry_id,line_no,ledger_account_id,division_id,counterparty_dimension_id,project_dimension_id,profit_center_dimension_id,debit_amount,credit_amount,line_memo").limit(20000),
    client.from("financial_documents").select("id,document_family,source_module,source_table,source_document_id,source_document_no,division_id,counterparty_dimension_id,project_dimension_id,profit_center_dimension_id,status,document_date,effective_date,gross_amount,taxable_amount,tax_amount,net_amount,finance_approved_at,posted_at").order("document_date", { ascending: false }).limit(5000),
    client.from("document_postings").select("id,financial_document_id,journal_entry_id,posting_sequence,posting_status,accounting_period_id,posted_at,failed_at,failure_reason,created_at").order("created_at", { ascending: false }).limit(5000),
    client.from("receivable_open_items").select("id,financial_document_id,division_id,counterparty_dimension_id,due_date,original_amount,open_amount,status,created_at,updated_at").limit(5000),
    client.from("payable_open_items").select("id,financial_document_id,division_id,counterparty_dimension_id,due_date,original_amount,open_amount,status,created_at,updated_at").limit(5000),
    client.from("cash_accounts").select("id,code,name,ledger_account_id,is_active,created_at").is("deleted_at", null),
    client.from("bank_accounts").select("id,code,bank_name,account_title,masked_account_number,ifsc_code,ledger_account_id,is_active,created_at").is("deleted_at", null)
  ]);
  [coaRes, fyRes, periodsRes, journalsRes, linesRes, docsRes, postingsRes, recvRes, payRes, cashRes, bankRes].forEach((res) => { if (res.error) throw res.error; });
  return {
    coaAccounts: coaRes.data || [],
    fiscalYears: fyRes.data || [],
    accountingPeriods: periodsRes.data || [],
    journalEntries: journalsRes.data || [],
    journalLines: linesRes.data || [],
    financialDocuments: docsRes.data || [],
    documentPostings: postingsRes.data || [],
    receivableOpenItems: recvRes.data || [],
    payableOpenItems: payRes.data || [],
    cashAccounts: cashRes.data || [],
    bankAccounts: bankRes.data || []
  };
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

export async function getCompanyTaxProfile() {
  const client = getSupabaseClient();
  const { data, error } = await client.from("company_tax_profiles").select("*").eq("company_key", "PRIMARY").maybeSingle();
  if (error) throw error;
  return data || { company_key: "PRIMARY", financial_year_start_month: 4 };
}

export async function saveCompanyTaxProfile(payload) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("company_tax_profiles")
    .upsert({ ...payload, company_key: "PRIMARY", updated_at: new Date().toISOString() }, { onConflict: "company_key" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function listCompanyGstRegistrations() {
  const client = getSupabaseClient();
  const { data, error } = await client.from("company_gst_registrations").select("*").order("state_name").order("registration_name");
  if (error) throw error;
  return data || [];
}

export async function saveCompanyGstRegistration(payload) {
  const client = getSupabaseClient();
  const normalized = { ...payload, company_key: "PRIMARY", gstin: String(payload.gstin || "").toUpperCase(), updated_at: new Date().toISOString() };
  const query = normalized.id
    ? client.from("company_gst_registrations").update(normalized).eq("id", normalized.id)
    : client.from("company_gst_registrations").insert(normalized);
  const { data, error } = await query.select("*").single();
  if (error) throw error;
  return data;
}

export async function deactivateCompanyGstRegistration(id) {
  const client = getSupabaseClient();
  const { error } = await client
    .from("company_gst_registrations")
    .update({ is_active: false, is_primary: false, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function getConsolidatedAccountingRegister({ divisionId = null, sourceModule = "", status = "", search = "" } = {}) {
  const client = getSupabaseClient();
  let query = client
    .from("financial_documents")
    .select("*,divisions(id,code,name),posting_queue(id,queue_status,last_error,processed_at),journal_entries(id,journal_no,posting_sequence,status,entry_date)")
    .is("deleted_at", null)
    .order("document_date", { ascending: false });
  if (divisionId) query = query.eq("division_id", divisionId);
  if (sourceModule) query = query.eq("source_module", sourceModule);
  if (status) query = query.eq("status", status);
  if (search) query = query.or(`source_document_no.ilike.%${search}%,document_family.ilike.%${search}%,source_module.ilike.%${search}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getConsolidatedSourceDocument(financialDocumentId) {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("get_consolidated_source_document", { p_financial_document_id: financialDocumentId });
  if (error) throw error;
  return data || null;
}

export async function getGstComplianceDataset() {
  const client = getSupabaseClient();
  const [registrations, periods, classifications, documents, batches, items] = await Promise.all([
    client.from("company_gst_registrations").select("*").eq("is_active", true).order("state_name"),
    client.from("gst_return_periods").select("*").order("period_start", { ascending: false }),
    client.from("gst_document_classifications").select("*").order("updated_at", { ascending: false }),
    client.from("financial_documents").select("id,source_document_no,document_family,source_module,document_date,gross_amount,taxable_amount,tax_amount,division_id,status").is("deleted_at", null),
    client.from("gst_2b_import_batches").select("*").order("imported_at", { ascending: false }),
    client.from("gst_2b_items").select("*").order("invoice_date", { ascending: false })
  ]);
  [registrations, periods, classifications, documents, batches, items].forEach((res) => { if (res.error) throw res.error; });
  return { registrations: registrations.data || [], periods: periods.data || [], classifications: classifications.data || [], documents: documents.data || [], batches: batches.data || [], items: items.data || [] };
}

export async function saveGstReturnPeriod(payload) {
  const client = getSupabaseClient();
  const query = payload.id
    ? client.from("gst_return_periods").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", payload.id)
    : client.from("gst_return_periods").insert(payload);
  const { data, error } = await query.select("*").single();
  if (error) throw error;
  return data;
}

export async function saveGstDocumentClassification(id, payload) {
  const client = getSupabaseClient();
  const { data, error } = await client.from("gst_document_classifications").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", id).select("*").single();
  if (error) throw error;
  return data;
}

export async function updateGst2bItem(id, payload) {
  const client = getSupabaseClient();
  const { data, error } = await client.from("gst_2b_items").update(payload).eq("id", id).select("*").single();
  if (error) throw error;
  return data;
}

export async function updateGst2bBatch(id, payload) {
  const client = getSupabaseClient();
  const { data, error } = await client.from("gst_2b_import_batches").update(payload).eq("id", id).select("*").single();
  if (error) throw error;
  return data;
}

export async function importGst2bBatch({ batch, items }) {
  const client = getSupabaseClient();
  const { data: createdBatch, error: batchError } = await client.from("gst_2b_import_batches").insert({ ...batch, row_count: items.length }).select("*").single();
  if (batchError) throw batchError;
  if (items.length) {
    const { error: itemError } = await client.from("gst_2b_items").insert(items.map((item) => ({ ...item, batch_id: createdBatch.id })));
    if (itemError) throw itemError;
  }
  return createdBatch;
}

export async function getAnnualTaxDataset() {
  const client = getSupabaseClient();
  const [filings, workpapers, fiscalYears] = await Promise.all([
    client.from("statutory_filing_records").select("*").order("financial_year", { ascending: false }).order("due_date"),
    client.from("annual_tax_workpapers").select("*").order("financial_year", { ascending: false }).order("section_code"),
    client.from("fiscal_years").select("*").order("start_date", { ascending: false })
  ]);
  [filings, workpapers, fiscalYears].forEach((res) => { if (res.error) throw res.error; });
  return { filings: filings.data || [], workpapers: workpapers.data || [], fiscalYears: fiscalYears.data || [] };
}

export async function saveStatutoryFiling(payload) {
  const client = getSupabaseClient();
  const query = payload.id
    ? client.from("statutory_filing_records").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", payload.id)
    : client.from("statutory_filing_records").insert(payload);
  const { data, error } = await query.select("*").single();
  if (error) throw error;
  return data;
}

export async function saveAnnualTaxWorkpaper(payload) {
  const client = getSupabaseClient();
  const query = payload.id
    ? client.from("annual_tax_workpapers").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", payload.id)
    : client.from("annual_tax_workpapers").insert(payload);
  const { data, error } = await query.select("*").single();
  if (error) throw error;
  return data;
}

export async function getTdsComplianceDataset() {
  const client = getSupabaseClient();
  const [sections, deductees, deductions, documents, bills, accounts] = await Promise.all([
    client.from("tds_sections").select("*").order("section_code"),
    client.from("tds_deductees").select("*").order("legal_name"),
    client.from("tds_deductions").select("*,tds_deductees(id,deductee_code,legal_name,pan),tds_sections(id,section_code,description),financial_documents(id,source_document_no,document_date,document_family,source_module),purchase_bills(id,bill_no,bill_date,total_amount)").order("deduction_date", { ascending: false }),
    client.from("financial_documents").select("id,source_document_no,document_date,document_family,source_module,net_amount,taxable_amount,status").is("deleted_at", null).order("document_date", { ascending: false }).limit(500),
    client.from("purchase_bills").select("id,bill_no,bill_date,total_amount,accounting_vendors(id,legal_name,pan,gstin)").is("deleted_at", null).order("bill_date", { ascending: false }).limit(500),
    client.from("coa_accounts").select("id,code,name,is_posting_allowed,is_active").eq("is_active", true).eq("is_posting_allowed", true).order("code")
  ]);
  [sections, deductees, deductions, documents, bills, accounts].forEach((res) => { if (res.error) throw res.error; });
  return { sections: sections.data || [], deductees: deductees.data || [], deductions: deductions.data || [], documents: documents.data || [], bills: bills.data || [], accounts: accounts.data || [] };
}

export async function saveTdsSection(payload) {
  const client = getSupabaseClient();
  const query = payload.id ? client.from("tds_sections").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", payload.id) : client.from("tds_sections").insert(payload);
  const { data, error } = await query.select("*").single();
  if (error) throw error;
  return data;
}

export async function saveTdsDeductee(payload) {
  const client = getSupabaseClient();
  const query = payload.id ? client.from("tds_deductees").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", payload.id) : client.from("tds_deductees").insert(payload);
  const { data, error } = await query.select("*").single();
  if (error) throw error;
  return data;
}

export async function saveTdsDeduction(payload) {
  const client = getSupabaseClient();
  const query = payload.id ? client.from("tds_deductions").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", payload.id) : client.from("tds_deductions").insert(payload);
  const { data, error } = await query.select("*").single();
  if (error) throw error;
  return data;
}

export async function approveTdsDeduction(id) {
  const client = getSupabaseClient();
  const { data, error } = await client.from("tds_deductions").update({ filing_status: "return_prepared", approved_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id).select("*").single();
  if (error) throw error;
  return data;
}

export async function postTdsDeduction({ id, debitAccountId, creditAccountId }) {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("post_tds_deduction", { p_deduction_id: id, p_debit_account_id: debitAccountId, p_credit_account_id: creditAccountId });
  if (error) throw error;
  return data;
}

export async function getFixedAssetsDataset() {
  const client = getSupabaseClient();
  const [assets, movements, runs, vendors, bills, divisions, accounts] = await Promise.all([
    client.from("fixed_assets").select("*,divisions(id,name),accounting_vendors(id,legal_name),purchase_bills(id,bill_no)").order("acquisition_date", { ascending: false }),
    client.from("fixed_asset_movements").select("*,fixed_assets(id,asset_code,asset_name),from_division:from_division_id(id,name),to_division:to_division_id(id,name)").order("movement_date", { ascending: false }),
    client.from("fixed_asset_depreciation_runs").select("*,journal_entries(id,journal_no)").order("run_month", { ascending: false }),
    client.from("accounting_vendors").select("id,legal_name,vendor_code").is("deleted_at", null).order("legal_name"),
    client.from("purchase_bills").select("id,bill_no,bill_date,total_amount,vendor_id").is("deleted_at", null).order("bill_date", { ascending: false }),
    client.from("divisions").select("id,code,name").eq("is_active", true).order("name"),
    client.from("coa_accounts").select("id,code,name,is_posting_allowed,is_active").eq("is_active", true).eq("is_posting_allowed", true).order("code")
  ]);
  [assets, movements, runs, vendors, bills, divisions, accounts].forEach((res) => { if (res.error) throw res.error; });
  return { assets: assets.data || [], movements: movements.data || [], runs: runs.data || [], vendors: vendors.data || [], bills: bills.data || [], divisions: divisions.data || [], accounts: accounts.data || [] };
}

export async function saveFixedAsset(payload) {
  const client = getSupabaseClient();
  const query = payload.id ? client.from("fixed_assets").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", payload.id) : client.from("fixed_assets").insert(payload);
  const { data, error } = await query.select("*").single();
  if (error) throw error;
  return data;
}

export async function saveFixedAssetMovement(payload) {
  const client = getSupabaseClient();
  const { data, error } = await client.from("fixed_asset_movements").insert(payload).select("*").single();
  if (error) throw error;
  return data;
}

export async function saveFixedAssetDepreciationRun(payload) {
  const client = getSupabaseClient();
  const query = payload.id ? client.from("fixed_asset_depreciation_runs").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", payload.id) : client.from("fixed_asset_depreciation_runs").insert(payload);
  const { data, error } = await query.select("*").single();
  if (error) throw error;
  return data;
}

export async function approveFixedAssetDepreciationRun(id) {
  const client = getSupabaseClient();
  const { data, error } = await client.from("fixed_asset_depreciation_runs").update({ status: "approved", approved_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id).select("*").single();
  if (error) throw error;
  return data;
}

export async function postFixedAssetDepreciationRun({ id, expenseAccountId, accumulatedDepreciationAccountId }) {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("post_fixed_asset_depreciation_run", { p_run_id: id, p_expense_account_id: expenseAccountId, p_accumulated_depreciation_account_id: accumulatedDepreciationAccountId });
  if (error) throw error;
  return data;
}

export async function getCloseControlsDataset() {
  const client = getSupabaseClient();
  const [checklists, tasks, periods, users] = await Promise.all([
    client.from("accounting_close_checklists").select("*,accounting_periods(id,period_code,period_name,status)").order("close_month", { ascending: false }),
    client.from("accounting_close_tasks").select("*,app_users:owner_app_user_id(id,display_name,email)").order("due_date"),
    client.from("accounting_periods").select("id,period_code,period_name,status,start_date,end_date").order("start_date", { ascending: false }),
    client.from("app_users").select("id,display_name,email,status").eq("status", "active").order("display_name")
  ]);
  [checklists, tasks, periods, users].forEach((res) => { if (res.error) throw res.error; });
  return { checklists: checklists.data || [], tasks: tasks.data || [], periods: periods.data || [], users: users.data || [] };
}

export async function saveCloseChecklist(payload) {
  const client = getSupabaseClient();
  const query = payload.id ? client.from("accounting_close_checklists").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", payload.id) : client.from("accounting_close_checklists").insert(payload);
  const { data, error } = await query.select("*").single();
  if (error) throw error;
  return data;
}

export async function saveCloseTask(payload) {
  const client = getSupabaseClient();
  const query = payload.id ? client.from("accounting_close_tasks").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", payload.id) : client.from("accounting_close_tasks").insert(payload);
  const { data, error } = await query.select("*").single();
  if (error) throw error;
  return data;
}

export async function closeAccountingChecklist(id) {
  const client = getSupabaseClient();
  const { error } = await client.rpc("close_accounting_checklist", { p_checklist_id: id });
  if (error) throw error;
}

export async function reopenAccountingChecklist(id, reason) {
  const client = getSupabaseClient();
  const { error } = await client.rpc("reopen_accounting_checklist", { p_checklist_id: id, p_reason: reason });
  if (error) throw error;
}

export async function getBudgetsProfitabilityDataset() {
  const client = getSupabaseClient();
  const [budgets, lines, accounts, divisions, snapshots, docs] = await Promise.all([
    client.from("accounting_budgets").select("*,divisions(id,name)").order("financial_year", { ascending: false }).order("budget_code"),
    client.from("accounting_budget_lines").select("*,coa_accounts(id,code,name,account_class),reporting_dimensions(id,code,name)").order("period_code"),
    client.from("coa_accounts").select("id,code,name,account_class,is_posting_allowed,is_active").eq("is_active", true).eq("is_posting_allowed", true).order("code"),
    client.from("divisions").select("id,code,name").eq("is_active", true).order("name"),
    client.from("profitability_snapshots").select("*,divisions(id,name)").order("snapshot_date", { ascending: false }).limit(100),
    client.from("financial_documents").select("id,division_id,document_family,source_module,document_date,gross_amount,net_amount,taxable_amount,status").is("deleted_at", null).limit(5000)
  ]);
  [budgets, lines, accounts, divisions, snapshots, docs].forEach((res) => { if (res.error) throw res.error; });
  return { budgets: budgets.data || [], lines: lines.data || [], accounts: accounts.data || [], divisions: divisions.data || [], snapshots: snapshots.data || [], documents: docs.data || [] };
}

export async function saveAccountingBudget(payload) {
  const client = getSupabaseClient();
  const query = payload.id ? client.from("accounting_budgets").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", payload.id) : client.from("accounting_budgets").insert(payload);
  const { data, error } = await query.select("*").single();
  if (error) throw error;
  return data;
}

export async function saveAccountingBudgetLine(payload) {
  const client = getSupabaseClient();
  const query = payload.id ? client.from("accounting_budget_lines").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", payload.id) : client.from("accounting_budget_lines").insert(payload);
  const { data, error } = await query.select("*").single();
  if (error) throw error;
  return data;
}

export async function saveProfitabilitySnapshot(payload) {
  const client = getSupabaseClient();
  const { data, error } = await client.from("profitability_snapshots").insert(payload).select("*").single();
  if (error) throw error;
  return data;
}

export async function getAuditWorkspaceDataset() {
  const client = getSupabaseClient();
  const [requests, evidence] = await Promise.all([
    client.from("audit_workspace_requests").select("*,assigned:assigned_to(id,display_name,email),requested:requested_by(id,display_name,email)").order("created_at", { ascending: false }),
    client.from("accounting_control_evidence").select("*,maker:maker_app_user_id(id,display_name,email),checker:checker_app_user_id(id,display_name,email)").order("captured_at", { ascending: false }).limit(500)
  ]);
  [requests, evidence].forEach((res) => { if (res.error) throw res.error; });
  return { requests: requests.data || [], evidence: evidence.data || [] };
}

export async function saveAuditWorkspaceRequest(payload) {
  const client = getSupabaseClient();
  const query = payload.id ? client.from("audit_workspace_requests").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", payload.id) : client.from("audit_workspace_requests").insert(payload);
  const { data, error } = await query.select("*").single();
  if (error) throw error;
  return data;
}

export async function saveAccountingControlEvidence(payload) {
  const client = getSupabaseClient();
  const { data, error } = await client.from("accounting_control_evidence").insert(payload).select("*").single();
  if (error) throw error;
  return data;
}

export async function getManualVoucherDataset() {
  const client=getSupabaseClient();
  const [vouchers,lines,accounts,divisions]=await Promise.all([
    client.from("accounting_vouchers").select("*").order("voucher_date",{ascending:false}).order("created_at",{ascending:false}),
    client.from("accounting_voucher_lines").select("*").order("line_no"),
    client.from("coa_accounts").select("id,code,name,account_class,is_posting_allowed,is_active").eq("is_active",true).eq("is_posting_allowed",true).order("code"),
    client.from("divisions").select("id,code,name").eq("is_active",true).order("name")
  ]);
  [vouchers,lines,accounts,divisions].forEach(r=>{if(r.error)throw r.error;});
  return {vouchers:vouchers.data||[],lines:lines.data||[],accounts:accounts.data||[],divisions:divisions.data||[]};
}
export async function createManualVoucher(payload){const c=getSupabaseClient();const{data,error}=await c.rpc("create_accounting_voucher",payload);if(error)throw error;return data;}
export async function approveManualVoucher(id){const c=getSupabaseClient();const{error}=await c.rpc("approve_accounting_voucher",{p_voucher_id:id});if(error)throw error;}
export async function postManualVoucher(id){const c=getSupabaseClient();const{data,error}=await c.rpc("post_accounting_voucher",{p_voucher_id:id});if(error)throw error;return data;}
