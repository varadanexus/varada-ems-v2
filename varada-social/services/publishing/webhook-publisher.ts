import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStoredSecret } from "@/services/settings/secret-store";

export async function publishThroughN8n(channelId: string) {
  const [webhook, secret] = await Promise.all([
    getStoredSecret("n8n", "publish_webhook", process.env.N8N_PUBLISH_WEBHOOK_URL),
    getStoredSecret("n8n", "webhook_secret", process.env.N8N_WEBHOOK_SECRET),
  ]);
  if (!webhook || !secret) {
    throw new Error("Configure the n8n publishing webhook for this platform.");
  }
  const admin = createAdminClient();
  const { data: channel, error } = await admin
    .from("social_content_channels")
    .select("*,social_accounts(id,platform,external_account_id,display_name),social_content_items(*,social_media_assets(*))")
    .eq("id", channelId)
    .single();
  if (error || !channel) throw new Error("Publishing channel was not found.");
  const response = await fetch(webhook, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Nexus-Signature": secret,
    },
    body: JSON.stringify({ event: "social.publish", channel }),
  });
  const result = (await response.json()) as {
    externalId?: string;
    permalink?: string;
    error?: string;
  };
  if (!response.ok || !result.externalId) {
    throw new Error(result.error || "The publishing workflow did not return a post ID.");
  }
  return { externalId: result.externalId, permalink: result.permalink || null };
}
