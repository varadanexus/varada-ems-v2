import { ROLE_MODULE_PERMISSIONS } from "../config/roles.js";

export function hasModulePermission(userRole, moduleCode, action) {
  const roleMap = ROLE_MODULE_PERMISSIONS[userRole] || {};
  const allowedActions = roleMap[moduleCode] || [];
  return allowedActions.includes(action);
}

export function hasDivisionAccess(_user, _divisionId) {
  // Sprint 1 placeholder for future division-aware enforcement.
  return true;
}

export function getTenantIdPlaceholder() {
  // Sprint 1 placeholder for future multi-tenant context.
  return null;
}
