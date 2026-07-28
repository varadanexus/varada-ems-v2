import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiErrorResponse, requireRequestContext } from "@/lib/api/request-context";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { imageRequestSchema } from "@/modules/content/schemas";
import { generateImage } from "@/services/ai/image-service";

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  let user;
  try {
    user = await requireRequestContext(request, "create");
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
  const rate = checkRateLimit(`image:${user.authUserId}`, 4, 60_000);
  if (!rate.allowed) {
    return NextResponse.json(
      { data: null, error: { code: "RATE_LIMITED", message: "Image generation limit reached." }, meta: { requestId } },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } },
    );
  }
  try {
    const input = imageRequestSchema.parse(await request.json());
    const data = await generateImage(input);
    return NextResponse.json({ data, error: null, meta: { requestId } });
  } catch (error) {
    const validation = error instanceof z.ZodError;
    return NextResponse.json(
      {
        data: null,
        error: {
          code: validation ? "VALIDATION_ERROR" : "PROVIDER_UNAVAILABLE",
          message: error instanceof Error ? error.message : "Image generation failed.",
        },
        meta: { requestId },
      },
      { status: validation ? 400 : 503 },
    );
  }
}
