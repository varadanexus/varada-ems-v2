import "server-only";
import { decryptSecret } from "@/lib/security/encryption";
import { createAdminClient } from "@/lib/supabase/admin";

type Account = {
  id: string;
  platform: string;
  external_account_id: string;
  credential_ciphertext: string;
  metadata: Record<string, unknown>;
};

type Content = {
  id: string;
  format: string;
  content_package: Record<string, unknown>;
  platforms: string[];
};

const graphVersion = process.env.META_GRAPH_VERSION || "v24.0";
const graphBase = `https://graph.facebook.com/${graphVersion}`;

function credentials(account: Account) {
  const decoded = JSON.parse(decryptSecret(account.credential_ciphertext)) as {
    accessToken?: string;
  };
  if (!decoded.accessToken) throw new Error("The Meta account token is missing.");
  return decoded.accessToken;
}

async function graph<T>(
  path: string,
  accessToken: string,
  body?: Record<string, string>,
  method = "POST",
): Promise<T> {
  const params = new URLSearchParams({ access_token: accessToken, ...(body || {}) });
  const response = await fetch(`${graphBase}/${path}`, {
    method,
    headers: method === "GET"
      ? undefined
      : { "Content-Type": "application/x-www-form-urlencoded" },
    body: method === "GET" ? undefined : params,
    cache: "no-store",
  });
  const payload = (await response.json()) as T & {
    error?: { message?: string; code?: number; error_subcode?: number };
  };
  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message || `Meta Graph request failed (${response.status}).`);
  }
  return payload;
}

function captionFor(content: Content, platform: string) {
  const variants = (content.content_package.variants || []) as Array<{
    platform?: string;
    caption?: string;
    hashtags?: string[];
  }>;
  const variant = variants.find((item) => item.platform === platform) || variants[0];
  return [variant?.caption, variant?.hashtags?.join(" ")].filter(Boolean).join("\n\n");
}

export async function publishMetaChannel(channelId: string) {
  const admin = createAdminClient();
  const { data: channel, error } = await admin
    .from("social_content_channels")
    .select("*,social_accounts(*),social_content_items(*,social_media_assets(*))")
    .eq("id", channelId)
    .single();
  if (error || !channel) throw new Error("Publishing channel was not found.");
  const account = channel.social_accounts as Account | null;
  const content = channel.social_content_items as Content & {
    social_media_assets?: Array<{
      storage_path: string;
      metadata: Record<string, unknown>;
      media_type: string;
    }>;
  };
  if (!account) throw new Error("Connect an account before publishing.");
  const token = credentials(account);
  const assets = content.social_media_assets || [];
  const assetUrls = assets.map((asset) => String(asset.metadata?.public_url || "")).filter(Boolean);
  if (!assetUrls.length && account.platform !== "facebook") {
    throw new Error("Add a publicly accessible media asset before publishing.");
  }
  const caption = captionFor(content, account.platform);

  if (account.platform === "instagram") {
    let creationId: string;
    if (content.format === "carousel" && assetUrls.length > 1) {
      const children: string[] = [];
      for (const imageUrl of assetUrls.slice(0, 10)) {
        const child = await graph<{ id: string }>(
          `${account.external_account_id}/media`,
          token,
          { image_url: imageUrl, is_carousel_item: "true" },
        );
        children.push(child.id);
      }
      const container = await graph<{ id: string }>(
        `${account.external_account_id}/media`,
        token,
        {
          media_type: "CAROUSEL",
          children: children.join(","),
          caption,
        },
      );
      creationId = container.id;
    } else {
      const asset = assets[0];
      const isVideo = asset?.media_type === "video";
      const body: Record<string, string> = { caption };
      if (content.format === "reel") {
        body.media_type = "REELS";
        body.video_url = assetUrls[0];
        body.share_to_feed = "true";
      } else if (content.format === "story") {
        body.media_type = "STORIES";
        body[isVideo ? "video_url" : "image_url"] = assetUrls[0];
      } else {
        body[isVideo ? "video_url" : "image_url"] = assetUrls[0];
      }
      const container = await graph<{ id: string }>(
        `${account.external_account_id}/media`,
        token,
        body,
      );
      creationId = container.id;
    }
    const published = await graph<{ id: string }>(
      `${account.external_account_id}/media_publish`,
      token,
      { creation_id: creationId },
    );
    const permalink = await graph<{ permalink?: string }>(
      `${published.id}?fields=permalink`,
      token,
      undefined,
      "GET",
    );
    return { externalId: published.id, permalink: permalink.permalink || null };
  }

  if (account.platform === "facebook") {
    const result: { id: string; post_id?: string } = assetUrls[0]
      ? await graph<{ id: string; post_id?: string }>(
          `${account.external_account_id}/photos`,
          token,
          { url: assetUrls[0], caption, published: "true" },
        )
      : await graph<{ id: string }>(
          `${account.external_account_id}/feed`,
          token,
          { message: caption },
        );
    return { externalId: result.post_id || result.id, permalink: null };
  }

  throw new Error(`Meta publisher does not support ${account.platform}.`);
}
