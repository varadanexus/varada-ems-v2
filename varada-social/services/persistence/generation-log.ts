import { createClient } from "@supabase/supabase-js";
import type { ContentGenerationRequest, GeneratedContent } from "@/types/content";

export async function recordTextGeneration(input: {
  authUserId: string;
  request: ContentGenerationRequest;
  result: GeneratedContent;
  latencyMs: number;
}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || input.authUserId === "local-development") return;
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: appUser } = await supabase
    .from("app_users")
    .select("id")
    .eq("auth_user_id", input.authUserId)
    .maybeSingle();
  await supabase.from("social_ai_generations").insert({
    requested_by: appUser?.id || null,
    provider: input.result.provider,
    model: input.result.model,
    generation_type: "text",
    request_summary: {
      topic: input.request.topic,
      objective: input.request.objective,
      platforms: input.request.platforms,
      format: input.request.format,
      source_modules: input.request.emsModules,
    },
    output_summary: {
      headline: input.result.headline,
      variant_count: input.result.variants.length,
      slide_count: input.result.carouselSlides.length,
      scene_count: input.result.reel.scenes.length,
    },
    latency_ms: input.latencyMs,
    status: "succeeded",
  });
}
