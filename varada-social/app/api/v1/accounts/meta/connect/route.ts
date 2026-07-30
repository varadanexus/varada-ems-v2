import { apiErrorResponse, requireRequestContext } from "@/lib/api/request-context";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireRequestContext(request, "edit");
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    const authorization = request.headers.get("authorization");
    if (!supabaseUrl || !anonKey || !appUrl || !authorization) {
      throw new Error("Supabase and the EMS session must be configured.");
    }
    const response = await fetch(
      `${supabaseUrl.replace(/\/$/, "")}/functions/v1/social-media-integrations`,
      {
        method: "POST",
        headers: {
          Authorization: authorization,
          apikey: anonKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "connect_url",
          returnUrl: `${appUrl.replace(/\/$/, "")}/accounts`,
        }),
        cache: "no-store",
      },
    );
    const result = (await response.json()) as {
      data?: { url?: string };
      error?: { message?: string };
    };
    if (!response.ok || !result.data?.url) {
      throw new Error(result.error?.message || "Meta connection could not start.");
    }
    return Response.json({ data: result.data, error: null, meta: { requestId } });
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}
