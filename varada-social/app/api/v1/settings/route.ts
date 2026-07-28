import { z } from "zod";
import { apiErrorResponse, requireRequestContext } from "@/lib/api/request-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { saveSecret } from "@/services/settings/secret-store";
import { writeAudit } from "@/services/social/audit";

const secretSchema = z.object({
  provider: z.enum(["openai", "anthropic", "gemini", "meta", "linkedin", "smtp", "n8n", "webhook"]),
  keyName: z.string().min(2).max(80),
  value: z.string().min(4).max(10000),
});

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireRequestContext(request, "view");
    const admin = createAdminClient();
    const [{ data: secrets, error }, { data: brands }] = await Promise.all([
      admin
        .from("social_integration_secrets")
        .select("provider,key_name,last_four,status,updated_at")
        .order("provider"),
      admin.from("social_brands").select("*").order("name"),
    ]);
    if (error) throw error;
    const configured = [
      ["openai", "api_key", process.env.OPENAI_API_KEY],
      ["anthropic", "api_key", process.env.ANTHROPIC_API_KEY],
      ["gemini", "api_key", process.env.GOOGLE_GENERATIVE_AI_API_KEY],
      ["meta", "app_id", process.env.META_APP_ID],
      ["meta", "app_secret", process.env.META_APP_SECRET],
      ["smtp", "url", process.env.SMTP_URL],
      ["n8n", "publish_webhook", process.env.N8N_PUBLISH_WEBHOOK_URL],
    ].filter((item) => item[2]).map(([provider, keyName, value]) => ({
      provider,
      key_name: keyName,
      last_four: String(value).slice(-4),
      status: "environment",
      updated_at: null,
    }));
    const storedKeys = new Set((secrets || []).map((item) => `${item.provider}:${item.key_name}`));
    return Response.json({
      data: {
        integrations: [...(secrets || []), ...configured.filter((item) => !storedKeys.has(`${item.provider}:${item.key_name}`))],
        brands: brands || [],
      },
      error: null,
      meta: { requestId },
    });
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

export async function PUT(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const user = await requireRequestContext(request, "edit");
    const input = secretSchema.parse(await request.json());
    await saveSecret({ ...input, actorId: user.appUserId });
    await writeAudit({
      actorId: user.appUserId,
      action: "integration.secret_updated",
      resourceType: "social_integration",
      resourceId: `${input.provider}:${input.keyName}`,
      requestId,
      after: { provider: input.provider, keyName: input.keyName, lastFour: input.value.slice(-4) },
    });
    return Response.json({
      data: { provider: input.provider, keyName: input.keyName, lastFour: input.value.slice(-4) },
      error: null,
      meta: { requestId },
    });
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}
