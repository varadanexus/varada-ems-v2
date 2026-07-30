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
  category?: string;
  contentType?: string;
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
  cta: string;
  altText: string;
  keywords: string[];
  suggestedPostingTime: string;
  targetAudience: string;
  recommendedPlatforms: string[];
  category: string;
  contentType: string;
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
  brandAssetInstructions: {
    logoAsset: string;
    logoPlacement: string;
    watermark: boolean;
    colours: string[];
    typography: string;
    template: string;
  };
  safetyNotes: string[];
  safetyStatus: "passed" | "blocked" | "needs_review";
  safetyReview: {
    branding: boolean;
    language: boolean;
    claims: boolean;
    copyright: boolean;
    issues: string[];
  };
  fingerprint: string;
  cacheHit?: boolean;
  provider: string;
  model: string;
}
