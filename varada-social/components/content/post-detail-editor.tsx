"use client";
/* eslint-disable @next/next/no-img-element -- Meta and generated campaign assets use dynamic signed/public URLs. */

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, ExternalLink, ImageIcon, LoaderCircle, RefreshCw, Save, ShieldCheck, X } from "lucide-react";
import { socialEdgeFetch } from "@/lib/api/client";
import { StatusBadge } from "@/components/ui/status-badge";

type Variant = { platform?: string; title?: string; caption?: string; hashtags?: string[]; [key: string]: unknown };

export type SocialContentItem = {
  id: string;
  title: string;
  format: string;
  status: string;
  platforms: string[];
  topic?: string | null;
  objective?: string | null;
  tone?: string | null;
  category?: string | null;
  target_audience?: string | null;
  keywords?: string[];
  scheduled_for: string | null;
  safety_status?: string;
  content_package?: Record<string, unknown> & {
    concept?: string;
    hook?: string;
    cta?: string;
    altText?: string;
    variants?: Variant[];
    funnelStage?: string;
    planningStatus?: string;
  };
  social_media_assets?: Array<{
    id: string;
    media_type: string;
    mime_type: string;
    metadata?: { public_url?: string; [key: string]: unknown };
  }>;
  social_content_channels?: Array<{
    id: string;
    platform: string;
    status: string;
    scheduled_for: string | null;
    external_permalink?: string | null;
  }>;
};

const editableStatuses = new Set(["draft", "manager_review", "admin_review", "approved", "scheduled", "rejected", "failed"]);
const availablePlatforms = ["instagram", "facebook"];

function localInputValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return adjusted.toISOString().slice(0, 16);
}

export function PostDetailEditor({ item, onClose, onSaved }: { item: SocialContentItem; onClose: () => void; onSaved: () => Promise<void> | void }) {
  const content = item.content_package || {};
  const variants = Array.isArray(content.variants) ? content.variants : [];
  const firstVariant = variants[0] || {};
  const [title, setTitle] = useState(item.title || "");
  const [hook, setHook] = useState(String(content.hook || item.title || ""));
  const [concept, setConcept] = useState(String(content.concept || item.topic || ""));
  const [caption, setCaption] = useState(String(firstVariant.caption || item.topic || ""));
  const [cta, setCta] = useState(String(content.cta || ""));
  const [hashtags, setHashtags] = useState(Array.isArray(firstVariant.hashtags) ? firstVariant.hashtags.join(" ") : "");
  const [altText, setAltText] = useState(String(content.altText || ""));
  const [objective, setObjective] = useState(item.objective || "");
  const [targetAudience, setTargetAudience] = useState(item.target_audience || "");
  const [keywords, setKeywords] = useState((item.keywords || []).join(", "));
  const [platforms, setPlatforms] = useState(item.platforms || []);
  const [scheduledFor, setScheduledFor] = useState(localInputValue(item.scheduled_for));
  const [saving, setSaving] = useState(false);
  const [regeneratingAsset, setRegeneratingAsset] = useState("");
  const [error, setError] = useState("");
  const editable = editableStatuses.has(item.status);
  const assets = item.social_media_assets || [];
  const externalPermalink = item.social_content_channels?.find((channel) => channel.external_permalink)?.external_permalink;

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  const hashtagList = useMemo(() => hashtags.split(/[\s,]+/).map((tag) => tag.trim()).filter(Boolean).map((tag) => tag.startsWith("#") ? tag : `#${tag}`), [hashtags]);

  async function save() {
    if (!editable || !title.trim()) return;
    if (!platforms.length) {
      setError("Select at least one publishing platform.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const updatedVariants = platforms.map((platform) => ({
        ...(variants.find((variant) => variant.platform === platform) || {}),
        platform,
        title: title.trim(),
        caption: caption.trim(),
        hashtags: hashtagList,
      }));
      await socialEdgeFetch("update_content", {
        contentId: item.id,
        title: title.trim(),
        topic: concept.trim() || caption.trim(),
        objective: objective.trim(),
        targetAudience: targetAudience.trim(),
        keywords: keywords.split(",").map((value) => value.trim()).filter(Boolean),
        platforms,
        scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : null,
        contentPackage: {
          ...content,
          headline: title.trim(),
          hook: hook.trim(),
          concept: concept.trim(),
          cta: cta.trim(),
          altText: altText.trim(),
          variants: updatedVariants,
          planningStatus: "authored",
          requiresGeneration: false,
        },
      });
      await onSaved();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Post could not be updated.");
    } finally {
      setSaving(false);
    }
  }

  async function regenerateArtwork(assetId: string) {
    if (!editable || regeneratingAsset) return;
    setRegeneratingAsset(assetId);
    setError("");
    try {
      await socialEdgeFetch("regenerate_content_asset", { contentId: item.id, assetId });
      await onSaved();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Artwork could not be regenerated.");
    } finally {
      setRegeneratingAsset("");
    }
  }

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/80 p-3 backdrop-blur-sm sm:p-6" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section role="dialog" aria-modal="true" aria-label={`Post details: ${item.title}`} className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl">
        <header className="flex items-start gap-3 border-b p-4 sm:p-5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><StatusBadge status={item.status} /><span className="text-xs capitalize text-muted">{item.format.replaceAll("_", " ")}</span>{item.category && <span className="text-xs text-accent">{item.category}</span>}</div>
            <h2 className="mt-2 truncate font-display text-xl font-semibold">Full post details</h2>
          </div>
          {externalPermalink && <a href={externalPermalink} target="_blank" rel="noreferrer" className="btn-secondary"><ExternalLink size={15} /> Live post</a>}
          <button onClick={onClose} className="grid size-10 shrink-0 place-items-center rounded-xl border hover:bg-surface" aria-label="Close post"><X size={18} /></button>
        </header>

        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(300px,0.8fr)_minmax(420px,1.2fr)]">
          <aside className="border-b p-4 lg:border-b-0 lg:border-r lg:p-5">
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">Post artwork</p>
            {assets.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">{assets.map((asset) => {
              const url = String(asset.metadata?.public_url || "");
              return <div key={asset.id} className="relative overflow-hidden rounded-xl border bg-surface">
                {url && asset.media_type === "video" ? <video src={url} controls className="aspect-[4/5] w-full object-contain" /> : url ? <img src={url} alt={altText || item.title} className="aspect-[4/5] w-full object-contain" /> : <div className="grid aspect-[4/5] place-items-center text-muted"><ImageIcon size={28} /></div>}
                {editable && asset.media_type === "image" && <button type="button" onClick={() => void regenerateArtwork(asset.id)} disabled={Boolean(regeneratingAsset)} className="absolute bottom-3 left-3 right-3 flex items-center justify-center gap-2 rounded-lg border border-white/15 bg-black/80 px-3 py-2 text-xs font-semibold text-white backdrop-blur-sm disabled:opacity-60">{regeneratingAsset === asset.id ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />} Regenerate clean artwork</button>}
              </div>;
            })}</div> : <div className="grid min-h-64 place-items-center rounded-xl border border-dashed bg-surface text-center text-muted"><div><ImageIcon className="mx-auto" /><p className="mt-2 text-sm">Artwork has not been generated yet.</p></div></div>}
            <div className="mt-4 rounded-xl border bg-surface p-4 text-xs leading-5 text-muted">
              <p className="flex items-center gap-2 font-semibold text-foreground"><ShieldCheck size={14} className="text-accent" /> Editing safety</p>
              <p className="mt-1">Changes return reviewed or scheduled content to Draft and require safety validation and approval again. Published Meta posts are read-only here.</p>
            </div>
          </aside>

          <main className="space-y-4 p-4 sm:p-5">
            {!editable && <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-sm text-amber-100">This post is {item.status.replaceAll("_", " ")} and is read-only. Use the live post link for actions supported by Meta.</div>}
            {error && <div className="rounded-xl border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}
            <Field label="Post title"><input className="field w-full" value={title} onChange={(event) => setTitle(event.target.value)} disabled={!editable} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Hook"><textarea className="field min-h-24 w-full" value={hook} onChange={(event) => setHook(event.target.value)} disabled={!editable} /></Field>
              <Field label="Content concept"><textarea className="field min-h-24 w-full" value={concept} onChange={(event) => setConcept(event.target.value)} disabled={!editable} /></Field>
            </div>
            <Field label="Caption"><textarea className="field min-h-40 w-full" value={caption} onChange={(event) => setCaption(event.target.value)} disabled={!editable} placeholder="Full platform caption" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Call to action"><textarea className="field min-h-24 w-full" value={cta} onChange={(event) => setCta(event.target.value)} disabled={!editable} /></Field>
              <Field label="Hashtags"><textarea className="field min-h-24 w-full" value={hashtags} onChange={(event) => setHashtags(event.target.value)} disabled={!editable} placeholder="#VaradaNexus #Business" /></Field>
            </div>
            <Field label="Alt text"><textarea className="field min-h-20 w-full" value={altText} onChange={(event) => setAltText(event.target.value)} disabled={!editable} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Campaign objective"><textarea className="field min-h-20 w-full" value={objective} onChange={(event) => setObjective(event.target.value)} disabled={!editable} /></Field>
              <Field label="Target audience"><textarea className="field min-h-20 w-full" value={targetAudience} onChange={(event) => setTargetAudience(event.target.value)} disabled={!editable} /></Field>
            </div>
            <Field label="SEO keywords (comma-separated)"><input className="field w-full" value={keywords} onChange={(event) => setKeywords(event.target.value)} disabled={!editable} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Publishing platforms"><div className="flex min-h-11 flex-wrap items-center gap-4 rounded-xl border bg-surface px-3">{availablePlatforms.map((platform) => <label key={platform} className="flex items-center gap-2 text-sm capitalize"><input type="checkbox" checked={platforms.includes(platform)} disabled={!editable} onChange={(event) => setPlatforms((current) => event.target.checked ? [...new Set([...current, platform])] : current.filter((item) => item !== platform))} />{platform}</label>)}</div></Field>
              <Field label="Planned publishing time"><div className="relative"><CalendarClock size={15} className="pointer-events-none absolute left-3 top-3.5 text-muted" /><input type="datetime-local" className="field w-full pl-9" value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} disabled={!editable} /></div></Field>
            </div>
          </main>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t p-4 sm:px-5">
          <p className="text-xs text-muted">Safety: <span className="capitalize text-foreground">{(item.safety_status || "pending").replaceAll("_", " ")}</span>{content.funnelStage ? ` · Funnel: ${content.funnelStage}` : ""}</p>
          <div className="flex gap-2"><button onClick={onClose} className="btn-secondary">Close</button>{editable && <button onClick={() => void save()} disabled={saving || !title.trim()} className="btn-primary">{saving ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />} Save changes</button>}</div>
        </footer>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-muted"><span className="mb-2 block">{label}</span>{children}</label>;
}
