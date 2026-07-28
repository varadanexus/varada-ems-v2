import { apiErrorResponse, requireRequestContext } from "@/lib/api/request-context";
import { availableTextProviders } from "@/services/ai/provider-router";
import { getStoredSecret } from "@/services/settings/secret-store";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireRequestContext(request, "view");
    const [text, imageKey] = await Promise.all([
      availableTextProviders(),
      getStoredSecret("openai", "api_key", process.env.OPENAI_API_KEY),
    ]);
    return Response.json({
      data: {
        text,
        image: imageKey ? ["openai"] : [],
        models: {
          openai: process.env.OPENAI_TEXT_MODEL || "gpt-5.6-sol",
          anthropic: process.env.ANTHROPIC_TEXT_MODEL || "claude-sonnet-4-5",
          gemini: process.env.GEMINI_TEXT_MODEL || "gemini-2.5-pro",
          image: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
        },
      },
      error: null,
      meta: { requestId },
    });
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}
