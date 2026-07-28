import { apiErrorResponse, requireRequestContext } from "@/lib/api/request-context";
import { getAnalytics } from "@/services/social/repository";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireRequestContext(request, "view");
    const days = Number(new URL(request.url).searchParams.get("days") || 30);
    const data = await getAnalytics(days);
    return Response.json({ data, error: null, meta: { requestId } });
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}
