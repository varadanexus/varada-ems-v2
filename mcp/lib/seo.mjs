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
  const plain = stripHtml(p.content);
  const words = plain ? plain.split(" ").length : 0;
  const h2 = (String(p.content || "").match(/<h2\b/gi) || []).length;
  const internalLinks = (String(p.content || "").match(/href=["']\/(blog|services|founder|contact)/gi) || []).length;
  const anyLinks = (String(p.content || "").match(/<a\b/gi) || []).length;

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
  return {
    score,
    problems,
    stats: {
      words,
      h2_count: h2,
      internal_links: internalLinks,
      title_length: title.length,
      meta_description_length: metaDesc.length,
      canonical: p.canonical_url || `${CONFIG.siteUrl}/blog/post.html?slug=${p.slug || ""}`,
    },
  };
}
