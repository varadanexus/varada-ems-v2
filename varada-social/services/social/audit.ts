import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export async function writeAudit(input: {
  actorId: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  requestId?: string;
  before?: unknown;
  after?: unknown;
}) {
  if (input.actorId === "local-development") return;
  const admin = createAdminClient();
  await admin.from("social_audit_logs").insert({
    actor_id: input.actorId,
    action: input.action,
    resource_type: input.resourceType,
    resource_id: input.resourceId || null,
    request_id: input.requestId || null,
    before_data: input.before ?? null,
    after_data: input.after ?? null,
  });
}
