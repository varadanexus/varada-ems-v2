import { syncMetaAnalytics } from "@/services/analytics/meta-sync";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const synchronized = await syncMetaAnalytics();
  return Response.json({ data: { synchronized }, error: null });
}
