import { apiErrorResponse, requireRequestContext } from "@/lib/api/request-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshTrendSignals } from "@/services/trends/trend-service";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireRequestContext(request, "view");
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("social_trend_signals")
      .select("*")
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order("score", { ascending: false })
      .limit(100);
    if (error) throw error;
    return Response.json({ data: data || [], error: null, meta: { requestId } });
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireRequestContext(request, "edit");
    const count = await refreshTrendSignals();
    return Response.json({ data: { synchronized: count }, error: null, meta: { requestId } });
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}
