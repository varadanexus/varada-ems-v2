export const generatedContentJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "headline",
    "concept",
    "hook",
    "variants",
    "carouselSlides",
    "reel",
    "imagePrompt",
    "safetyNotes",
  ],
  properties: {
    headline: { type: "string" },
    concept: { type: "string" },
    hook: { type: "string" },
    variants: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["platform", "caption", "hashtags", "title"],
        properties: {
          platform: { type: "string" },
          caption: { type: "string" },
          hashtags: { type: "array", items: { type: "string" } },
          title: { type: "string" },
        },
      },
    },
    carouselSlides: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["heading", "body"],
        properties: {
          heading: { type: "string" },
          body: { type: "string" },
        },
      },
    },
    reel: {
      type: "object",
      additionalProperties: false,
      required: ["durationSeconds", "scenes", "endingCta", "musicKeywords"],
      properties: {
        durationSeconds: { type: "number" },
        scenes: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["scene", "visual", "voiceover", "overlay", "camera", "broll"],
            properties: {
              scene: { type: "number" },
              visual: { type: "string" },
              voiceover: { type: "string" },
              overlay: { type: "string" },
              camera: { type: "string" },
              broll: { type: "string" },
            },
          },
        },
        endingCta: { type: "string" },
        musicKeywords: { type: "array", items: { type: "string" } },
      },
    },
    imagePrompt: { type: "string" },
    safetyNotes: { type: "array", items: { type: "string" } },
  },
} as const;
