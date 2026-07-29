"use client";

import { useState } from "react";
import {
  Check,
  Clipboard,
  ImageIcon,
  LoaderCircle,
  Music2,
  RefreshCw,
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

const emsModules = [
  ["transportation", "Transportation"],
  ["interiors", "Interiors"],
  ["digital-services", "Digital Services"],
  ["meetings", "Meetings"],
  ["support", "Support"],
  ["legal", "Legal"],
] as const;

export function CreationStudio() {
  const [selectedPlatforms, setSelectedPlatforms] = useState<SocialPlatform[]>([
    "instagram",
    "linkedin",
  ]);
  const [selectedModules, setSelectedModules] = useState<string[]>([
    "transportation",
  ]);
  const [format, setFormat] = useState<ContentFormat>("carousel");
  const [topic, setTopic] = useState("");
  const [objective, setObjective] = useState("Build authority and generate qualified enquiries");
  const [tone, setTone] = useState("Professional and educational");
  const [length, setLength] = useState<"short" | "medium" | "long">("medium");
  const [cta, setCta] = useState("Contact Varada Nexus to discuss your requirements");
  const [provider, setProvider] = useState("openai");
  const [result, setResult] = useState<GeneratedContent | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [imageStoragePath, setImageStoragePath] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [manualCaption, setManualCaption] = useState("");
  const [manualMediaUrl, setManualMediaUrl] = useState("");
  const [loading, setLoading] = useState<"content" | "image" | null>(null);
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

  async function generate() {
    if (!topic.trim()) {
      setError("Enter a topic or campaign brief.");
      return;
    }
    setLoading("content");
    setError("");
    try {
      const generated = await socialEdgeFetch<GeneratedContent>("generate_text", {
          topic,
          objective,
          platforms: selectedPlatforms,
          format,
          tone,
          length,
          callToAction: cta,
          emsModules: selectedModules,
          includeEmsContext: true,
          preferredProvider: provider,
      });
      setResult(generated);
      setImageUrl("");
      setImageStoragePath("");
      setSavedMessage("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Generation failed.");
    } finally {
      setLoading(null);
    }
  }

  async function createImage() {
    if (!result?.imagePrompt) return;
    setLoading("image");
    setError("");
    try {
      const generated = await socialEdgeFetch<{ assetUrl: string; storagePath?: string }>("generate_image", {
          prompt: result.imagePrompt,
          aspectRatio: format === "story" || format === "reel" ? "story" : "portrait",
          quality: "medium",
          style: "premium black and gold corporate editorial photography",
      });
      setImageUrl(generated.assetUrl);
      setImageStoragePath(generated.storagePath || "");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Image generation failed.");
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
          contentPackage: result,
          status,
          emsModules: selectedModules,
          asset: imageUrl ? {
            publicUrl: imageUrl,
            storagePath: imageStoragePath || undefined,
            mediaType: "image",
            mimeType: "image/png",
          } : null,
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
          mediaType: format === "reel" || format === "story" ? "video" : "image",
          mimeType: format === "reel" || format === "story" ? "video/mp4" : "image/jpeg",
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
                <option value="openai">OpenAI · GPT-5.6</option>
                <option value="anthropic">Anthropic · Claude</option>
                <option value="gemini">Google · Gemini</option>
              </select>
            </Field>

            {error && (
              <div className="rounded-xl border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-200">
                {error}
              </div>
            )}

            <button
              onClick={generate}
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
              loadingImage={loading === "image"}
              onCreateImage={createImage}
              onRegenerate={generate}
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
  loadingImage,
  onCreateImage,
  onRegenerate,
  onSaveDraft,
  onSubmitReview,
  saving,
  savedMessage,
}: {
  result: GeneratedContent;
  imageUrl: string;
  loadingImage: boolean;
  onCreateImage: () => void;
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

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,.9fr)]">
        <div className="space-y-5">
          <div className="rounded-xl border bg-background/45 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent">Hook</p>
            <p className="mt-2 font-display text-xl font-semibold">{result.hook}</p>
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
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="AI-generated campaign visual" className="aspect-[4/5] w-full object-cover" />
            ) : (
              <div className="grid aspect-[4/5] place-items-center p-8 text-center">
                <div>
                  <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent"><ImageIcon size={23} /></span>
                  <h3 className="mt-4 font-display text-lg font-semibold">Generate the campaign visual</h3>
                  <p className="mt-2 text-sm leading-6 text-muted">{result.imagePrompt}</p>
                  <button onClick={onCreateImage} disabled={loadingImage} className="mx-auto mt-5 flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-[#100c05] disabled:opacity-50">
                    {loadingImage ? <LoaderCircle size={16} className="animate-spin" /> : <ImageIcon size={16} />}
                    Generate image
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="mt-4 rounded-xl border bg-surface p-4">
            <p className="flex items-center gap-2 text-sm font-semibold"><Check size={15} className="text-success" /> Brand safety review</p>
            <ul className="mt-3 space-y-2 text-xs leading-5 text-muted">
              {(result.safetyNotes.length ? result.safetyNotes : ["No material risks identified."]).map((note) => <li key={note}>• {note}</li>)}
            </ul>
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
