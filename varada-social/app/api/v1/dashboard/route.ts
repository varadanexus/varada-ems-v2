import { apiErrorResponse, requireRequestContext } from "@/lib/api/request-context";
import { getDashboard } from "@/services/social/repository";
import { refreshTrendSignals } from "@/services/trends/trend-service";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const user = await requireRequestContext(request, "view");
    let data = await getDashboard(user.displayName.split(" ")[0] || "there");
    if (!data.trends.length) {
      await refreshTrendSignals();
      data = await getDashboard(user.displayName.split(" ")[0] || "there");
    }
    return Response.json({ data, error: null, meta: { requestId } });
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}
