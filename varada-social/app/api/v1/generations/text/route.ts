import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiErrorResponse, requireRequestContext } from "@/lib/api/request-context";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { generationRequestSchema } from "@/modules/content/schemas";
import { buildContentPrompt } from "@/services/ai/content-prompt";
import { collectEmsContext } from "@/services/ems/context-service";
import { generateContent } from "@/services/ai/provider-router";
import { recordTextGeneration } from "@/services/persistence/generation-log";

const requestSchema = generationRequestSchema.extend({
  preferredProvider: z.enum(["vertex", "openai", "anthropic", "gemini"]).optional(),
});

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  let user;
  try {
    user = await requireRequestContext(request, "create");
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }

  const rate = checkRateLimit(`text:${user.authUserId}`, 10, 60_000);
  if (!rate.allowed) {
    return NextResponse.json(
      { data: null, error: { code: "RATE_LIMITED", message: "Generation limit reached." }, meta: { requestId } },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } },
    );
  }

  try {
    const startedAt = Date.now();
    const input = requestSchema.parse(await request.json());
    const emsContext = input.includeEmsContext
      ? await collectEmsContext(input.emsModules)
      : "";
    const prompt = buildContentPrompt(input, emsContext);
    const result = await generateContent(prompt, input, input.preferredProvider);
    await recordTextGeneration({
      authUserId: user.authUserId,
      request: input,
      result,
      latencyMs: Date.now() - startedAt,
    });
    return NextResponse.json({
      data: result,
      error: null,
      meta: { requestId, emsContextUsed: Boolean(emsContext) },
    });
  } catch (error) {
    const validation = error instanceof z.ZodError;
    const message = error instanceof Error ? error.message : "Content generation failed.";
    return NextResponse.json(
      {
        data: null,
        error: {
          code: validation ? "VALIDATION_ERROR" : "PROVIDER_UNAVAILABLE",
          message,
        },
        meta: { requestId },
      },
      { status: validation ? 400 : 503 },
    );
  }
}
