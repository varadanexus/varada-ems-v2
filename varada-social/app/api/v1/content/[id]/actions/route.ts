import { z } from "zod";
import { ApiError, apiErrorResponse, requireRequestContext } from "@/lib/api/request-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueuePublishing, processPublishingJobs } from "@/services/publishing/job-service";
import { writeAudit } from "@/services/social/audit";
import { transition } from "@/modules/workflow/state-machine";
import type { ContentStatus } from "@/types/social";

const actionSchema = z.object({
  action: z.enum(["submit", "approve", "reject", "recall", "schedule", "publish", "duplicate", "archive"]),
  comment: z.string().max(1000).optional(),
  scheduledFor: z.string().datetime().optional(),
});

export async function POST(request: Request, context: RouteContext<"/api/v1/content/[id]/actions">) {
  const requestId = crypto.randomUUID();
  try {
    const { id } = await context.params;
    const input = actionSchema.parse(await request.json());
    const permission = ["approve", "reject"].includes(input.action)
      ? "approve"
      : ["schedule", "publish"].includes(input.action)
        ? "post"
        : "edit";
    const user = await requireRequestContext(request, permission);
    const admin = createAdminClient();
    const { data: content, error } = await admin
      .from("social_content_items")
      .select("*")
      .eq("id", id)
      .single();
    if (error || !content) throw new ApiError(404, "NOT_FOUND", "Content was not found.");

    if (input.action === "duplicate") {
      const copy = { ...content };
      delete copy.id;
      delete copy.created_at;
      delete copy.updated_at;
      const { data: duplicate, error: duplicateError } = await admin
        .from("social_content_items")
        .insert({
          ...copy,
          title: `${content.title} (Copy)`,
          parent_id: id,
          status: "draft",
          scheduled_for: null,
          published_at: null,
          rejection_reason: null,
          created_by: user.appUserId,
          updated_by: user.appUserId,
          version: 1,
        })
        .select()
        .single();
      if (duplicateError) throw duplicateError;
      const { data: channels } = await admin
        .from("social_content_channels")
        .select("platform,account_id")
        .eq("content_id", id);
      if (channels?.length) {
        await admin.from("social_content_channels").insert(
          channels.map((channel) => ({ ...channel, content_id: duplicate.id, status: "draft" })),
        );
      }
      return Response.json({ data: duplicate, error: null, meta: { requestId } });
    }

    let nextStatus = content.status as string;
    let approvalAction: string | null = null;
    if (["submit", "approve", "reject", "recall", "archive"].includes(input.action)) {
      try {
        const result = transition(
          content.status as ContentStatus,
          input.action as "submit" | "approve" | "reject" | "recall" | "archive",
        );
        nextStatus = result.status;
        approvalAction = result.approvalAction;
      } catch (reason) {
        throw new ApiError(409, "INVALID_TRANSITION", reason instanceof Error ? reason.message : "Invalid workflow transition.");
      }
    } else if (input.action === "schedule") {
      if (!input.scheduledFor) throw new ApiError(400, "SCHEDULE_REQUIRED", "Choose a publishing time.");
      await enqueuePublishing(id, new Date(input.scheduledFor));
      nextStatus = "scheduled";
    } else if (input.action === "publish") {
      await enqueuePublishing(id, new Date());
      await processPublishingJobs(20);
      nextStatus = "publishing";
    }

    const update: Record<string, unknown> = {
      status: nextStatus,
      updated_by: user.appUserId,
      rejection_reason: input.action === "reject" ? input.comment || "Rejected" : null,
      archived_at: input.action === "archive" ? new Date().toISOString() : null,
    };
    if (input.action === "schedule") update.scheduled_for = input.scheduledFor;
    const { data, error: updateError } = await admin
      .from("social_content_items")
      .update(update)
      .eq("id", id)
      .select()
      .single();
    if (updateError) throw updateError;
    await admin
      .from("social_content_channels")
      .update({ status: nextStatus, ...(input.action === "schedule" && { scheduled_for: input.scheduledFor }) })
      .eq("content_id", id);
    if (approvalAction) {
      await admin.from("social_approval_actions").insert({
        content_id: id,
        actor_id: user.appUserId,
        action: approvalAction,
        from_status: content.status,
        to_status: nextStatus,
        comment: input.comment || null,
      });
    }
    await writeAudit({
      actorId: user.appUserId,
      action: `content.${input.action}`,
      resourceType: "social_content",
      resourceId: id,
      requestId,
      before: content,
      after: data,
    });
    return Response.json({ data, error: null, meta: { requestId } });
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}
