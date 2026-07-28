import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { publishMetaChannel } from "@/services/publishing/meta-publisher";
import { publishThroughN8n } from "@/services/publishing/webhook-publisher";

export async function enqueuePublishing(contentId: string, runAfter = new Date()) {
  const admin = createAdminClient();
  const { data: channels, error } = await admin
    .from("social_content_channels")
    .select("id,platform")
    .eq("content_id", contentId);
  if (error) throw error;
  if (!channels?.length) throw new Error("Select and connect at least one publishing channel.");
  const jobs = channels.map((channel) => ({
    channel_id: channel.id,
    idempotency_key: `${contentId}:${channel.platform}:${runAfter.toISOString()}`,
    run_after: runAfter.toISOString(),
    status: "queued",
  }));
  const { error: jobError } = await admin
    .from("social_publish_jobs")
    .upsert(jobs, { onConflict: "idempotency_key", ignoreDuplicates: true });
  if (jobError) throw jobError;
  await admin
    .from("social_content_channels")
    .update({ status: runAfter <= new Date() ? "publishing" : "scheduled", scheduled_for: runAfter.toISOString() })
    .in("id", channels.map((channel) => channel.id));
  await admin
    .from("social_content_items")
    .update({ status: runAfter <= new Date() ? "publishing" : "scheduled", scheduled_for: runAfter.toISOString() })
    .eq("id", contentId);
  return jobs.length;
}

export async function processPublishingJobs(limit = 10) {
  const admin = createAdminClient();
  const { data: jobs, error } = await admin
    .from("social_publish_jobs")
    .select("*,social_content_channels(platform,content_id)")
    .in("status", ["queued", "retrying"])
    .lte("run_after", new Date().toISOString())
    .order("run_after")
    .limit(limit);
  if (error) throw error;
  const results: Array<{ id: string; status: string; error?: string }> = [];
  for (const job of jobs || []) {
    const attempt = Number(job.attempt_count || 0) + 1;
    await admin
      .from("social_publish_jobs")
      .update({ status: "processing", attempt_count: attempt })
      .eq("id", job.id);
    try {
      const platform = job.social_content_channels?.platform as string;
      const result = platform === "instagram" || platform === "facebook"
        ? await publishMetaChannel(job.channel_id)
        : await publishThroughN8n(job.channel_id);
      const publishedAt = new Date().toISOString();
      await admin
        .from("social_publish_jobs")
        .update({ status: "succeeded", response_payload: result, last_error: null })
        .eq("id", job.id);
      await admin
        .from("social_content_channels")
        .update({
          status: "published",
          external_post_id: result.externalId,
          external_permalink: result.permalink,
          published_at: publishedAt,
        })
        .eq("id", job.channel_id);
      const contentId = job.social_content_channels?.content_id;
      const { count: remaining } = await admin
        .from("social_content_channels")
        .select("id", { count: "exact", head: true })
        .eq("content_id", contentId)
        .neq("status", "published");
      if (!remaining) {
        await admin
          .from("social_content_items")
          .update({ status: "published", published_at: publishedAt })
          .eq("id", contentId);
      }
      results.push({ id: job.id, status: "succeeded" });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Publishing failed.";
      const retry = attempt < Number(job.max_attempts || 5);
      const delayMinutes = Math.min(60, 2 ** attempt);
      const runAfter = new Date(Date.now() + delayMinutes * 60_000);
      await admin
        .from("social_publish_jobs")
        .update({
          status: retry ? "retrying" : "failed",
          run_after: runAfter.toISOString(),
          last_error: { message, attempt },
        })
        .eq("id", job.id);
      if (!retry) {
        await admin
          .from("social_content_channels")
          .update({ status: "failed" })
          .eq("id", job.channel_id);
      }
      results.push({ id: job.id, status: retry ? "retrying" : "failed", error: message });
    }
  }
  return results;
}
