export const socialPlatforms = [
  "instagram",
  "linkedin",
  "facebook",
  "x",
  "threads",
  "pinterest",
  "google_business",
] as const;

export type SocialPlatform = (typeof socialPlatforms)[number];

export const contentFormats = [
  "single_post",
  "carousel",
  "story",
  "reel",
] as const;

export type ContentFormat = (typeof contentFormats)[number];

export interface ContentGenerationRequest {
  topic: string;
  objective: string;
  platforms: SocialPlatform[];
  format: ContentFormat;
  tone: string;
  length: "short" | "medium" | "long";
  callToAction?: string;
  emsModules: string[];
  includeEmsContext: boolean;
}

export interface PlatformVariant {
  platform: SocialPlatform;
  caption: string;
  hashtags: string[];
  title?: string;
}

export interface GeneratedContent {
  headline: string;
  concept: string;
  hook: string;
  variants: PlatformVariant[];
  carouselSlides: Array<{ heading: string; body: string }>;
  reel: {
    durationSeconds: number;
    scenes: Array<{
      scene: number;
      visual: string;
      voiceover: string;
      overlay: string;
      camera: string;
      broll: string;
    }>;
    endingCta: string;
    musicKeywords: string[];
  };
  imagePrompt: string;
  safetyNotes: string[];
  provider: string;
  model: string;
}
