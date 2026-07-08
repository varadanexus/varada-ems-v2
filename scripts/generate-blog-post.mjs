// Weekly AI blog-post generator for Varada Nexus.
// Generates one industry-insight evergreen post and inserts it into Supabase
// (blog_posts) as a published, source='ai' row. Runs from GitHub Actions on
// a schedule or via workflow_dispatch.
//
// AI routing handled by ai-router.mjs — set at least one provider key:
//   OPENROUTER_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { callAI } from "./ai-router.mjs";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const TOPICS = [
  "hospital infrastructure and healthcare systems",
  "mining operations and mineral logistics",
  "fleet logistics and commodity transport in India",
  "import-export and global trade execution",
  "digital commerce and e-commerce growth",
  "HR, workforce structuring, and organisational systems",
  "strategic arbitrage and deal structuring",
  "multi-sector enterprise execution and operations",
];
// Rotate topic by ISO week so posts vary week to week.
const week  = Math.floor(Date.now() / (7 * 24 * 3600 * 1000));
const topic = TOPICS[week % TOPICS.length];

const SYSTEM =
  "You are the content editor for Varada Nexus Private Limited, a multi-sector Indian enterprise " +
  "(healthcare infrastructure, mining, logistics, global trade, digital commerce). Write a professional, " +
  "genuinely useful thought-leadership article. STRICT RULES: do not invent statistics, do not fabricate " +
  "quotes, do not make specific unverifiable claims about Varada Nexus's clients, revenue, or projects. " +
  "Keep it insight-driven and industry-focused. Indian English, confident but not salesy.";

const USER =
  `Write a blog post (600-850 words) about: ${topic}. ` +
  "Return ONLY a strict JSON object with keys: title (string, <=70 chars), excerpt (string, 1 sentence <=160 chars), " +
  "tags (array of 3-5 short strings), content_html (string: valid HTML using <p>, <h2>, <h3>, <ul>/<li>, <blockquote> — " +
  "no <html>/<head>/<body>, no inline styles, no <h1>), " +
  "seo_score (0-100), quality_score (0-100), confidence_score (0-100).";

function slugify(s) {
  return String(s).toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);
}

async function insertPost(rec) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/blog_posts`, {
    method: "POST",
    headers: {
      apikey:         SUPABASE_SERVICE_ROLE_KEY,
      authorization:  "Bearer " + SUPABASE_SERVICE_ROLE_KEY,
      "content-type": "application/json",
      prefer:         "return=representation",
    },
    body: JSON.stringify(rec),
  });
  if (!res.ok) throw new Error("Supabase insert failed " + res.status + ": " + (await res.text()));
  return res.json();
}

(async () => {
  const post = await callAI({
    task:       "article_writing",
    system:     SYSTEM,
    user:       USER,
    importance: "medium",
    runKind:    "weekly",
  });

  if (!post.title || !post.content_html) throw new Error("AI returned an incomplete post");

  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rec = {
    title:            post.title,
    slug:             slugify(post.title) + "-" + datePart,
    excerpt:          post.excerpt || null,
    content:          post.content_html || "",
    tags:             Array.isArray(post.tags) ? post.tags : [],
    author:           "Varada Nexus",
    status:           "published",
    source:           "ai",
    published_at:     new Date().toISOString(),
    seo_score:        Number(post.seo_score)        || null,
    quality_score:    Number(post.quality_score)    || null,
    confidence_score: Number(post.confidence_score) || null,
  };

  await insertPost(rec);
  console.log("Published:", rec.title, "->", "/blog/post.html?slug=" + rec.slug);
})().catch((e) => { console.error(e.message || e); process.exit(1); });
