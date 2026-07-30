import { apiErrorResponse, requireRequestContext } from "@/lib/api/request-context";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireRequestContext(request, "view_audit");
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("social_audit_logs")
      .select("*,app_users(display_name,email)")
      .order("created_at", { ascending: false })
      .limit(250);
    if (error) throw error;
    return Response.json({ data: data || [], error: null, meta: { requestId } });
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}
