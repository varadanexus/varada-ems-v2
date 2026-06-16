import { MODULES } from "../config/constants.js";
import { PERMISSIONS, ROLE_MODULE_PERMISSIONS, ROLES } from "../config/roles.js";

const MODULE_PERMISSION_ALIASES = {
  [MODULES.TRANSPORT_FINANCE_APPROVAL]: [MODULES.TRANSPORT_FINANCE_APPROVAL, MODULES.TRANSPORT_LEDGER],
  [MODULES.TRANSPORT_FINANCE_POSTING]: [MODULES.TRANSPORT_FINANCE_POSTING, MODULES.TRANSPORT_FINANCE_APPROVAL, MODULES.TRANSPORT_LEDGER]
};

function normalizeRoleCodes(userRoleOrRoles) {
  if (Array.isArray(userRoleOrRoles)) return userRoleOrRoles.filter(Boolean);
  return userRoleOrRoles ? [userRoleOrRoles] : [];
}

function hasRole(roleCodes, roleCode) {
  return normalizeRoleCodes(roleCodes).includes(roleCode);
}

function getModuleCandidates(moduleCode) {
  return Array.from(new Set([moduleCode, ...(MODULE_PERMISSION_ALIASES[moduleCode] || [])]));
}

export function hasModulePermission(userRole, moduleCode, action) {
  const roleMap = ROLE_MODULE_PERMISSIONS[userRole] || {};
  return getModuleCandidates(moduleCode).some((candidate) => (roleMap[candidate] || []).includes(action));
}

export function hasAnyRolePermission(userRoleOrRoles, moduleCode, action, options = {}) {
  const roleCodes = normalizeRoleCodes(userRoleOrRoles);
  const localPermission = roleCodes.some((roleCode) => hasModulePermission(roleCode, moduleCode, action));
  if (localPermission) return true;
  if (action !== PERMISSIONS.VIEW) return false;
  const allowedModules = Array.isArray(options.allowedModules) ? options.allowedModules : [];
  return getModuleCandidates(moduleCode).some((candidate) => allowedModules.includes(candidate));
}

export function getAccessibleModules(userRoleOrRoles, allowedModules = []) {
  const result = new Set(Array.isArray(allowedModules) ? allowedModules : []);
  normalizeRoleCodes(userRoleOrRoles).forEach((roleCode) => {
    const roleMap = ROLE_MODULE_PERMISSIONS[roleCode] || {};
    Object.entries(roleMap).forEach(([moduleCode, actions]) => {
      if (Array.isArray(actions) && actions.includes(PERMISSIONS.VIEW)) result.add(moduleCode);
    });
  });
  return [...result];
}

export function getUserDivisionAccessContext(user, divisionId, options = {}) {
  const roleCodes = normalizeRoleCodes(options.roleCodes || user?.roleCodes || user?.role_codes);
  const allowAdminGlobalFallback = options.allowAdminGlobalFallback ?? true;
  const allowWhenAssignmentsMissing = options.allowWhenAssignmentsMissing
    ?? hasRole(roleCodes, ROLES.SUPER_ADMIN)
    ?? hasRole(roleCodes, ROLES.ADMIN);
  if (!divisionId) {
    return { allowed: true, reason: "no_division_required", assignedDivisionIds: [], roleCodes, isGlobalAccess: false };
  }
  if (hasRole(roleCodes, ROLES.SUPER_ADMIN)) {
    return { allowed: true, reason: "super_admin_global_access", assignedDivisionIds: [], roleCodes, isGlobalAccess: true };
  }
  const rawAssignments = Array.isArray(user?.user_divisions)
    ? user.user_divisions
    : Array.isArray(user?.divisions)
      ? user.divisions
      : [];
  const assignedDivisionIds = rawAssignments
    .map((assignment) => assignment?.division_id || assignment?.divisions?.id || assignment?.id || null)
    .filter(Boolean)
    .map((value) => String(value));
  const hasGlobalScope = rawAssignments.some((assignment) => String(assignment?.scope || "").toLowerCase() === "all");
  if (hasGlobalScope) {
    return { allowed: true, reason: "global_division_scope", assignedDivisionIds, roleCodes, isGlobalAccess: true };
  }
  if (!assignedDivisionIds.length) {
    const adminFallbackAllowed = allowAdminGlobalFallback && hasRole(roleCodes, ROLES.ADMIN);
    return {
      allowed: Boolean(adminFallbackAllowed || allowWhenAssignmentsMissing),
      reason: adminFallbackAllowed ? "admin_global_fallback" : "division_assignments_missing",
      assignedDivisionIds,
      roleCodes,
      isGlobalAccess: Boolean(adminFallbackAllowed || allowWhenAssignmentsMissing)
    };
  }
  const allowed = assignedDivisionIds.includes(String(divisionId));
  return {
    allowed,
    reason: allowed ? "division_assigned" : "division_not_assigned",
    assignedDivisionIds,
    roleCodes,
    isGlobalAccess: false
  };
}

export function hasDivisionAccess(user, divisionId, options = {}) {
  return getUserDivisionAccessContext(user, divisionId, options).allowed;
}

export function getTenantIdPlaceholder() {
  // Sprint 1 placeholder for future multi-tenant context.
  return null;
}
