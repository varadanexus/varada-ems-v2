// mcp/lib/generate.mjs
// Reuses the project's existing AI router (scripts/ai-router.mjs) to generate a
// blog post + quality review, applying the same honesty rules and quality gate
// the CI generators use. Returns a normalised record ready to insert into
// blog_posts, along with the quality scores.

import { callAI } from "../../scripts/ai-router.mjs";
import { generateCoverImage } from "../../scripts/image-gen.mjs";
import { slugify } from "./supabase.mjs";

const SYSTEM =
  "You are the content editor for Varada Nexus Private Limited, a multi-sector Indian enterprise " +
  "(healthcare infrastructure, mining, logistics, global trade, digital commerce, interiors). " +
  "Write a professional, genuinely useful, SEO-strong thought-leadership article. STRICT RULES: " +
  "do not invent statistics, do not fabricate quotes, do not make specific unverifiable claims about " +
  "Varada Nexus's clients, revenue, or projects. Insight-driven and industry-focused. Indian English, " +
  "confident but not salesy.";

function buildUser({ topic, category, contentType, keywords }) {
  const kw = Array.isArray(keywords) && keywords.length
    ? ` Target these keywords naturally: ${keywords.join(", ")}.` : "";
  return (
    `Write a ${contentType || "evergreen"} blog post (650-900 words) about: ${topic}.` +
    (category ? ` Primary category: ${category}.` : "") + kw +
    " Return ONLY a strict JSON object with keys: " +
    "title (string, <=70 chars), " +
    "excerpt (string, 1 sentence <=160 chars), " +
    "tags (array of 3-6 short strings), " +
    "content_html (valid HTML using <p>, <h2>, <h3>, <ul>/<li>, <blockquote> — no <html>/<head>/<body>, " +
    "no inline styles, no <h1>; include at least two <h2> subheadings and one internal link to /blog/), " +
    "meta_title (<=60 chars), meta_description (<=155 chars), " +
    "alt_text (<=110 chars, describing a suitable cover image), " +
    "featured_image_prompt (1 sentence), " +
    "linkedin_post_text (2-4 sentence LinkedIn post, professional, max 3 hashtags), " +
    "seo_score (0-100), quality_score (0-100), confidence_score (0-100)."
  );
}

/**
 * Generate a post. Escalation/fallback/budget are handled inside callAI.
 * @returns {Promise<{rec:object, scores:object, model:string}>}
 */
export async function generatePost({ topic, category, contentType, keywords, usePremium, runKind = "manual", postId = null }) {
  const post = await callAI({
    task: "article_writing",
    system: SYSTEM,
    user: buildUser({ topic, category, contentType, keywords }),
    importance: usePremium ? "high" : "medium",
    runKind,
    postId,
  });

  if (!post || !post.title || !post.content_html) {
    throw new Error("AI returned an incomplete post (missing title or content).");
  }

  // Strip stray anchor tags that break our styling only if malformed; keep valid internal links.
  const body = String(post.content_html);
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  const scores = {
    seo_score: Number(post.seo_score) || null,
    quality_score: Number(post.quality_score) || null,
    confidence_score: Number(post.confidence_score) || null,
  };

  const title = String(post.title).slice(0, 120);

  // Generate a real, unique cover image (Gemini image model → Supabase
  // Storage). Never throws; returns null on any failure, in which case the
  // DB trigger fallback (a small fixed stock-photo pool) applies instead.
  const cover_image = await generateCoverImage({
    prompt: post.featured_image_prompt || null,
    title,
    category: category || null,
    keywords,
    seed: postId || title,
  });
  if (!cover_image) {
    throw new Error("Unique cover image generation failed; the post was not created.");
  }

  const rec = {
    title,
    slug: slugify(post.title) + "-" + datePart,
    excerpt: post.excerpt ? String(post.excerpt).slice(0, 200) : null,
    content: body,
    tags: Array.isArray(post.tags) ? post.tags.slice(0, 6) : [],
    author: "Varada Nexus",
    source: "ai",
    primary_category: category || null,
    content_type: contentType || "evergreen",
    region: "India",
    meta_title: post.meta_title ? String(post.meta_title).slice(0, 70) : null,
    meta_description: post.meta_description ? String(post.meta_description).slice(0, 160) : null,
    cover_image: cover_image || null,
    alt_text: post.alt_text || null,
    featured_image_prompt: post.featured_image_prompt || null,
    linkedin_post_text: post.linkedin_post_text || null,
    ...scores,
  };

  return { rec, scores, model: post.__model || null };
}
