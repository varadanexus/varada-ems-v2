export const roles = [
  "super_admin",
  "admin",
  "social_media_manager",
  "content_creator",
  "viewer",
  "client",
] as const;

export type UserRole = (typeof roles)[number];

export const permissions = [
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
] as const;

export type Permission = (typeof permissions)[number];
