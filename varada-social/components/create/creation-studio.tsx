"use client";

import { useState } from "react";
import {
  Check,
  Clipboard,
  Film,
  ImageIcon,
  Images,
  LoaderCircle,
  Music2,
  RefreshCw,
  Shuffle,
  Sparkles,
  WandSparkles,
  Save,
  Send,
} from "lucide-react";
import type {
  ContentFormat,
  GeneratedContent,
  SocialPlatform,
} from "@/types/content";
import { cn } from "@/utils/cn";
import { socialEdgeFetch } from "@/lib/api/client";

const platforms: Array<{ value: SocialPlatform; label: string }> = [
  { value: "instagram", label: "Instagram" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "facebook", label: "Facebook" },
  { value: "x", label: "X" },
  { value: "threads", label: "Threads" },
  { value: "pinterest", label: "Pinterest" },
  { value: "google_business", label: "Google Business" },
];

const formats: Array<{ value: ContentFormat; label: string }> = [
  { value: "single_post", label: "Post" },
  { value: "carousel", label: "Carousel" },
  { value: "story", label: "Story" },
  { value: "reel", label: "Reel" },
];

const categories = [
  "Healthcare Infrastructure", "Hospital Consultancy", "Transportation & Logistics",
  "Mining", "Interior Design", "Import & Export", "Digital Marketing", "HR & PR",
  "Corporate Services", "Company Announcements", "Recruitment", "Client Success Stories",
  "CSR Activities", "Educational Content", "Industry News", "Tips & Guides",
  "Festival Greetings", "Motivational Posts", "Product & Service Promotions",
];

const contentTypes = [
  ["image_post", "Image post"], ["carousel", "Carousel"], ["story", "Story"],
  ["reel_caption", "Reel caption"], ["reel_script", "Reel script"],
  ["promotional_graphic", "Promotional graphic"], ["quote_card", "Quote card"],
  ["infographic", "Infographic"], ["before_after", "Before / after"],
  ["event_announcement", "Event announcement"], ["holiday_greeting", "Holiday greeting"],
] as const;

const emsModules = [
  ["transportation", "Transportation"],
  ["interiors", "Interiors"],
  ["digital-services", "Digital Services"],
  ["meetings", "Meetings"],
  ["support", "Support"],
  ["legal", "Legal"],
] as const;

// Formats the "Surprise me" random generator is allowed to choose from.
const randomFormats: ContentFormat[] = ["single_post", "carousel", "story"];

const randomTones = [
  "Professional and educational",
  "Luxury and aspirational",
  "Emotional storytelling",
  "Direct CTA focused",
  "SEO optimised",
];

// Seed ideas so a random campaign always has a usable topic to build on.
const randomTopics = [
  "How technology is making mineral logistics safer and more transparent",
  "What decision-makers should check before commissioning a new hospital fit-out",
  "Turning a bare commercial shell into a premium, on-brand workspace",
  "Behind the scenes of a smooth, compliant import-export shipment",
  "Signs it is time to bring in a professional interior design partner",
  "How the right HR and PR strategy compounds into long-term brand trust",
  "A practical checklist for planning large-scale construction logistics",
  "Why integrated corporate services save growing companies time and cost",
  "Lessons from a recent client success story worth celebrating",
  "Simple operational upgrades that quietly improve customer experience",
];

// When the random format is not a dedicated carousel/story, pick a content type.
const randomPostContentTypes = [
  "image_post",
  "promotional_graphic",
  "quote_card",
  "infographic",
  "event_announcement",
];

// Topic seeds per business category, so "Surprise me" keeps the selected
// category and picks a topic that actually fits it. Keys must match `categories`.
const categoryTopicSeeds: Record<string, string[]> = {
  "Healthcare Infrastructure": [
    "What decision-makers should check before commissioning a new hospital build",
    "How well-planned healthcare infrastructure improves patient outcomes and running costs",
  ],
  "Hospital Consultancy": [
    "Signs a hospital project needs specialist consultancy support early",
    "Turning a healthcare vision into a commissioned, compliant facility",
  ],
  "Transportation & Logistics": [
    "How technology is making cargo and mineral logistics safer and more transparent",
    "A practical checklist for planning large-scale transportation and logistics",
  ],
  "Mining": [
    "Making mining operations safer, cleaner and more efficient",
    "How reliable logistics keeps a mining supply chain moving",
  ],
  "Interior Design": [
    "Turning a bare commercial shell into a premium, on-brand workspace",
    "Signs it is time to bring in a professional interior design partner",
  ],
  "Import & Export": [
    "Behind the scenes of a smooth, compliant import-export shipment",
    "Common trade-documentation mistakes and how to avoid them",
  ],
  "Digital Marketing": [
    "How a clear digital marketing strategy generates qualified enquiries",
    "Turning website visitors into real business conversations",
  ],
  "HR & PR": [
    "How the right HR and PR strategy compounds into long-term brand trust",
    "Building an employer brand that attracts the right talent",
  ],
  "Corporate Services": [
    "Why integrated corporate services save growing companies time and cost",
    "One partner for compliance, operations and back-office support",
  ],
  "Company Announcements": [
    "Sharing a meaningful company milestone with our clients and partners",
    "A new capability we are proud to bring to our clients",
  ],
  "Recruitment": [
    "We are hiring: what it is like to build a career at Varada Nexus",
    "What we look for in the people who join our teams",
  ],
  "Client Success Stories": [
    "Lessons from a recent client success story worth celebrating",
    "How we helped a client solve a real operational challenge",
  ],
  "CSR Activities": [
    "A community initiative we are proud to support",
    "How responsible business practices shape the way we work",
  ],
  "Educational Content": [
    "A simple explainer on a topic our clients often ask about",
    "The fundamentals every buyer should understand before starting a project",
  ],
  "Industry News": [
    "What a recent industry development means for businesses like yours",
    "A trend worth watching in our sector this year",
  ],
  "Tips & Guides": [
    "Practical tips to get a project right the first time",
    "A short guide to choosing the right partner for your requirement",
  ],
  "Festival Greetings": [
    "Warm festival greetings from the Varada Nexus family",
    "Celebrating the season with our clients, partners and team",
  ],
  "Motivational Posts": [
    "A mindset that helps teams deliver excellent work",
    "Why consistency and quality build lasting business relationships",
  ],
  "Product & Service Promotions": [
    "A closer look at a service that solves a common business problem",
    "How our offering helps clients move faster with less risk",
  ],
};

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

// Number of slides generated for a carousel when the AI does not return an
// explicit slide plan, so a carousel always produces multiple images.
const CAROUSEL_FALLBACK_SLIDES = 5;

export function CreationStudio() {
  const [selectedPlatforms, setSelectedPlatforms] = useState<SocialPlatform[]>([
    "instagram",
    "linkedin",
  ]);
  const [selectedModules, setSelectedModules] = useState<string[]>([
    "transportation",
  ]);
  const [format, setFormat] = useState<ContentFormat>("carousel");
  const [category, setCategory] = useState("Corporate Services");
  const [contentType, setContentType] = useState("carousel");
  const [topic, setTopic] = useState("");
  const [objective, setObjective] = useState("Center Varada Nexus as the solution provider, give prospective clients useful guidance, and generate qualified enquiries");
  const [tone, setTone] = useState("Professional and educational");
  const [length, setLength] = useState<"short" | "medium" | "long">("medium");
  const [cta, setCta] = useState("Send Varada Nexus your requirement to arrange a consultation, assessment or quotation");
  const [provider, setProvider] = useState("vertex");
  const [result, setResult] = useState<GeneratedContent | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [imageStoragePath, setImageStoragePath] = useState("");
  const [imageBrandOverlay, setImageBrandOverlay] = useState<Record<string, unknown> | null>(null);
  const [carouselAssets, setCarouselAssets] = useState<Array<{ publicUrl: string; storagePath?: string; brandOverlay?: Record<string, unknown> }>>([]);
  const [generatedMediaType, setGeneratedMediaType] = useState<"image" | "video">("image");
  const [manualTitle, setManualTitle] = useState("");
  const [manualCaption, setManualCaption] = useState("");
  const [manualMediaUrl, setManualMediaUrl] = useState("");
  const [loading, setLoading] = useState<"content" | "image" | "video" | null>(null);
  const [saving, setSaving] = useState<"draft" | "review" | "manual-draft" | "manual-review" | null>(null);
  const [savedMessage, setSavedMessage] = useState("");
  const [error, setError] = useState("");

  function togglePlatform(platform: SocialPlatform) {
    setSelectedPlatforms((current) =>
      current.includes(platform)
        ? current.filter((item) => item !== platform)
        : [...current, platform],
    );
  }

  function toggleModule(module: string) {
    setSelectedModules((current) =>
      current.includes(module)
        ? current.filter((item) => item !== module)
        : [...current, module],
    );
  }

  type GenerationOverrides = Partial<{
    topic: string;
    format: ContentFormat;
    category: string;
    contentType: string;
    tone: string;
  }>;

  type ImageGenerationOptions = {
    generated?: GeneratedContent;
    contentFormat?: ContentFormat;
    silent?: boolean;
  };

  async function generate(overrides?: GenerationOverrides) {
    // Overrides let the "Surprise me" flow generate with fresh random values
    // immediately, without waiting for React state updates to flush.
    const brief = {
      topic: overrides?.topic ?? topic,
      format: overrides?.format ?? format,
      category: overrides?.category ?? category,
      contentType: overrides?.contentType ?? contentType,
      tone: overrides?.tone ?? tone,
    };
    if (!brief.topic.trim()) {
      setError("Enter a topic or campaign brief.");
      return;
    }
    setLoading("content");
    setError("");
    try {
      const generated = await socialEdgeFetch<GeneratedContent>("generate_text", {
          topic: brief.topic,
          objective,
          platforms: selectedPlatforms,
          format: brief.format,
          tone: brief.tone,
          length,
          callToAction: cta,
          emsModules: selectedModules,
          includeEmsContext: true,
          preferredProvider: provider,
          category: brief.category,
          contentType: brief.contentType,
      });
      setImageUrl("");
      setImageStoragePath("");
      setImageBrandOverlay(null);
      setCarouselAssets([]);
      setGeneratedMediaType("image");
      setSavedMessage("");
      setResult(generated);
      await createImage({ generated, contentFormat: brief.format, silent: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Generation failed.");
    } finally {
      setLoading(null);
    }
  }

  async function generateRandom() {
    // Pick a random format, then a matching content type, category, tone and
    // seed topic, reflect them in the form, and generate straight away.
    const randomFormat = pickRandom(randomFormats);
    const randomContentType =
      randomFormat === "carousel"
        ? "carousel"
        : randomFormat === "story"
          ? "story"
          : pickRandom(randomPostContentTypes);
    const randomTone = pickRandom(randomTones);
    // Keep the category the user selected; pick a topic that fits it.
    const seeds = categoryTopicSeeds[category] ?? randomTopics;
    const randomTopic = pickRandom(seeds);

    setFormat(randomFormat);
    setContentType(randomContentType);
    setTone(randomTone);
    setTopic(randomTopic);

    await generate({
      topic: randomTopic,
      format: randomFormat,
      category,
      contentType: randomContentType,
      tone: randomTone,
    });
  }

  async function createImage(options: ImageGenerationOptions = {}) {
    const source = options.generated || result;
    const sourceFormat = options.contentFormat || format;
    if (!source?.imagePrompt) return;
    setLoading("image");
    if (!options.silent) setError("");
    try {
      const plans = sourceFormat === "carousel"
        ? (source.carouselSlides.length
            ? source.carouselSlides.slice(0, 8)
            // No explicit slide plan returned: still produce a multi-image
            // carousel by fanning the concept across several distinct frames.
            : Array.from({ length: CAROUSEL_FALLBACK_SLIDES }, (_, index) => ({
                heading: index === 0 ? source.headline : `${source.headline} - part ${index + 1}`,
                body: source.concept,
              })))
        : [{ heading: source.headline, body: source.concept }];
      const generatedAssets = [];
      for (let slideIndex = 0; slideIndex < plans.length; slideIndex += 1) {
        const slide = plans[slideIndex];
        const generated = await socialEdgeFetch<{ assetUrl: string; storagePath?: string; brandOverlay?: Record<string, unknown> }>("generate_image", {
            prompt: `${source.imagePrompt}\nVisual ${slideIndex + 1} of ${plans.length}: ${slide.heading}. ${slide.body}. Keep the campaign visually coherent but make this frame distinct.`,
            aspectRatio: sourceFormat === "story" || sourceFormat === "reel" ? "story" : "portrait",
            quality: "medium",
            style: "premium black and gold corporate editorial photography",
            // The official transparent logo is composited by the backend.
            overlayText: slide.heading,
        });
        generatedAssets.push({ publicUrl: generated.assetUrl, storagePath: generated.storagePath, brandOverlay: generated.brandOverlay });
      }
      const primary = generatedAssets[0];
      setImageUrl(primary.publicUrl);
      setImageStoragePath(primary.storagePath || "");
      setImageBrandOverlay(primary.brandOverlay || null);
      setCarouselAssets(sourceFormat === "carousel" ? generatedAssets : []);
      setGeneratedMediaType("image");
      if (sourceFormat === "carousel") setSavedMessage(`${generatedAssets.length} branded carousel slides are ready.`);
      else if (options.silent) setSavedMessage("Campaign text and branded visual are ready.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Image generation failed.");
    } finally {
      setLoading(null);
    }
  }

  async function createVideo() {
    if (!result?.imagePrompt) return;
    setLoading("video");
    setError("");
    try {
      const started = await socialEdgeFetch<{ jobId: string; estimatedCostInr: number }>("generate_video", {
        prompt: `${result.imagePrompt} ${result.reel?.scenes?.map((scene) => scene.visual).join(" ") || ""}`,
        aspectRatio: "9:16",
        durationSeconds: 8,
      });
      setSavedMessage(`Vertex AI is rendering an 8-second reel clip (the current Veo production maximum per clip; guarded estimate ₹${started.estimatedCostInr.toFixed(2)}).`);
      let completed: { status: string; public_url?: string; storage_path?: string; error_message?: string } | null = null;
      for (let attempt = 0; attempt < 60; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 10_000));
        const polled = await socialEdgeFetch<{ status: string; public_url?: string; storage_path?: string; error_message?: string }>("poll_video", { jobId: started.jobId });
        completed = polled;
        if (polled.status !== "processing" && polled.status !== "queued") break;
      }
      if (!completed || completed.status !== "succeeded" || !completed.public_url) {
        throw new Error(completed?.error_message || "Video generation is still processing. It can be checked again from the media job history.");
      }
      setImageUrl(completed.public_url);
      setImageStoragePath(completed.storage_path || "");
      setImageBrandOverlay({ provider: "vertex", model: "veo-3.1-fast-generate-001", approvedBrandPrompt: true });
      setGeneratedMediaType("video");
      setSavedMessage("The branded reel is ready. Save it as a draft or submit it for approval.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Video generation failed.");
    } finally {
      setLoading(null);
    }
  }

  async function save(status: "draft" | "manager_review") {
    if (!result) return;
    setSaving(status === "draft" ? "draft" : "review");
    setError("");
    try {
      await socialEdgeFetch("create_content", {
          title: result.headline,
          format,
          platforms: selectedPlatforms,
          topic,
          objective,
          tone,
          category,
          contentPackage: result,
          status,
          emsModules: selectedModules,
          assets: carouselAssets.length ? carouselAssets.map((asset) => ({
            ...asset,
            mediaType: "image",
            mimeType: "image/png",
          })) : imageUrl ? [{
            publicUrl: imageUrl,
            storagePath: imageStoragePath || undefined,
            mediaType: generatedMediaType,
            mimeType: generatedMediaType === "video" ? "video/mp4" : "image/png",
            brandOverlay: imageBrandOverlay,
          }] : [],
      });
      setSavedMessage(status === "draft" ? "Campaign saved as a draft." : "Campaign submitted for manager approval.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Campaign could not be saved.");
    } finally {
      setSaving(null);
    }
  }

  async function saveManual(status: "draft" | "manager_review") {
    if (!manualTitle.trim() || !manualCaption.trim()) {
      setError("Enter a manual campaign title and caption.");
      return;
    }
    if (selectedPlatforms.includes("instagram") && !manualMediaUrl.trim()) {
      setError("Instagram publishing requires a public image or video URL.");
      return;
    }
    setSaving(status === "draft" ? "manual-draft" : "manual-review");
    setError("");
    try {
      const manualIsVideo = format === "reel" || /\.(mp4|mov|webm)(?:\?|#|$)/i.test(manualMediaUrl.trim());
      await socialEdgeFetch("create_content", {
        title: manualTitle,
        format,
        platforms: selectedPlatforms,
        topic: manualCaption,
        objective,
        tone,
        contentPackage: {
          headline: manualTitle,
          concept: topic || manualCaption,
          hook: manualTitle,
          variants: selectedPlatforms.map((platform) => ({
            platform,
            title: manualTitle,
            caption: manualCaption,
            hashtags: [],
          })),
          carouselSlides: [],
          reel: {
            durationSeconds: 0,
            scenes: [],
            endingCta: cta,
            musicKeywords: [],
          },
          imagePrompt: "",
          safetyNotes: ["Manually authored content; approval workflow remains required."],
        },
        status,
        emsModules: selectedModules,
        asset: manualMediaUrl.trim() ? {
          publicUrl: manualMediaUrl.trim(),
          storagePath: `external/${Date.now()}`,
          mediaType: manualIsVideo ? "video" : "image",
          mimeType: manualIsVideo ? "video/mp4" : "image/jpeg",
        } : null,
      });
      setSavedMessage(
        status === "draft"
          ? "Manual campaign saved as a draft."
          : "Manual campaign submitted for manager approval.",
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Manual campaign could not be saved.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-accent">
          AI content operations
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
          Creation Studio
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-muted sm:text-base">
          Turn live EMS business signals into channel-ready campaigns with
          provider-backed generation.
        </p>
      </header>

      <div className="grid items-start gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
        <section className="rounded-2xl border bg-surface p-5 xl:sticky xl:top-24">
          <div className="flex items-center gap-2">
            <WandSparkles size={18} className="text-accent" />
            <h2 className="font-display text-lg font-semibold">Campaign brief</h2>
          </div>

          <div className="mt-5 space-y-5">
            <Field label="Topic or idea">
              <textarea
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                className="min-h-24 w-full resize-none rounded-xl border bg-background p-3 text-sm placeholder:text-muted/55"
                placeholder="Example: How technology is making mineral logistics safer and more transparent"
              />
            </Field>

            <Field label="Format">
              <div className="grid grid-cols-4 gap-2">
                {formats.map((item) => (
                  <Toggle
                    key={item.value}
                    active={format === item.value}
                    onClick={() => setFormat(item.value)}
                  >
                    {item.label}
                  </Toggle>
                ))}
              </div>
            </Field>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <Field label="Business category">
                <select value={category} onChange={(event) => setCategory(event.target.value)} className="h-11 w-full rounded-xl border bg-background px-3 text-sm">
                  {categories.map((item) => <option key={item}>{item}</option>)}
                </select>
              </Field>
              <Field label="Content type">
                <select value={contentType} onChange={(event) => setContentType(event.target.value)} className="h-11 w-full rounded-xl border bg-background px-3 text-sm">
                  {contentTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
            </div>

            <Field label="Platforms">
              <div className="flex flex-wrap gap-2">
                {platforms.map((item) => (
                  <Toggle
                    key={item.value}
                    active={selectedPlatforms.includes(item.value)}
                    onClick={() => togglePlatform(item.value)}
                  >
                    {item.label}
                  </Toggle>
                ))}
              </div>
            </Field>

            <Field label="Ground with EMS data">
              <div className="flex flex-wrap gap-2">
                {emsModules.map(([value, label]) => (
                  <Toggle
                    key={value}
                    active={selectedModules.includes(value)}
                    onClick={() => toggleModule(value)}
                  >
                    {label}
                  </Toggle>
                ))}
              </div>
            </Field>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <Field label="Tone">
                <select value={tone} onChange={(event) => setTone(event.target.value)} className="h-11 w-full rounded-xl border bg-background px-3 text-sm">
                  <option>Professional and educational</option>
                  <option>Luxury and aspirational</option>
                  <option>Emotional storytelling</option>
                  <option>Direct CTA focused</option>
                  <option>SEO optimised</option>
                </select>
              </Field>
              <Field label="Length">
                <select value={length} onChange={(event) => setLength(event.target.value as typeof length)} className="h-11 w-full rounded-xl border bg-background px-3 text-sm">
                  <option value="short">Short</option>
                  <option value="medium">Medium</option>
                  <option value="long">Long</option>
                </select>
              </Field>
            </div>

            <Field label="Objective">
              <input value={objective} onChange={(event) => setObjective(event.target.value)} className="h-11 w-full rounded-xl border bg-background px-3 text-sm" />
            </Field>
            <Field label="Call to action">
              <input value={cta} onChange={(event) => setCta(event.target.value)} className="h-11 w-full rounded-xl border bg-background px-3 text-sm" />
            </Field>
            <Field label="AI provider">
              <select value={provider} onChange={(event) => setProvider(event.target.value)} className="h-11 w-full rounded-xl border bg-background px-3 text-sm">
                <option value="vertex">Google Cloud · Vertex AI Gemini (Primary)</option>
                <option value="openai">OpenAI · GPT-5.6</option>
                <option value="anthropic">Anthropic · Claude</option>
                <option value="gemini">Google · Gemini API (Fallback)</option>
              </select>
            </Field>

            {error && (
              <div className="rounded-xl border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-200">
                {error}
              </div>
            )}

            <button
              onClick={() => generate()}
              disabled={Boolean(loading) || !selectedPlatforms.length}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent font-bold text-[#100c05] shadow-[0_12px_30px_rgba(212,178,106,.16)] transition hover:bg-[#e2c47e] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading === "content" ? (
                <LoaderCircle size={18} className="animate-spin" />
              ) : (
                <Sparkles size={18} />
              )}
              Generate campaign
            </button>

            <button
              onClick={generateRandom}
              disabled={Boolean(loading) || !selectedPlatforms.length}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-accent/40 bg-accent-soft font-semibold text-accent transition hover:bg-accent/15 disabled:cursor-not-allowed disabled:opacity-50"
              title="Randomly choose a post, carousel or story and generate it"
            >
              {loading === "content" ? (
                <LoaderCircle size={18} className="animate-spin" />
              ) : (
                <Shuffle size={18} />
              )}
              Surprise me · random post
            </button>
            <p className="text-center text-xs text-muted">
              Randomly builds a post, carousel or story in the selected category ({category}).
            </p>

            <details className="rounded-xl border bg-background/45 p-4">
              <summary className="cursor-pointer text-sm font-semibold">
                Create manually
              </summary>
              <p className="mt-2 text-xs leading-5 text-muted">
                Author a campaign without an AI provider. The same approval,
                scheduling, audit and publishing controls still apply.
              </p>
              <div className="mt-4 space-y-3">
                <Field label="Manual campaign title">
                  <input
                    value={manualTitle}
                    onChange={(event) => setManualTitle(event.target.value)}
                    className="h-11 w-full rounded-xl border bg-background px-3 text-sm"
                    maxLength={180}
                    placeholder="Campaign title"
                  />
                </Field>
                <Field label="Caption">
                  <textarea
                    value={manualCaption}
                    onChange={(event) => setManualCaption(event.target.value)}
                    className="min-h-28 w-full resize-y rounded-xl border bg-background p-3 text-sm"
                    maxLength={2200}
                    placeholder="Channel-ready caption"
                  />
                </Field>
                <Field label="Public media URL">
                  <input
                    value={manualMediaUrl}
                    onChange={(event) => setManualMediaUrl(event.target.value)}
                    className="h-11 w-full rounded-xl border bg-background px-3 text-sm"
                    type="url"
                    placeholder="https://example.com/image.jpg"
                  />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => saveManual("draft")}
                    disabled={Boolean(saving)}
                    className="btn-secondary"
                  >
                    <Save size={14} />
                    {saving === "manual-draft" ? "Saving…" : "Save manual draft"}
                  </button>
                  <button
                    onClick={() => saveManual("manager_review")}
                    disabled={Boolean(saving)}
                    className="btn-primary"
                  >
                    <Send size={14} />
                    {saving === "manual-review" ? "Submitting…" : "Submit manual campaign"}
                  </button>
                </div>
              </div>
            </details>
            {savedMessage && (
              <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                {savedMessage}
              </div>
            )}
          </div>
        </section>

        <section className="min-h-[640px] rounded-2xl border bg-surface-raised p-5 sm:p-7">
          {result ? (
            <ResultPanel
              result={result}
              imageUrl={imageUrl}
              carouselAssets={carouselAssets}
              loadingImage={loading === "image"}
              loadingVideo={loading === "video"}
              onCreateImage={createImage}
              onCreateVideo={createVideo}
              generatedMediaType={generatedMediaType}
              onRegenerate={() => generate()}
              onSaveDraft={() => save("draft")}
              onSubmitReview={() => save("manager_review")}
              saving={saving === "draft" || saving === "review" ? saving : null}
              savedMessage={savedMessage}
            />
          ) : (
            <EmptyCanvas />
          )}
        </section>
      </div>
    </div>
  );
}

function ResultPanel({
  result,
  imageUrl,
  carouselAssets,
  loadingImage,
  loadingVideo,
  onCreateImage,
  onCreateVideo,
  generatedMediaType,
  onRegenerate,
  onSaveDraft,
  onSubmitReview,
  saving,
  savedMessage,
}: {
  result: GeneratedContent;
  imageUrl: string;
  carouselAssets: Array<{ publicUrl: string; storagePath?: string; brandOverlay?: Record<string, unknown> }>;
  loadingImage: boolean;
  loadingVideo: boolean;
  onCreateImage: () => void;
  onCreateVideo: () => void;
  generatedMediaType: "image" | "video";
  onRegenerate: () => void;
  onSaveDraft: () => void;
  onSubmitReview: () => void;
  saving: "draft" | "review" | null;
  savedMessage: string;
}) {
  const [activeVariant, setActiveVariant] = useState(0);
  const variant = result.variants[activeVariant] || result.variants[0];
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className="rounded-full border border-accent/25 bg-accent-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-accent">
            {result.provider} · {result.model}
          </span>
          <h2 className="mt-3 font-display text-2xl font-semibold tracking-[-0.035em]">
            {result.headline}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            {result.concept}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={onRegenerate} className="btn-secondary"><RefreshCw size={14} /> Regenerate</button>
          <button onClick={onSaveDraft} disabled={Boolean(saving)} className="btn-secondary"><Save size={14} /> {saving === "draft" ? "Saving…" : "Save draft"}</button>
          <button onClick={onSubmitReview} disabled={Boolean(saving)} className="btn-primary"><Send size={14} /> {saving === "review" ? "Submitting…" : "Submit for approval"}</button>
        </div>
      </div>
      {savedMessage && <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-3 text-sm text-emerald-200">{savedMessage}</div>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border bg-background/45 p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-muted">Category</p><p className="mt-2 text-sm font-semibold">{result.category}</p></div>
        <div className="rounded-xl border bg-background/45 p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-muted">Target audience</p><p className="mt-2 text-sm font-semibold">{result.targetAudience}</p></div>
        <div className="rounded-xl border bg-background/45 p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-muted">Suggested time</p><p className="mt-2 text-sm font-semibold">{result.suggestedPostingTime ? new Date(result.suggestedPostingTime).toLocaleString("en-IN") : "Review required"}</p></div>
        <div className="rounded-xl border bg-background/45 p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-muted">Safety</p><p className={cn("mt-2 text-sm font-semibold capitalize", result.safetyStatus === "passed" ? "text-success" : "text-amber-300")}>{result.safetyStatus.replace("_", " ")}</p></div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,.9fr)]">
        <div className="space-y-5">
          <div className="rounded-xl border bg-background/45 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent">Hook</p>
            <p className="mt-2 font-display text-xl font-semibold">{result.hook}</p>
            <p className="mt-3 text-sm text-muted"><b className="text-foreground">CTA:</b> {result.cta}</p>
          </div>

          <div>
            <div className="mb-3 flex flex-wrap gap-2">
              {result.variants.map((item, index) => (
                <button key={`${item.platform}-${index}`} onClick={() => setActiveVariant(index)} className={cn("rounded-lg border px-3 py-2 text-xs font-semibold capitalize", activeVariant === index && "border-accent bg-accent-soft text-accent")}>
                  {item.platform.replace("_", " ")}
                </button>
              ))}
            </div>
            {variant && (
              <div className="rounded-xl border bg-surface p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold capitalize">{variant.platform.replace("_", " ")}</p>
                  <CopyButton text={`${variant.caption}\n\n${variant.hashtags.join(" ")}`} />
                </div>
                <p className="mt-4 whitespace-pre-wrap text-sm leading-7">{variant.caption}</p>
                <p className="mt-4 text-sm leading-6 text-accent">{variant.hashtags.join(" ")}</p>
              </div>
            )}
          </div>

          {result.carouselSlides.length > 0 && (
            <div>
              <h3 className="font-display text-lg font-semibold">Carousel structure</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {result.carouselSlides.map((slide, index) => (
                  <div key={`${slide.heading}-${index}`} className="rounded-xl border bg-surface p-4">
                    <span className="text-xs font-bold text-accent">{String(index + 1).padStart(2, "0")}</span>
                    <h4 className="mt-4 font-semibold">{slide.heading}</h4>
                    <p className="mt-2 text-sm leading-6 text-muted">{slide.body}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.reel.scenes.length > 0 && (
            <div>
              <h3 className="font-display text-lg font-semibold">Reel production plan</h3>
              <div className="mt-3 space-y-2">
                {result.reel.scenes.map((scene) => (
                  <details key={scene.scene} className="rounded-xl border bg-surface p-4">
                    <summary className="cursor-pointer text-sm font-semibold">Scene {scene.scene} · {scene.overlay}</summary>
                    <div className="mt-3 grid gap-2 text-sm leading-6 text-muted sm:grid-cols-2">
                      <p><b className="text-foreground">Visual:</b> {scene.visual}</p>
                      <p><b className="text-foreground">Voiceover:</b> {scene.voiceover}</p>
                      <p><b className="text-foreground">Camera:</b> {scene.camera}</p>
                      <p><b className="text-foreground">B-roll:</b> {scene.broll}</p>
                    </div>
                  </details>
                ))}
              </div>
              <p className="mt-3 flex items-center gap-2 text-sm text-muted"><Music2 size={15} className="text-accent" /> {result.reel.musicKeywords.join(" · ")}</p>
            </div>
          )}
        </div>

        <aside>
          <div className="overflow-hidden rounded-xl border bg-background/60">
            {imageUrl ? (
              generatedMediaType === "video" ? (
                <video src={imageUrl} controls playsInline className="aspect-[9/16] max-h-[680px] w-full bg-black object-contain" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt={result.altText || "Varada Nexus campaign visual"} className="aspect-[4/5] w-full object-cover" />
              )
            ) : (
              <div className="grid aspect-[4/5] place-items-center p-8 text-center">
                <div>
                  <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent"><ImageIcon size={23} /></span>
                  <h3 className="mt-4 font-display text-lg font-semibold">Generate the campaign visual</h3>
                  <p className="mt-2 text-sm leading-6 text-muted">{result.imagePrompt}</p>
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    <button onClick={onCreateImage} disabled={loadingImage || loadingVideo} className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-[#100c05] disabled:opacity-50">
                      {loadingImage ? <LoaderCircle size={16} className="animate-spin" /> : <ImageIcon size={16} />}
                      Generate image
                    </button>
                    <button onClick={onCreateVideo} disabled={loadingImage || loadingVideo} className="btn-secondary">
                      {loadingVideo ? <LoaderCircle size={16} className="animate-spin" /> : <Film size={16} />}
                      {loadingVideo ? "Rendering reel…" : "Generate 8s reel clip"}
                    </button>
                  </div>
                  <p className="mt-3 text-xs text-muted">Video generation uses the protected Google Cloud credit ledger and stops before paid overage.</p>
                </div>
              </div>
            )}
          </div>
          {generatedMediaType === "image" && carouselAssets.length > 1 && (
            <div className="mt-4 rounded-xl border bg-surface p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Images size={15} className="text-accent" /> Carousel slides · {carouselAssets.length}
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {carouselAssets.map((asset, index) => (
                  <div key={asset.storagePath || asset.publicUrl || index} className="relative overflow-hidden rounded-lg border bg-background/60">
                    <span className="absolute left-1.5 top-1.5 z-10 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={asset.publicUrl} alt={`${result.altText || "Carousel slide"} ${index + 1}`} className="aspect-[4/5] w-full object-cover" />
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted">All {carouselAssets.length} slides are saved with the campaign when you save the draft or submit for approval.</p>
            </div>
          )}
          <div className="mt-4 rounded-xl border bg-surface p-4">
            <p className="flex items-center gap-2 text-sm font-semibold"><Check size={15} className={result.safetyStatus === "passed" ? "text-success" : "text-amber-300"} /> Brand safety review</p>
            <ul className="mt-3 space-y-2 text-xs leading-5 text-muted">
              {[...result.safetyNotes, ...(result.safetyReview?.issues || [])].length
                ? [...new Set([...result.safetyNotes, ...(result.safetyReview?.issues || [])])].map((note) => <li key={note}>• {note}</li>)
                : <li>• Branding, language, claims and copyright checks passed.</li>}
            </ul>
            <p className="mt-3 text-xs text-muted"><b className="text-foreground">Keywords:</b> {result.keywords.join(", ")}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function EmptyCanvas() {
  return (
    <div className="grid min-h-[590px] place-items-center text-center">
      <div className="max-w-md">
        <span className="mx-auto grid size-16 place-items-center rounded-2xl border border-accent/25 bg-accent-soft text-accent"><Sparkles size={27} /></span>
        <h2 className="mt-5 font-display text-2xl font-semibold">Your campaign canvas is ready</h2>
        <p className="mt-3 text-sm leading-6 text-muted">Choose the EMS modules that contain the relevant business signal, define your brief, and generate a complete cross-platform campaign.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2 text-xs text-muted">
          <span className="rounded-full border px-3 py-1.5">Captions</span>
          <span className="rounded-full border px-3 py-1.5">Hashtags</span>
          <span className="rounded-full border px-3 py-1.5">Carousels</span>
          <span className="rounded-full border px-3 py-1.5">Reel scripts</span>
          <span className="rounded-full border px-3 py-1.5">AI visuals</span>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-muted">{label}</span>{children}</label>;
}

function Toggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={cn("rounded-lg border bg-background px-2.5 py-2 text-xs font-semibold text-muted transition", active && "border-accent bg-accent-soft text-accent")}>{children}</button>;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return <button onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }} className="rounded-lg p-2 text-muted hover:bg-background" aria-label="Copy content">{copied ? <Check size={15} className="text-success" /> : <Clipboard size={15} />}</button>;
}
