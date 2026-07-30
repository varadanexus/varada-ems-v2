import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret } from "@/lib/security/encryption";
import { verifySignedState } from "@/lib/security/signed-state";
import { getDefaultBrandId } from "@/services/social/repository";
import { getStoredSecret } from "@/services/settings/secret-store";

const graphVersion = process.env.META_GRAPH_VERSION || "v25.0";

export async function GET(request: Request) {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const returnUrl = new URL("/accounts?meta=connected", appUrl);
  try {
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get("code");
    const state = requestUrl.searchParams.get("state");
    const errorDescription = requestUrl.searchParams.get("error_description");
    if (errorDescription) throw new Error(errorDescription);
    if (!code || !state) throw new Error("Meta did not return an authorization code.");
    const stateData = verifySignedState(state);
    const [appId, appSecret] = await Promise.all([
      getStoredSecret("meta", "app_id", process.env.META_APP_ID),
      getStoredSecret("meta", "app_secret", process.env.META_APP_SECRET),
    ]);
    if (!appId || !appSecret) throw new Error("Meta application credentials are not configured.");
    const redirectUri = `${appUrl}/api/v1/accounts/meta/callback`;
    const tokenUrl = new URL(`https://graph.facebook.com/${graphVersion}/oauth/access_token`);
    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("redirect_uri", redirectUri);
    tokenUrl.searchParams.set("code", code);
    const tokenResponse = await fetch(tokenUrl, { cache: "no-store" });
    const tokenPayload = (await tokenResponse.json()) as {
      access_token?: string;
      expires_in?: number;
      error?: { message?: string };
    };
    if (!tokenResponse.ok || !tokenPayload.access_token) {
      throw new Error(tokenPayload.error?.message || "Meta token exchange failed.");
    }
    const longUrl = new URL(`https://graph.facebook.com/${graphVersion}/oauth/access_token`);
    longUrl.searchParams.set("grant_type", "fb_exchange_token");
    longUrl.searchParams.set("client_id", appId);
    longUrl.searchParams.set("client_secret", appSecret);
    longUrl.searchParams.set("fb_exchange_token", tokenPayload.access_token);
    const longResponse = await fetch(longUrl, { cache: "no-store" });
    const longPayload = (await longResponse.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    const userToken = longPayload.access_token || tokenPayload.access_token;
    const pagesUrl = new URL(`https://graph.facebook.com/${graphVersion}/me/accounts`);
    pagesUrl.searchParams.set(
      "fields",
      "id,name,access_token,instagram_business_account{id,username,name}",
    );
    pagesUrl.searchParams.set("access_token", userToken);
    const pagesResponse = await fetch(pagesUrl, { cache: "no-store" });
    const pagesPayload = (await pagesResponse.json()) as {
      data?: Array<{
        id: string;
        name: string;
        access_token: string;
        instagram_business_account?: { id: string; username?: string; name?: string };
      }>;
      error?: { message?: string };
    };
    if (!pagesResponse.ok) throw new Error(pagesPayload.error?.message || "Could not load Meta pages.");
    const admin = createAdminClient();
    const brandId = await getDefaultBrandId();
    const expiresAt = new Date(
      Date.now() + Number(longPayload.expires_in || tokenPayload.expires_in || 5184000) * 1000,
    ).toISOString();
    const rows = (pagesPayload.data || []).flatMap((page) => {
      const values: Array<Record<string, unknown>> = [{
        brand_id: brandId,
        platform: "facebook",
        external_account_id: page.id,
        display_name: page.name,
        credential_ciphertext: encryptSecret(JSON.stringify({ accessToken: page.access_token })),
        credential_expires_at: expiresAt,
        status: "active",
        metadata: { pageId: page.id },
        connected_by: stateData.appUserId || null,
      }];
      if (page.instagram_business_account) {
        values.push({
          brand_id: brandId,
          platform: "instagram",
          external_account_id: page.instagram_business_account.id,
          display_name: page.instagram_business_account.name || page.instagram_business_account.username || page.name,
          credential_ciphertext: encryptSecret(JSON.stringify({ accessToken: page.access_token })),
          credential_expires_at: expiresAt,
          status: "active",
          metadata: { pageId: page.id, username: page.instagram_business_account.username || null },
          connected_by: stateData.appUserId || null,
        });
      }
      return values;
    });
    if (rows.length) {
      const { error } = await admin
        .from("social_accounts")
        .upsert(rows, { onConflict: "platform,external_account_id" });
      if (error) throw error;
    }
    returnUrl.searchParams.set("count", String(rows.length));
  } catch (reason) {
    returnUrl.searchParams.set("meta", "error");
    returnUrl.searchParams.set(
      "message",
      reason instanceof Error ? reason.message.slice(0, 180) : "Meta connection failed.",
    );
  }
  return NextResponse.redirect(returnUrl);
}
