import { createClient } from "@supabase/supabase-js";
import { providerFetch } from "@/services/ai/provider-utils";
import { getStoredSecret } from "@/services/settings/secret-store";

const sizes = {
  square: "1024x1024",
  portrait: "1024x1536",
  landscape: "1536x1024",
  story: "1024x1536",
} as const;

export async function generateImage(input: {
  prompt: string;
  aspectRatio: keyof typeof sizes;
  quality: "low" | "medium" | "high";
  style: string;
}) {
  const key = await getStoredSecret("openai", "api_key", process.env.OPENAI_API_KEY);
  if (!key) throw new Error("OpenAI Images is not configured.");
  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";
  const payload = (await providerFetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt: `${input.prompt}\nVisual style: ${input.style}. No logos, watermarks, or embedded text.`,
      size: sizes[input.aspectRatio],
      quality: input.quality,
      output_format: "png",
    }),
  })) as { data?: Array<{ b64_json?: string }> };

  const base64 = payload.data?.[0]?.b64_json;
  if (!base64) throw new Error("The image provider returned no image.");
  const bytes = Buffer.from(base64, "base64");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (url && serviceKey) {
    const supabase = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const path = `generated/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.png`;
    const { error } = await supabase.storage
      .from("social-media-assets")
      .upload(path, bytes, { contentType: "image/png", upsert: false });
    if (!error) {
      const { data } = supabase.storage.from("social-media-assets").getPublicUrl(path);
      return { assetUrl: data.publicUrl, storagePath: path, model };
    }
  }

  return { assetUrl: `data:image/png;base64,${base64}`, model };
}
