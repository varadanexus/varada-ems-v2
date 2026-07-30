import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/security/encryption";

const graphVersion = process.env.META_GRAPH_VERSION || "v24.0";

export async function syncMetaAnalytics() {
  const admin = createAdminClient();
  const { data: channels, error } = await admin
    .from("social_content_channels")
    .select("id,platform,external_post_id,social_accounts(credential_ciphertext)")
    .in("platform", ["instagram", "facebook"])
    .eq("status", "published")
    .not("external_post_id", "is", null);
  if (error) throw error;
  let synchronized = 0;
  for (const channel of channels || []) {
    try {
      const accountValue = channel.social_accounts;
      const account = (Array.isArray(accountValue) ? accountValue[0] : accountValue) as
        | { credential_ciphertext?: string }
        | null;
      if (!account?.credential_ciphertext) continue;
      const { accessToken } = JSON.parse(decryptSecret(account.credential_ciphertext)) as {
        accessToken?: string;
      };
      if (!accessToken) continue;
      const metrics = channel.platform === "instagram"
        ? "likes,comments,shares,saved,reach,views"
        : "post_impressions,post_impressions_unique,post_engaged_users";
      const url = new URL(
        `https://graph.facebook.com/${graphVersion}/${channel.external_post_id}/insights`,
      );
      url.searchParams.set("metric", metrics);
      url.searchParams.set("access_token", accessToken);
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) continue;
      const payload = (await response.json()) as {
        data?: Array<{ name: string; values?: Array<{ value: number }>; value?: number }>;
      };
      const values = Object.fromEntries(
        (payload.data || []).map((item) => [
          item.name,
          Number(item.value ?? item.values?.[0]?.value ?? 0),
        ]),
      );
      const likes = values.likes || 0;
      const comments = values.comments || 0;
      const shares = values.shares || 0;
      const saves = values.saved || 0;
      const reach = values.reach || values.post_impressions_unique || 0;
      const impressions = values.views || values.post_impressions || 0;
      const interactions = likes + comments + shares + saves + (values.post_engaged_users || 0);
      await admin.from("social_post_metrics").insert({
        channel_id: channel.id,
        captured_at: new Date().toISOString(),
        likes,
        comments,
        shares,
        saves,
        reach,
        impressions,
        engagement_rate: impressions ? (interactions / impressions) * 100 : 0,
        raw_metrics: values,
      });
      synchronized += 1;
    } catch {
      // One inaccessible post must not block synchronization of other accounts.
    }
  }
  return synchronized;
}
