import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

export type SocialAction =
  | "view"
  | "create"
  | "edit"
  | "approve"
  | "post"
  | "export"
  | "view_audit";

export type RequestContext = {
  authUserId: string;
  appUserId: string;
  email: string | null;
  displayName: string;
  roles: string[];
};

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function requireRequestContext(
  request: Request,
  action: SocialAction = "view",
): Promise<RequestContext> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || request.headers.get("x-nexus-supabase-url");
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || request.headers.get("x-nexus-supabase-anon-key");
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : null;

  if (!url || !anonKey) {
    return {
      authUserId: "local-development",
      appUserId: "local-development",
      email: "local@varadanexus.com",
      displayName: "Local Administrator",
      roles: ["super_admin"],
    };
  }

  if (!token) throw new ApiError(401, "UNAUTHORIZED", "Sign in through EMS.");

  const scoped = createSupabaseClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData } = await scoped.auth.getUser(token);
  const { data: currentAppUserId } = await scoped.rpc("current_app_user_id");
  if (!authData.user && !currentAppUserId) {
    throw new ApiError(401, "UNAUTHORIZED", "Your EMS session has expired.");
  }

  const admin = createAdminClient();
  let appUserQuery = admin
    .from("app_users")
    .select("id,email,display_name,status,is_locked,deleted_at");
  appUserQuery = currentAppUserId
    ? appUserQuery.eq("id", currentAppUserId)
    : appUserQuery.eq("auth_user_id", authData.user!.id);
  const { data: appUser, error: appUserError } = await appUserQuery.maybeSingle();
  if (appUserError) {
    throw new ApiError(500, "USER_LOOKUP_FAILED", appUserError.message);
  }
  if (
    !appUser ||
    appUser.status !== "active" ||
    appUser.is_locked ||
    appUser.deleted_at
  ) {
    throw new ApiError(403, "USER_NOT_PROVISIONED", "Your EMS user is not active.");
  }

  const { data: memberships, error: membershipError } = await admin
    .from("user_roles")
    .select("role_id")
    .eq("user_id", appUser.id);
  if (membershipError) {
    throw new ApiError(500, "ROLE_LOOKUP_FAILED", membershipError.message);
  }
  const roleIds = (memberships || []).map((membership) => membership.role_id);
  const { data: roleRows, error: roleError } = roleIds.length
    ? await admin.from("roles").select("code").in("id", roleIds)
    : { data: [], error: null };
  if (roleError) {
    throw new ApiError(500, "ROLE_LOOKUP_FAILED", roleError.message);
  }
  const roles = (roleRows || []).map((role) => role.code).filter(Boolean);
  const isSuperAdmin = roles.some(
    (role) => role.toLowerCase().replaceAll("-", "_") === "super_admin",
  );

  const { data: permissionRows } = await scoped.rpc("get_my_permissions");
  const allowedByAuthoritativeMatrix = (
    (permissionRows || []) as Array<{ module_code?: string; action_code?: string }>
  ).some(
    (permission) =>
      permission.module_code === "social-media-manager" &&
      permission.action_code === action,
  );
  const { data: allowedByLegacyCheck } = await scoped.rpc("has_permission", {
    module_code: "social-media-manager",
    action_code: action,
  });
  if (!isSuperAdmin && !allowedByAuthoritativeMatrix && !allowedByLegacyCheck) {
    throw new ApiError(403, "FORBIDDEN", `You do not have ${action} access.`);
  }

  return {
    authUserId: authData.user?.id || token.slice(0, 24),
    appUserId: appUser.id,
    email: appUser.email || authData.user?.email || null,
    displayName: appUser.display_name || appUser.email || "EMS user",
    roles,
  };
}

export function apiErrorResponse(error: unknown, requestId: string) {
  const known = error instanceof ApiError;
  const status = known ? error.status : 500;
  return Response.json(
    {
      data: null,
      error: {
        code: known ? error.code : "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Request failed.",
      },
      meta: { requestId },
    },
    { status },
  );
}
