import { z } from "zod";
import { apiErrorResponse, requireRequestContext } from "@/lib/api/request-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret } from "@/lib/security/encryption";
import { getDefaultBrandId } from "@/services/social/repository";
import { writeAudit } from "@/services/social/audit";

const accountSchema = z.object({
  platform: z.enum(["instagram", "facebook", "linkedin", "x", "threads", "pinterest", "google_business", "youtube_community"]),
  externalAccountId: z.string().min(2).max(250),
  displayName: z.string().min(2).max(120),
  username: z.string().max(120).optional(),
  accessToken: z.string().min(8),
  expiresAt: z.string().datetime().nullable().optional(),
});

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireRequestContext(request, "view");
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("social_accounts")
      .select("id,platform,external_account_id,display_name,username,credential_expires_at,status,metadata,created_at,updated_at")
      .order("created_at");
    if (error) throw error;
    return Response.json({ data: data || [], error: null, meta: { requestId } });
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const user = await requireRequestContext(request, "edit");
    const input = accountSchema.parse(await request.json());
    const admin = createAdminClient();
    const brandId = await getDefaultBrandId();
    const { data, error } = await admin.from("social_accounts").upsert({
      brand_id: brandId,
      platform: input.platform,
      external_account_id: input.externalAccountId,
      display_name: input.displayName,
      username: input.username || null,
      credential_ciphertext: encryptSecret(JSON.stringify({ accessToken: input.accessToken })),
      credential_expires_at: input.expiresAt || null,
      status: "active",
      connected_by: user.appUserId,
    }, { onConflict: "platform,external_account_id" }).select("id,platform,display_name,status").single();
    if (error) throw error;
    await writeAudit({
      actorId: user.appUserId,
      action: "account.connected",
      resourceType: "social_account",
      resourceId: data.id,
      requestId,
      after: data,
    });
    return Response.json({ data, error: null, meta: { requestId } }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}
