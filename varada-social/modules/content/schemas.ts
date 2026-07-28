import { z } from "zod";
import { contentFormats, socialPlatforms } from "@/types/content";

export const generationRequestSchema = z.object({
  topic: z.string().trim().min(3).max(500),
  objective: z.string().trim().min(3).max(300),
  platforms: z.array(z.enum(socialPlatforms)).min(1).max(socialPlatforms.length),
  format: z.enum(contentFormats),
  tone: z.string().trim().min(2).max(60),
  length: z.enum(["short", "medium", "long"]),
  callToAction: z.string().trim().max(180).optional().default(""),
  emsModules: z.array(z.string().trim().max(60)).max(12).default([]),
  includeEmsContext: z.boolean().default(true),
});

export const imageRequestSchema = z.object({
  prompt: z.string().trim().min(10).max(4000),
  aspectRatio: z.enum(["square", "portrait", "landscape", "story"]),
  quality: z.enum(["low", "medium", "high"]).default("medium"),
  style: z.string().trim().max(80).default("premium corporate"),
});
