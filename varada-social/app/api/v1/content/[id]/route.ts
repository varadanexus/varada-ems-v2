import { z } from "zod";
import { apiErrorResponse, requireRequestContext } from "@/lib/api/request-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/services/social/audit";

const patchSchema = z.object({
  title: z.string().min(2).max(180).optional(),
  topic: z.string().max(1000).optional(),
  objective: z.string().max(500).optional(),
  tone: z.string().max(120).optional(),
  contentPackage: z.record(z.string(), z.unknown()).optional(),
  platforms: z.array(z.string()).min(1).optional(),
  scheduledFor: z.string().datetime().nullable().optional(),
});

export async function GET(request: Request, context: RouteContext<"/api/v1/content/[id]">) {
  const requestId = crypto.randomUUID();
  try {
    await requireRequestContext(request, "view");
    const { id } = await context.params;
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("social_content_items")
      .select("*,social_media_assets(*),social_content_channels(*,social_accounts(id,platform,display_name,status)),social_approval_actions(*,app_users(display_name,email))")
      .eq("id", id)
      .single();
    if (error) throw error;
    return Response.json({ data, error: null, meta: { requestId } });
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

export async function PATCH(request: Request, context: RouteContext<"/api/v1/content/[id]">) {
  const requestId = crypto.randomUUID();
  try {
    const user = await requireRequestContext(request, "edit");
    const { id } = await context.params;
    const input = patchSchema.parse(await request.json());
    const admin = createAdminClient();
    const { data: before } = await admin.from("social_content_items").select("*").eq("id", id).single();
    const updates = {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.topic !== undefined && { topic: input.topic }),
      ...(input.objective !== undefined && { objective: input.objective }),
      ...(input.tone !== undefined && { tone: input.tone }),
      ...(input.contentPackage !== undefined && { content_package: input.contentPackage }),
      ...(input.platforms !== undefined && { platforms: input.platforms }),
      ...(input.scheduledFor !== undefined && { scheduled_for: input.scheduledFor }),
      updated_by: user.appUserId,
      version: Number(before?.version || 1) + 1,
    };
    const { data, error } = await admin
      .from("social_content_items")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    await writeAudit({
      actorId: user.appUserId,
      action: "content.updated",
      resourceType: "social_content",
      resourceId: id,
      requestId,
      before,
      after: data,
    });
    return Response.json({ data, error: null, meta: { requestId } });
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}
