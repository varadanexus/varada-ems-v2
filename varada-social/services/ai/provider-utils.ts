import type { GeneratedContent, SocialPlatform } from "@/types/content";

export function extractOpenAiText(payload: unknown): string {
  const response = payload as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  if (response.output_text) return response.output_text;
  return (response.output || [])
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text" && item.text)
    .map((item) => item.text)
    .join("");
}

export function parseGeneratedContent(
  text: string,
  provider: string,
  model: string,
  platforms: SocialPlatform[],
): GeneratedContent {
  const clean = text.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
  const parsed = JSON.parse(clean) as Omit<GeneratedContent, "provider" | "model">;
  if (!parsed.headline || !Array.isArray(parsed.variants)) {
    throw new Error("The AI provider returned an incomplete content package.");
  }
  parsed.variants = parsed.variants.filter((variant) =>
    platforms.includes(variant.platform),
  );
  const review = parsed.safetyReview;
  const safetyStatus = review && review.branding && review.language && review.claims && review.copyright && !review.issues?.length
    ? "passed"
    : "needs_review";
  return { ...parsed, provider, model, safetyStatus, fingerprint: "" };
}

export async function providerFetch(
  url: string,
  init: RequestInit,
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message =
        (payload as { error?: { message?: string } }).error?.message ||
        `Provider request failed with HTTP ${response.status}.`;
      throw new Error(message);
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}
