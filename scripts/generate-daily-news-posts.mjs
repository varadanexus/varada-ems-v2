// Daily news-driven AI blog generator for Varada Nexus.
// Pulls REAL headlines from trusted, free RSS feeds (Government of India press
// releases + top Indian business press), matches them to the sectors Varada
// Nexus operates in, and generates up to POSTS_PER_DAY grounded analysis posts.
// Every post carries a "References" section with the genuine source links —
// links are taken directly from the feeds, never invented by the AI.
//
// Runs free: GitHub Actions (scheduler) + public RSS feeds + Gemini free tier.
//
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY
// Optional env: AI_MODEL (default gemini-2.5-flash), POSTS_PER_DAY (default 5)

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  GEMINI_API_KEY,
  AI_MODEL,
  POSTS_PER_DAY,
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!GEMINI_API_KEY) {
  console.error("Missing GEMINI_API_KEY");
  process.exit(1);
}

const MAX_POSTS = Math.min(Math.max(parseInt(POSTS_PER_DAY || "5", 10) || 5, 1), 6);
const MODEL = AI_MODEL || "gemini-2.5-flash";
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
// Gemini (free tier)
// ---------------------------------------------------------------------------
async function generatePost(item, sector) {
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
    "Return ONLY strict JSON with keys: title (<=70 chars, not identical to the headline), " +
    "excerpt (1 sentence <=160 chars), tags (array of 3-5 short strings), " +
    "content_html (valid HTML using <p>,<h2>,<h3>,<ul>/<li> only; no <h1>, no links, no inline styles).";

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: USER }] }],
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    }
  );
  if (!res.ok) throw new Error("Gemini error " + res.status + ": " + (await res.text()));
  const data = await res.json();
  const text = ((data.candidates?.[0]?.content?.parts) || []).map((p) => p.text || "").join("");
  if (!text) throw new Error("Gemini returned no text");
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a === -1 || b === -1) throw new Error("No JSON in AI response");
  return JSON.parse(text.slice(a, b + 1));
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
    if (picks.length >= MAX_POSTS) break;
    const n = perSector[c.sector.tag] || 0;
    if (n >= 2) continue;
    perSector[c.sector.tag] = n + 1;
    picks.push(c);
  }
  console.log(`Selected ${picks.length} stories:`);
  picks.forEach((c) => console.log(`  [${c.item.kind}/${c.sector.tag}] ${c.item.title}`));

  // 4) Generate and publish
  let published = 0;
  for (const { item, sector } of picks) {
    try {
      const post = await generatePost(item, sector);
      if (!post.title || !post.content_html) throw new Error("incomplete AI post");
      // Strip any links the AI produced despite instructions; ours are appended below.
      const body = String(post.content_html).replace(/<a\b[^>]*>/gi, "").replace(/<\/a>/gi, "");
      const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const rec = {
        title: String(post.title).slice(0, 120),
        slug: slugify(post.title) + "-" + datePart,
        excerpt: post.excerpt || null,
        content: body + referencesHtml(item),
        tags: [...new Set([...(Array.isArray(post.tags) ? post.tags : []), sector.tag, "news"])].slice(0, 6),
        author: "Varada Nexus",
        status: "published",
        source: "ai",
        published_at: new Date().toISOString(),
      };
      await insertPost(rec);
      published++;
      console.log(`Published: ${rec.title} -> /blog/post.html?slug=${rec.slug}`);
    } catch (e) {
      console.warn(`Skipped one story (${e.message}): ${item.title}`);
    }
    await sleep(15000); // stay well inside Gemini free-tier rate limits
  }
  console.log(`Done. ${published}/${picks.length} posts published.`);
  if (!published) process.exit(1);
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
