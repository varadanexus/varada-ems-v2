import { z } from "zod";
import { apiErrorResponse, requireRequestContext } from "@/lib/api/request-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/services/social/audit";
import { getDefaultBrandId, listContent } from "@/services/social/repository";

const contentSchema = z.object({
  title: z.string().min(2).max(180),
  format: z.enum(["single_post", "carousel", "story", "reel"]),
  platforms: z.array(z.enum([
    "instagram", "facebook", "linkedin", "x", "threads", "pinterest",
    "google_business", "youtube_community",
  ])).min(1),
  topic: z.string().max(1000).optional().default(""),
  objective: z.string().max(500).optional().default(""),
  tone: z.string().max(120).optional().default(""),
  contentPackage: z.record(z.string(), z.unknown()).optional().default({}),
  scheduledFor: z.string().datetime().nullable().optional(),
  status: z.enum(["draft", "manager_review"]).optional().default("draft"),
  asset: z.object({
    publicUrl: z.string().url(),
    storagePath: z.string().max(1000).optional(),
    mediaType: z.enum(["image", "video", "audio", "document"]).default("image"),
    mimeType: z.string().default("image/png"),
  }).nullable().optional(),
});

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireRequestContext(request, "view");
    const url = new URL(request.url);
    const data = await listContent({
      status: url.searchParams.get("status"),
      query: url.searchParams.get("q"),
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
    });
    return Response.json({ data, error: null, meta: { requestId } });
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const user = await requireRequestContext(request, "create");
    const input = contentSchema.parse(await request.json());
    const admin = createAdminClient();
    const brandId = await getDefaultBrandId();
    const { data, error } = await admin
      .from("social_content_items")
      .insert({
        brand_id: brandId,
        title: input.title,
        format: input.format,
        status: input.status,
        platforms: input.platforms,
        topic: input.topic,
        objective: input.objective,
        tone: input.tone,
        content_package: input.contentPackage,
        created_by: user.appUserId,
        updated_by: user.appUserId,
        scheduled_for: input.scheduledFor || null,
      })
      .select()
      .single();
    if (error) throw error;
    const { data: accounts } = await admin
      .from("social_accounts")
      .select("id,platform")
      .eq("brand_id", brandId)
      .eq("status", "active")
      .in("platform", input.platforms);
    const channels = input.platforms.map((platform) => ({
      content_id: data.id,
      platform,
      account_id: accounts?.find((account) => account.platform === platform)?.id || null,
      status: input.status,
      scheduled_for: input.scheduledFor || null,
    }));
    await admin.from("social_content_channels").insert(channels);
    if (input.asset) {
      await admin.from("social_media_assets").insert({
        content_id: data.id,
        storage_path: input.asset.storagePath || `external/${crypto.randomUUID()}`,
        media_type: input.asset.mediaType,
        mime_type: input.asset.mimeType,
        metadata: { public_url: input.asset.publicUrl },
        created_by: user.appUserId,
      });
    }
    if (input.status === "manager_review") {
      await admin.from("social_approval_actions").insert({
        content_id: data.id,
        actor_id: user.appUserId,
        action: "submitted",
        from_status: "draft",
        to_status: "manager_review",
      });
    }
    await writeAudit({
      actorId: user.appUserId,
      action: "content.created",
      resourceType: "social_content",
      resourceId: data.id,
      requestId,
      after: data,
    });
    return Response.json({ data, error: null, meta: { requestId } }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}
