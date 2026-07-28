import type { Permission, UserRole } from "@/types/auth";

const rolePermissions: Record<UserRole, ReadonlySet<Permission>> = {
  super_admin: new Set([
    "workspace.manage",
    "members.manage",
    "content.create",
    "content.edit",
    "content.review",
    "content.approve",
    "content.publish",
    "analytics.view",
    "settings.manage",
    "audit.view",
  ]),
  admin: new Set([
    "members.manage",
    "content.create",
    "content.edit",
    "content.review",
    "content.approve",
    "content.publish",
    "analytics.view",
    "settings.manage",
    "audit.view",
  ]),
  social_media_manager: new Set([
    "content.create",
    "content.edit",
    "content.review",
    "content.approve",
    "content.publish",
    "analytics.view",
  ]),
  content_creator: new Set([
    "content.create",
    "content.edit",
    "analytics.view",
  ]),
  viewer: new Set(["analytics.view"]),
  client: new Set(["content.review", "analytics.view"]),
};

export function can(role: UserRole, permission: Permission): boolean {
  return rolePermissions[role].has(permission);
}

export function requirePermission(
  role: UserRole,
  permission: Permission,
): void {
  if (!can(role, permission)) {
    throw new Error(`Role "${role}" cannot perform "${permission}".`);
  }
}
