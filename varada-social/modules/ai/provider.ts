export type AiProvider = "openai" | "anthropic" | "gemini";

export interface TextGenerationRequest {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
}

export interface TextGenerationResult {
  text: string;
  provider: AiProvider;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface TextGenerationProvider {
  readonly provider: AiProvider;
  generate(request: TextGenerationRequest): Promise<TextGenerationResult>;
}

export interface ImageGenerationProvider {
  readonly provider: AiProvider;
  generate(prompt: string, aspectRatio: string): Promise<{ assetUrl: string }>;
}
