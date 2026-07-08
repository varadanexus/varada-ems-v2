// Daily news-driven AI blog generator for Varada Nexus.
// Pulls REAL headlines from trusted, free RSS feeds (Government of India press
// releases + top Indian business press), matches them to the sectors Varada
// Nexus operates in, and generates up to POSTS_PER_DAY grounded analysis posts.
// Every post carries a "References" section with the genuine source links —
// links are taken directly from the feeds, never invented by the AI.
//
// AI routing handled by ai-router.mjs — set at least one provider key:
//   OPENROUTER_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY
// Optional env: POSTS_PER_DAY (default 5)

import { callAI } from "./ai-router.mjs";

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  POSTS_PER_DAY,
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const MAX_POSTS = Math.min(Math.max(parseInt(POSTS_PER_DAY || "5", 10) || 5, 1), 6);
const FRESH_HOURS = 48; // only cover news from the last 48 hours

// ---------------------------------------------------------------------------
// Trusted sources only. Government feeds first, then established business press.
// A story is used ONLY if its link resolves to one of TRUSTED_DOMAINS.
// ---------------------------------------------------------------------------
const FEEDS = [
  // Government of India — official releases
  { url: "https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3", kind: "government", name: "PIB (Press Information Bureau)" },
  { url: "https://www.rbi.org.in/pressreleases_rss.xml", kind: "government", name: "Reserve Bank of India" },
  // Established business press
  { url: "https://economictimes.indiatimes.com/rssfeedstopstories.cms", kind: "business", name: "The Economic Times" },
  { url: "https://economictimes.indiatimes.com/industry/rssfeeds/13352306.cms", kind: "business", name: "The Economic Times — Industry" },
  { url: "https://www.business-standard.com/rss/economy-102.rss", kind: "business", name: "Business Standard — Economy" },
  { url: "https://www.business-standard.com/rss/industry-217.rss", kind: "business", name: "Business Standard — Industry" },
  { url: "https://www.livemint.com/rss/economy", kind: "business", name: "Mint — Economy" },
  { url: "https://www.livemint.com/rss/industry", kind: "business", name: "Mint — Industry" },
  { url: "https://www.thehindubusinessline.com/economy/feeder/default.rss", kind: "business", name: "The Hindu BusinessLine — Economy" },
];

const TRUSTED_DOMAINS = [
  "pib.gov.in",
  "rbi.org.in",
  "gov.in", // any Government of India domain
  "nic.in",
  "economictimes.indiatimes.com",
  "business-standard.com",
  "livemint.com",
  "thehindubusinessline.com",
];

// Sectors Varada Nexus operates in, with matching keywords.
const SECTORS = [
  { tag: "healthcare", label: "hospital & healthcare infrastructure", kw: ["hospital", "healthcare", "health ministry", "ayushman", "medical device", "pharma", "clinical"] },
  { tag: "mining", label: "mining & mineral resources", kw: ["mining", "mineral", "coal", "ore", "steel", "metals", "quarry"] },
  { tag: "logistics", label: "logistics & commodity transport", kw: ["logistics", "freight", "transport", "railways", "highway", "supply chain", "warehousing", "shipping", "port", "cargo", "fleet"] },
  { tag: "trade", label: "import-export & global trade", kw: ["export", "import", "trade", "customs", "dgft", "tariff", "fta", "trade agreement", "trade policy", "forex"] },
  { tag: "ecommerce", label: "digital commerce & e-commerce", kw: ["e-commerce", "ecommerce", "online retail", "digital commerce", "ondc", "marketplace", "fintech", "upi"] },
  { tag: "hr", label: "HR & workforce", kw: ["labour", "labor", "workforce", "employment", "epfo", "hiring", "wage", "hr policy", "skill india"] },
  { tag: "policy", label: "business policy & economy", kw: ["gst", "budget", "rbi", "msme", "startup", "policy", "regulation", "cabinet", "ministry", "economy", "gdp", "investment", "fdi", "infrastructure"] },
];

// ---------------------------------------------------------------------------
// Minimal RSS parsing (no dependencies)
// ---------------------------------------------------------------------------
function decodeEntities(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ").trim();
}

function pickTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? m[1].trim() : "";
}

function parseRss(xml) {
  const items = [];
  const re = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = re.exec(xml))) {
    const b = m[1];
    let link = decodeEntities(pickTag(b, "link"));
    if (!link) {
      const g = b.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i);
      if (g && /^https?:\/\//i.test(decodeEntities(g[1]))) link = decodeEntities(g[1]);
    }
    items.push({
      title: decodeEntities(pickTag(b, "title")),
      link,
      description: decodeEntities(pickTag(b, "description")).slice(0, 900),
      pubDate: new Date(pickTag(b, "pubDate") || pickTag(b, "dc:date") || 0),
    });
  }
  return items;
}

function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
}

function isTrusted(url) {
  const d = domainOf(url);
  return !!d && TRUSTED_DOMAINS.some((t) => d === t || d.endsWith("." + t));
}

async function fetchFeed(feed) {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 20000);
    const res = await fetch(feed.url, {
      signal: ctl.signal,
      headers: { "user-agent": "Mozilla/5.0 (VaradaNexusBlogBot/1.0)", accept: "application/rss+xml, application/xml, text/xml, */*" },
    });
    clearTimeout(t);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const xml = await res.text();
    const items = parseRss(xml)
      .filter((it) => it.title && it.link && isTrusted(it.link))
      .map((it) => ({ ...it, feedName: feed.name, kind: feed.kind }));
    console.log(`Feed OK  (${items.length} trusted items): ${feed.name}`);
    return items;
  } catch (e) {
    console.warn(`Feed FAIL (${e.message}): ${feed.name} — skipped`);
    return [];
  }
}

function matchSector(item) {
  const text = (item.title + " " + item.description).toLowerCase();
  let best = null, bestScore = 0;
  for (const s of SECTORS) {
    const score = s.kw.reduce((n, k) => n + (text.includes(k) ? 1 : 0), 0);
    if (score > bestScore) { best = s; bestScore = score; }
  }
  return bestScore > 0 ? best : null;
}

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------
const SB_HEADERS = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY,
  "content-type": "application/json",
};

// Owner-controlled settings (blog_settings singleton). Falls back to defaults
// if the v2 migration hasn't been applied yet.
async function loadSettings() {
  const defaults = {
    auto_publish_enabled: true, approved_categories: [],
    min_seo_score: 60, min_quality_score: 60, min_confidence_score: 70,
    posts_per_day: MAX_POSTS,
  };
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/blog_settings?id=eq.1&limit=1`, { headers: SB_HEADERS });
    if (!res.ok) return defaults;
    const rows = await res.json();
    return rows[0] ? { ...defaults, ...rows[0] } : defaults;
  } catch { return defaults; }
}

async function logGeneration(entry) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/blog_generation_logs`, {
      method: "POST", headers: SB_HEADERS,
      body: JSON.stringify({ run_kind: "daily", model: "ai-router", ...entry }),
    });
  } catch { /* logging must never break the run */ }
}

async function saveSource(postId, item) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/blog_sources`, {
      method: "POST", headers: SB_HEADERS,
      body: JSON.stringify({
        post_id: postId, url: item.link, publisher: item.feedName, headline: item.title,
        published_on: item.pubDate.toISOString().slice(0, 10),
        kind: item.kind === "government" ? "government" : "news",
      }),
    });
  } catch { /* optional table */ }
}

async function recentPosts() {
  const since = new Date(Date.now() - 21 * 24 * 3600 * 1000).toISOString();
  const url = `${SUPABASE_URL}/rest/v1/blog_posts?select=title,content&created_at=gte.${since}&limit=200`;
  const res = await fetch(url, { headers: SB_HEADERS });
  if (!res.ok) throw new Error("Supabase read failed " + res.status);
  return res.json();
}

async function insertPost(rec) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/blog_posts`, {
    method: "POST",
    headers: { ...SB_HEADERS, prefer: "return=representation" },
    body: JSON.stringify(rec),
  });
  if (!res.ok) throw new Error("Supabase insert failed " + res.status + ": " + (await res.text()));
  return res.json();
}

// ---------------------------------------------------------------------------
// AI generation (routed through ai-router.mjs)
// ---------------------------------------------------------------------------
async function generatePost(item, sector) {
  // Government news is more important — eligible for quality escalation to a better model.
  const importance = item.kind === "government" ? "high" : "medium";

  const SYSTEM =
    "You are the news editor for Varada Nexus Private Limited, a multi-sector Indian enterprise " +
    "(healthcare infrastructure, mining, logistics, import-export, digital commerce, HR). " +
    "You write short news-analysis posts STRICTLY grounded in the single news item provided. " +
    "HARD RULES: Use ONLY facts present in the provided headline/summary. Do NOT invent statistics, " +
    "quotes, dates, names, or details not in the source. Do NOT fabricate URLs — references are added " +
    "separately by the system. Where the source is thin, analyse implications rather than adding facts. " +
    "Indian English. Professional, useful, not salesy.";

  const USER =
    `News item (published ${item.pubDate.toISOString().slice(0, 10)} by ${item.feedName}):\n` +
    `HEADLINE: ${item.title}\n` +
    `SUMMARY: ${item.description || "(no summary provided)"}\n\n` +
    `Write a 350-550 word blog post covering: (1) what happened, (2) why it matters for the ` +
    `${sector.label} sector in India, (3) practical implications for enterprises operating in this space. ` +
    "Return ONLY strict JSON with keys: " +
    "title (<=70 chars, not identical to the headline), " +
    "excerpt (1 sentence <=160 chars), " +
    "tags (array of 3-5 short strings), " +
    "content_html (valid HTML using <p>,<h2>,<h3>,<ul>/<li> only; no <h1>, no links, no inline styles), " +
    "meta_title (<=60 chars, SEO-optimised), " +
    "meta_description (<=155 chars, SEO-optimised), " +
    "category (exactly one of: healthcare, ems, artificial-intelligence, business, startups, cybersecurity, " +
    "saas, software-development, web-development, cloud-computing, digital-transformation, marketing, seo, " +
    "finance, education, global-news, technology, automation, logistics, mining, import-export, ecommerce, " +
    "hr, interior-design, arbitrage), " +
    "linkedin_post_text (a 2-4 sentence LinkedIn post announcing this article, professional tone, no hashtag spam, max 3 hashtags), " +
    "featured_image_prompt (one sentence describing an ideal cover image), " +
    "alt_text (<=110 chars describing that image), " +
    "seo_score (0-100 your honest rating of this post's SEO strength), " +
    "quality_score (0-100 honest rating of writing quality and usefulness), " +
    "confidence_score (0-100 how confident you are that every claim is supported by the provided source).";

  return callAI({ task: "article_writing", system: SYSTEM, user: USER, importance, runKind: "daily" });
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function referencesHtml(item) {
  // The reference link comes straight from the trusted feed — never from the AI.
  const officialNote = item.kind === "government" ? " (official Government of India source)" : "";
  return (
    `<h3>References</h3><ul class="post-references">` +
    `<li><a href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer">` +
    `${escapeHtml(item.title)}</a> — ${escapeHtml(item.feedName)}${officialNote}, ` +
    `${item.pubDate.toISOString().slice(0, 10)}</li></ul>`
  );
}

function slugify(s) {
  return String(s).toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);
}

function normTitle(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
(async () => {
  // 0) Owner settings (auto-publish switch, thresholds, approved categories)
  const settings = await loadSettings();
  const maxPosts = Math.min(settings.posts_per_day ?? MAX_POSTS, MAX_POSTS === 6 ? 10 : MAX_POSTS) || MAX_POSTS;
  if (settings.posts_per_day === 0) { console.log("posts_per_day is 0 in blog_settings — nothing to do."); return; }
  console.log(`Settings: auto_publish=${settings.auto_publish_enabled}, posts/day=${maxPosts}, ` +
    `min scores seo=${settings.min_seo_score} quality=${settings.min_quality_score} confidence=${settings.min_confidence_score}` +
    (settings.approved_categories?.length ? `, approved=[${settings.approved_categories}]` : ", approved=all"));

  // 1) Gather trusted, fresh, sector-relevant news
  const all = (await Promise.all(FEEDS.map(fetchFeed))).flat();
  const cutoff = Date.now() - FRESH_HOURS * 3600 * 1000;
  const fresh = all.filter((it) => it.pubDate.getTime() > cutoff || isNaN(it.pubDate.getTime()));

  const candidates = [];
  for (const it of fresh) {
    const sector = matchSector(it);
    if (sector) candidates.push({ item: it, sector });
  }
  console.log(`Feeds: ${all.length} items, ${fresh.length} fresh, ${candidates.length} sector-relevant.`);
  if (!candidates.length) { console.log("No relevant trusted news today — nothing posted."); return; }

  // 2) Dedupe against recent posts (by source link + similar title words)
  const recent = await recentPosts();
  const usedLinks = new Set();
  const usedTitles = recent.map((p) => normTitle(p.title));
  for (const p of recent) for (const m of String(p.content).matchAll(/href="([^"]+)"/g)) usedLinks.add(m[1]);

  const seenLinks = new Set();
  const dedup = candidates.filter(({ item }) => {
    if (usedLinks.has(item.link) || seenLinks.has(item.link)) return false;
    seenLinks.add(item.link);
    const nt = normTitle(item.title);
    return !usedTitles.some((t) => t && (t.includes(nt) || nt.includes(t)));
  });

  // 3) Rank: government first, then recency; cap 2 posts per sector, ensure variety
  dedup.sort((x, y) =>
    (y.item.kind === "government") - (x.item.kind === "government") ||
    y.item.pubDate - x.item.pubDate
  );
  const perSector = {};
  const picks = [];
  for (const c of dedup) {
    if (picks.length >= maxPosts) break;
    const n = perSector[c.sector.tag] || 0;
    if (n >= 2) continue;
    perSector[c.sector.tag] = n + 1;
    picks.push(c);
  }
  console.log(`Selected ${picks.length} stories:`);
  picks.forEach((c) => console.log(`  [${c.item.kind}/${c.sector.tag}] ${c.item.title}`));

  // 4) Generate; publish or hold for review per owner settings
  let published = 0;
  for (const { item, sector } of picks) {
    try {
      const post = await generatePost(item, sector);
      if (!post.title || !post.content_html) throw new Error("incomplete AI post");
      // Strip any links the AI produced despite instructions; ours are appended below.
      const body = String(post.content_html).replace(/<a\b[^>]*>/gi, "").replace(/<\/a>/gi, "");
      const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");

      // --- Owner-control review gate ---
      const seo = Number(post.seo_score) || 0;
      const quality = Number(post.quality_score) || 0;
      const confidence = Number(post.confidence_score) || 0;
      const category = String(post.category || sector.tag);
      const reasons = [];
      if (!settings.auto_publish_enabled) reasons.push("auto-publish disabled");
      if (settings.approved_categories?.length && !settings.approved_categories.includes(category))
        reasons.push(`category '${category}' not in approved list`);
      if (seo < settings.min_seo_score) reasons.push(`seo ${seo} < ${settings.min_seo_score}`);
      if (quality < settings.min_quality_score) reasons.push(`quality ${quality} < ${settings.min_quality_score}`);
      if (confidence < settings.min_confidence_score) reasons.push(`confidence ${confidence} < ${settings.min_confidence_score}`);
      const publishNow = reasons.length === 0;

      const rec = {
        title: String(post.title).slice(0, 120),
        slug: slugify(post.title) + "-" + datePart,
        excerpt: post.excerpt || null,
        content: body + referencesHtml(item),
        tags: [...new Set([...(Array.isArray(post.tags) ? post.tags : []), sector.tag, "news"])].slice(0, 6),
        author: "Varada Nexus",
        status: publishNow ? "auto_published" : "needs_review",
        source: "ai",
        published_at: publishNow ? new Date().toISOString() : null,
        // v2 metadata (present after the Sprint 18B migration)
        primary_category: category,
        sector: sector.tag,
        region: "India",
        content_type: "trending_news",
        meta_title: post.meta_title ? String(post.meta_title).slice(0, 70) : null,
        meta_description: post.meta_description ? String(post.meta_description).slice(0, 160) : null,
        source_urls: [item.link],
        source_dates: [item.pubDate.toISOString().slice(0, 10)],
        seo_score: seo || null,
        quality_score: quality || null,
        confidence_score: confidence || null,
        featured_image_prompt: post.featured_image_prompt || null,
        alt_text: post.alt_text || null,
        linkedin_post_text: post.linkedin_post_text || null,
        is_auto_published: publishNow,
        is_backdated: false,
      };
      let saved;
      try {
        saved = await insertPost(rec);
      } catch (e) {
        // Fallback for pre-migration schema: retain original column set only.
        if (!/column/i.test(String(e.message))) throw e;
        const legacy = { title: rec.title, slug: rec.slug, excerpt: rec.excerpt, content: rec.content,
          tags: rec.tags, author: rec.author, status: publishNow ? "published" : "draft",
          source: "ai", published_at: rec.published_at };
        saved = await insertPost(legacy);
      }
      const postId = Array.isArray(saved) ? saved[0]?.id : saved?.id;
      if (postId) await saveSource(postId, item);
      await logGeneration({
        post_id: postId || null,
        status: publishNow ? "published" : "needs_review",
        detail: publishNow ? `auto-published (seo=${seo}, quality=${quality}, confidence=${confidence})`
                           : `held for review: ${reasons.join("; ")}`,
      });
      if (publishNow) { published++; console.log(`Published: ${rec.title} -> /blog/post.html?slug=${rec.slug}`); }
      else console.log(`Needs review (${reasons.join("; ")}): ${rec.title}`);
    } catch (e) {
      console.warn(`Skipped one story (${e.message}): ${item.title}`);
      await logGeneration({ status: "failed", detail: `${e.message}: ${item.title}` });
    }
    await sleep(15000); // stay well inside Gemini free-tier rate limits
  }
  console.log(`Done. ${published}/${picks.length} posts auto-published (rest held for review or skipped).`);
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
