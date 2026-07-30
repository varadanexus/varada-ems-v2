// mcp/lib/seo.mjs
// Lightweight, deterministic SEO auditor for a single blog post row.
// Produces a 0-100 heuristic score plus a list of concrete problems, without
// calling any AI (fast + free). Mirrors the on-page factors the site cares about.

import { CONFIG } from "./config.mjs";

const stripHtml = (h) => String(h || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/**
 * Audit one post row (must include title, slug, excerpt, content, meta_title,
 * meta_description, tags, primary_category, cover_image, alt_text).
 * @returns {{score:number, problems:string[], stats:object}}
 */
export function auditPost(p) {
  const problems = [];
  const title = p.title || "";
  const metaTitle = p.meta_title || "";
  const metaDesc = p.meta_description || "";
  const html = String(p.content || "");
  const plain = stripHtml(p.content);
  const words = plain ? plain.split(" ").length : 0;
  const h2 = (html.match(/<h2\b/gi) || []).length;
  // Internal links: count BOTH site-relative hrefs (/blog…) AND absolute URLs to
  // any varadanexus domain — covers varadanexus.com, varadanexus.in and the
  // beta. subdomain, including the platform's own /blog/post.html?slug=… permalink
  // format that all internal cross-links use. The previous regex only matched
  // relative paths, so absolute internal links were wrongly counted as zero.
  const internalLinks = (html.match(
    /href=["'](?:\/(?:blog|services|founder|contact|about|resources)|https?:\/\/[^"']*varadanexus\.[a-z]+\/[^"']*)/gi
  ) || []).length;
  const anyLinks = (html.match(/<a\b/gi) || []).length;

  let score = 100;
  const penalise = (pts, msg) => { score -= pts; problems.push(msg); };

  // Title
  if (!title) penalise(25, "Missing title.");
  else if (title.length < 25) penalise(8, `Title is short (${title.length} chars) — aim for 40-65.`);
  else if (title.length > 70) penalise(6, `Title is long (${title.length} chars) — search may truncate it.`);

  // Meta title / description
  if (!metaTitle) penalise(6, "Missing meta_title — will fall back to the H1/title.");
  else if (metaTitle.length > 60) penalise(3, `meta_title is ${metaTitle.length} chars (>60 may truncate).`);
  if (!metaDesc) penalise(12, "Missing meta_description — weak SERP snippet.");
  else if (metaDesc.length < 70) penalise(5, `meta_description is short (${metaDesc.length} chars) — aim for 120-155.`);
  else if (metaDesc.length > 160) penalise(4, `meta_description is ${metaDesc.length} chars (>160 may truncate).`);

  // Body depth & structure
  if (words < 300) penalise(20, `Thin content (${words} words) — aim for 600+.`);
  else if (words < 500) penalise(8, `Below target length (${words} words) — aim for 600+.`);
  if (h2 === 0) penalise(8, "No <h2> subheadings — poor structure & readability.");
  if (internalLinks === 0) penalise(10, "No internal links to other site pages.");
  else if (anyLinks === 0) penalise(4, "No links at all in the article body.");

  // Media & taxonomy
  if (!p.cover_image) penalise(5, "No cover image set.");
  if (p.cover_image && !p.alt_text) penalise(3, "Cover image has no alt_text.");
  if (!p.primary_category) penalise(6, "No primary_category assigned.");
  if (!Array.isArray(p.tags) || p.tags.length === 0) penalise(4, "No tags.");

  // Excerpt
  if (!p.excerpt) penalise(4, "No excerpt.");

  // Slug hygiene
  if (p.slug && p.slug.length > 75) penalise(2, "Slug is very long.");

  score = Math.max(0, Math.min(100, Math.round(score)));

  // --------------------------------------------------------------------------
  // Deterministic quality & confidence scores.
  //
  // These are on-page, reproducible heuristics — DISTINCT from the AI generation
  // pipeline's quality gate. They exist so that hand-authored posts (source =
  // "manual"), which never pass through the AI gate, still carry meaningful
  // quality_score / confidence_score values instead of null. They are labelled
  // as source "deterministic_audit" by the caller so the two are never conflated.
  // --------------------------------------------------------------------------
  const hasFaq = /<h2[^>]*>\s*(faqs?|frequently asked)/i.test(html);
  const hasSchema = /application\/ld\+json/i.test(html);
  const hasExternalRef = /rel=["'][^"']*nofollow/i.test(html);
  const tagsN = Array.isArray(p.tags) ? p.tags.length : 0;
  const metaComplete =
    !!metaTitle && metaTitle.length <= 60 &&
    !!metaDesc && metaDesc.length >= 70 && metaDesc.length <= 160;

  // quality: editorial completeness of the article itself (depth, structure,
  // FAQ, structured data, internal linking, an authoritative citation, metadata,
  // and media). Weighted to 0-100.
  let quality = 0;
  quality += words >= 1500 ? 26 : words >= 1000 ? 18 : words >= 600 ? 10 : 0;
  quality += h2 >= 4 ? 16 : h2 >= 2 ? 10 : h2 >= 1 ? 5 : 0;
  quality += hasFaq ? 12 : 0;
  quality += hasSchema ? 12 : 0;
  quality += internalLinks >= 2 ? 12 : internalLinks === 1 ? 6 : 0;
  quality += hasExternalRef ? 8 : 0;
  quality += metaComplete ? 8 : (metaTitle && metaDesc ? 4 : 0);
  quality += (p.cover_image && p.alt_text) ? 6 : (p.cover_image ? 3 : 0);
  quality = Math.max(0, Math.min(100, Math.round(quality)));

  // confidence: how complete the publishable record is — the fraction of the
  // required publishing signals that are verifiably present. A record missing
  // metadata, links or schema is one we are less confident is fully ready.
  const signals = [
    !!title, !!metaTitle, !!metaDesc, !!p.excerpt, !!p.primary_category,
    tagsN >= 4, !!p.cover_image, !!p.alt_text, internalLinks >= 2,
    hasExternalRef, hasSchema, hasFaq, words >= 1000,
  ];
  const confidence = Math.round((signals.filter(Boolean).length / signals.length) * 100);

  return {
    score,
    quality,
    confidence,
    problems,
    stats: {
      words,
      h2_count: h2,
      internal_links: internalLinks,
      external_ref: hasExternalRef,
      has_faq: hasFaq,
      has_schema: hasSchema,
      title_length: title.length,
      meta_description_length: metaDesc.length,
      canonical: p.canonical_url || `${CONFIG.siteUrl}/blog/post.html?slug=${p.slug || ""}`,
    },
  };
}
