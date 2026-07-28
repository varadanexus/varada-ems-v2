import { processPublishingJobs } from "@/services/publishing/job-service";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const data = await processPublishingJobs(25);
  return Response.json({ data, error: null });
}
