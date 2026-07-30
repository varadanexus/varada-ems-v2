import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

function signingKey() {
  const key = process.env.WEBHOOK_SIGNING_SECRET || process.env.APP_ENCRYPTION_KEY;
  if (!key) throw new Error("WEBHOOK_SIGNING_SECRET is not configured.");
  return key;
}

export function createSignedState(payload: Record<string, unknown>) {
  const encoded = Buffer.from(JSON.stringify({
    ...payload,
    expiresAt: Date.now() + 10 * 60_000,
  })).toString("base64url");
  const signature = createHmac("sha256", signingKey()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifySignedState(value: string) {
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature) throw new Error("Invalid OAuth state.");
  const expected = createHmac("sha256", signingKey()).update(encoded).digest();
  const supplied = Buffer.from(signature, "base64url");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    throw new Error("Invalid OAuth state.");
  }
  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as {
    expiresAt?: number;
    appUserId?: string;
  };
  if (!payload.expiresAt || payload.expiresAt < Date.now()) {
    throw new Error("OAuth state has expired.");
  }
  return payload;
}
