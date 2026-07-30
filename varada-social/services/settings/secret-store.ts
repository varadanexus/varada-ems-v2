import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret } from "@/lib/security/encryption";

export async function getStoredSecret(
  provider: string,
  keyName: string,
  environmentFallback?: string,
) {
  if (environmentFallback) return environmentFallback;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("social_integration_secrets")
      .select("ciphertext")
      .eq("provider", provider)
      .eq("key_name", keyName)
      .eq("status", "configured")
      .maybeSingle();
    return data?.ciphertext ? decryptSecret(data.ciphertext) : null;
  } catch {
    return null;
  }
}

export async function saveSecret(input: {
  provider: string;
  keyName: string;
  value: string;
  actorId: string;
}) {
  const admin = createAdminClient();
  const { error } = await admin.from("social_integration_secrets").upsert(
    {
      provider: input.provider,
      key_name: input.keyName,
      ciphertext: encryptSecret(input.value),
      last_four: input.value.slice(-4),
      status: "configured",
      updated_by: input.actorId === "local-development" ? null : input.actorId,
    },
    { onConflict: "provider,key_name" },
  );
  if (error) throw error;
}
