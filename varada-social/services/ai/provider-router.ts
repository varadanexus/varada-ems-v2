import type { ContentGenerationRequest, GeneratedContent } from "@/types/content";
import { generateWithAnthropic } from "@/services/ai/anthropic-provider";
import { generateWithGemini } from "@/services/ai/gemini-provider";
import { generateWithOpenAI } from "@/services/ai/openai-provider";
import { getStoredSecret } from "@/services/settings/secret-store";

export type ConfiguredTextProvider = "openai" | "anthropic" | "gemini" | "vertex";

export async function availableTextProviders(): Promise<ConfiguredTextProvider[]> {
  const [openai, anthropic, vertex] = await Promise.all([
    getStoredSecret("openai", "api_key", process.env.OPENAI_API_KEY),
    getStoredSecret("anthropic", "api_key", process.env.ANTHROPIC_API_KEY),
    getStoredSecret("vertex", "service_account_json", process.env.VERTEX_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
  ]);
  return [
    vertex ? "vertex" : null,
    openai ? "openai" : null,
    anthropic ? "anthropic" : null,
  ].filter(Boolean) as ConfiguredTextProvider[];
}

export async function generateContent(
  prompt: string,
  request: ContentGenerationRequest,
  preferred?: string | null,
): Promise<GeneratedContent> {
  const available = await availableTextProviders();
  const selected = available.includes(preferred as ConfiguredTextProvider)
    ? (preferred as ConfiguredTextProvider)
    : available[0];
  if (!selected) {
    throw new Error(
      "No AI provider is configured. Add an OpenAI, Anthropic, or Gemini server key.",
    );
  }
  if (selected === "anthropic") return generateWithAnthropic(prompt, request);
  if (selected === "vertex" || selected === "gemini") return generateWithGemini(prompt, request);
  return generateWithOpenAI(prompt, request);
}
