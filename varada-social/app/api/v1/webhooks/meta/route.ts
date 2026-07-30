import { createHmac, timingSafeEqual } from "node:crypto";
import { syncMetaAnalytics } from "@/services/analytics/meta-sync";
import { getStoredSecret } from "@/services/settings/secret-store";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const verifyToken = await getStoredSecret(
    "meta",
    "webhook_verify_token",
    process.env.META_WEBHOOK_VERIFY_TOKEN,
  );
  if (
    mode === "subscribe" &&
    verifyToken &&
    token === verifyToken
  ) {
    return new Response(challenge || "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("x-hub-signature-256")?.replace("sha256=", "");
  const secret = await getStoredSecret("meta", "app_secret", process.env.META_APP_SECRET);
  if (!signature || !secret) return new Response("Unauthorized", { status: 401 });
  const expected = createHmac("sha256", secret).update(body).digest();
  const supplied = Buffer.from(signature, "hex");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    return new Response("Unauthorized", { status: 401 });
  }
  void syncMetaAnalytics();
  return Response.json({ received: true });
}
