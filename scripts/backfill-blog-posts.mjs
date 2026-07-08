// One-time backdated blog backfill for Varada Nexus.
//
// Generates historical posts from the start of the financial year (default
// April 1) up to today, spread realistically across the range (never bunched
// on one day). Two honest content modes:
//   1. EVERGREEN  — timeless articles (how-to, comparison, FAQ, opinion,
//      evergreen). Backdating allowed; the AI is instructed to write timeless
//      content and never mention specific dates/events.
//   2. NEWS       — grounded in REAL articles that were actually published
//      around that date, found via the free GDELT 2.0 DOC API and restricted
//      to trusted domains. Original source URL + publication date stored.
//      If no real article is found for a date, that slot falls back to evergreen.
//
// Job sources (priority order):
//   a. Env inputs (from workflow_dispatch): DATE_FROM, DATE_TO, POST_COUNT,
//      CATEGORIES (csv of slugs), PUBLISH_MODE (draft|publish)
//   b. Queued rows in blog_backfill_jobs (created from the Blog Console)
//
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY

const {
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY,
  AI_MODEL, DATE_FROM, DATE_TO, POST_COUNT, CATEGORIES, PUBLISH_MODE,
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !GEMINI_API_KEY) {
  console.error("Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or GEMINI_API_KEY");
  process.exit(1);
}
const MODEL = AI_MODEL || "gemini-2.5-flash";

const TRUSTED_DOMAINS = [
  "pib.gov.in", "rbi.org.in", "gov.in", "nic.in",
  "economictimes.indiatimes.com", "business-standard.com",
  "livemint.com", "thehindubusinessline.com",
];

const ALL_CATEGORIES = ["healthcare","ems","artificial-intelligence","business","startups",
  "cybersecurity","saas","software-development","web-development","cloud-computing",
  "digital-transformation","marketing","seo","finance","education","global-news",
  "technology","automation","logistics","mining","import-export","ecommerce","hr",
  "interior-design","arbitrage"];

// Timeless topic bank per category (used for evergreen slots).
const EVERGREEN = {
  "healthcare": ["How to plan hospital infrastructure projects that finish on time","Key quality standards every Indian hospital build must meet","Choosing between greenfield and brownfield hospital projects","A practical guide to hospital equipment procurement"],
  "ems": ["What an enterprise management system actually is — and when you need one","Signs your business has outgrown spreadsheets","How multi-sector companies keep operations visible in one system"],
  "artificial-intelligence": ["A realistic guide to adopting AI in a mid-size Indian enterprise","AI automation vs human judgement: where to draw the line","How to evaluate AI vendors without getting burned"],
  "business": ["How multi-sector enterprises allocate capital between divisions","Building execution discipline: from decision to delivery","Vendor negotiation fundamentals for growing companies"],
  "startups": ["What founders should know before their first government tender","Bootstrapping vs raising: an honest comparison for Indian startups","How startups should structure their first ops team"],
  "cybersecurity": ["Security basics every small enterprise ignores at its peril","How to run a simple security audit without a big budget","Phishing, invoice fraud and the threats Indian SMEs actually face"],
  "saas": ["Build vs buy: choosing business software honestly","How to evaluate SaaS pricing before you commit","Migrating off legacy software without breaking operations"],
  "software-development": ["How non-technical founders should manage software projects","Why most internal tools fail — and how to scope them right","A plain-language guide to software maintenance costs"],
  "web-development": ["What a business website actually needs in 2026","Page speed, hosting and the basics of a fast site","Common website mistakes that cost businesses leads"],
  "cloud-computing": ["Cloud cost control: a practical guide for Indian enterprises","When on-premise still makes sense","How to plan a low-risk cloud migration"],
  "digital-transformation": ["Digitising a traditional business: where to start","Why digital transformation projects stall — and the fix","Paper to platform: digitising field operations"],
  "marketing": ["Marketing fundamentals for B2B service companies","How to build a content engine without a big team","Measuring marketing ROI honestly"],
  "seo": ["SEO fundamentals for business websites: a practical checklist","How content freshness and consistency affect rankings","Local SEO for service businesses in India"],
  "finance": ["Working capital management for multi-division companies","A practical guide to GST compliance discipline","How enterprises should evaluate debt vs internal accruals"],
  "education": ["Building skill pipelines: how enterprises grow their own talent","On-the-job training programmes that actually work"],
  "global-news": ["How global supply chain shifts affect Indian enterprises","What global interest rate cycles mean for Indian business"],
  "technology": ["Technology refresh cycles: when to upgrade and when to wait","How to build a pragmatic technology roadmap"],
  "automation": ["Which business processes to automate first","Workflow automation: quick wins for operations teams"],
  "logistics": ["Fleet utilisation: getting more from the trucks you have","Reducing freight damage and pilferage: practical controls","Route planning fundamentals for commodity transport"],
  "mining": ["Mining compliance in India: the approvals that matter","How mineral logistics differ from general freight","Safety systems every mining operation needs","Planning quarry-to-plant transport efficiently"],
  "import-export": ["Getting started with import-export: licences and registrations","Understanding customs duty structures: a practical primer","How to vet overseas buyers and suppliers","Incoterms explained for Indian traders"],
  "ecommerce": ["Marketplace vs own storefront: an honest comparison","E-commerce logistics: delivery promises you can keep","Reducing returns: practical steps for online sellers","Pricing strategy fundamentals for online retail"],
  "hr": ["Structuring an ops team for a multi-sector company","Hiring for execution roles: what actually predicts performance","Building a PR function on a small budget","Employee retention beyond salary: what works"],
  "interior-design": ["Commercial interior design: planning before aesthetics","Healthcare interiors: designing for hygiene and flow","Choosing materials that survive commercial use","Office fit-outs: budgeting and phasing done right"],
  "arbitrage": ["What strategic arbitrage actually means in business","Regulatory strategy: turning compliance into advantage","Financial modelling basics for deal evaluation","Market positioning: finding gaps competitors ignore"],
};

const SB = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY,
  "content-type": "application/json",
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slugify = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);
const escapeHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const domainOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };
const isTrusted = (u) => { const d = domainOf(u); return !!d && TRUSTED_DOMAINS.some((t) => d === t || d.endsWith("." + t)); };

async function sbGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: SB });
  if (!r.ok) throw new Error(`Supabase GET ${path} -> ${r.status}`);
  return r.json();
}
async function sbPost(path, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "POST", headers: { ...SB, prefer: "return=representation" }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Supabase POST ${path} -> ${r.status}: ${await r.text()}`);
  return r.json();
}
async function sbPatch(path, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method: "PATCH", headers: SB, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`Supabase PATCH ${path} -> ${r.status}`);
}
async function logGen(entry) {
  try { await sbPost("blog_generation_logs", { run_kind: "backfill", model: MODEL, ...entry }); } catch {}
}

// --- GDELT: real articles that existed around a given date (free API) -------
async function gdeltArticle(dateISO, category) {
  const kw = {
    "healthcare": "india hospital healthcare", "mining": "india mining minerals",
    "logistics": "india logistics freight", "finance": "india economy finance",
    "artificial-intelligence": "india artificial intelligence", "cybersecurity": "india cybersecurity",
    "startups": "india startup funding", "ecommerce": "india ecommerce", "global-news": "global economy trade",
  }[category] || `india business ${category.replace(/-/g, " ")}`;
  const d = dateISO.replace(/-/g, "");
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(kw)}` +
    `&mode=artlist&maxrecords=40&format=json&startdatetime=${d}000000&enddatetime=${d}235959`;
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
    const r = await fetch(url, { signal: ctl.signal, headers: { "user-agent": "VaradaNexusBlogBot/1.0" } });
    clearTimeout(t);
    if (!r.ok) return null;
    const data = await r.json();
    const arts = (data.articles || []).filter((a) => a.url && a.title && isTrusted(a.url));
    if (!arts.length) return null;
    const a = arts[0];
    return { title: a.title, url: a.url, publisher: domainOf(a.url), seendate: a.seendate };
  } catch { return null; }
}

// --- Gemini ------------------------------------------------------------------
async function gemini(system, user) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { temperature: 0.6, maxOutputTokens: 8192, responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 } },
    }),
  });
  if (!r.ok) throw new Error("Gemini " + r.status + ": " + (await r.text()).slice(0, 300));
  const data = await r.json();
  const text = ((data.candidates?.[0]?.content?.parts) || []).map((p) => p.text || "").join("");
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a === -1 || b === -1) throw new Error("no JSON from AI");
  return JSON.parse(text.slice(a, b + 1));
}

const JSON_SHAPE =
  "Return ONLY strict JSON with keys: title (<=70 chars), excerpt (<=160 chars), " +
  "tags (3-5 short strings), content_html (HTML with <p>,<h2>,<h3>,<ul>/<li> only; no <h1>, no links), " +
  "meta_title (<=60 chars), meta_description (<=155 chars), " +
  "linkedin_post_text (2-4 sentences, max 3 hashtags), featured_image_prompt (1 sentence), alt_text (<=110 chars), " +
  "seo_score (0-100), quality_score (0-100), confidence_score (0-100).";

async function evergreenPost(category, topic) {
  const system =
    "You are the content editor for Varada Nexus Private Limited, a multi-sector Indian enterprise. " +
    "Write a TIMELESS evergreen article. HARD RULES: no references to 'this year', 'recently', current " +
    "events, specific dates, or news. No invented statistics or fake case studies. Practical, useful, Indian English.";
  const user = `Write a 500-800 word evergreen blog article on: "${topic}" (category: ${category}). ${JSON_SHAPE}`;
  return gemini(system, user);
}

async function newsPost(category, art, dateISO) {
  const system =
    "You are the news editor for Varada Nexus Private Limited, a multi-sector Indian enterprise. " +
    "Write an analysis post STRICTLY grounded in the single real news item provided (it was genuinely " +
    "published on the stated date). HARD RULES: use only facts in the provided headline; do not invent " +
    "details, statistics or quotes; do not fabricate URLs; write as analysis of that development. Indian English.";
  const user =
    `Real news item published ${dateISO} by ${art.publisher}:\nHEADLINE: ${art.title}\n\n` +
    `Write a 350-550 word analysis: what happened, why it mattered for the ${category} space in India, ` +
    `and practical implications. ${JSON_SHAPE}`;
  return gemini(system, user);
}

// --- date spreading -----------------------------------------------------------
function spreadDates(fromISO, toISO, n) {
  const from = new Date(fromISO + "T00:00:00Z").getTime();
  const to = Math.min(new Date(toISO + "T00:00:00Z").getTime(), Date.now() - 24 * 3600 * 1000);
  const days = Math.max(1, Math.floor((to - from) / 86400000));
  const perDay = {};
  const out = [];
  let guard = 0;
  while (out.length < n && guard++ < n * 50) {
    const day = Math.floor(Math.random() * (days + 1));
    const key = String(day);
    if ((perDay[key] || 0) >= 2) continue; // never bunch: max 2 posts on any day
    perDay[key] = (perDay[key] || 0) + 1;
    const d = new Date(from + day * 86400000);
    d.setUTCHours(3 + Math.floor(Math.random() * 12), Math.floor(Math.random() * 60), 0, 0); // 08:30–20:30 IST
    out.push(d);
  }
  return out.sort((a, b) => a - b);
}

// --- job runner ----------------------------------------------------------------
async function runJob(job) {
  const cats = (job.categories && job.categories.length ? job.categories : ALL_CATEGORIES)
    .filter((c) => ALL_CATEGORIES.includes(c));
  const dates = spreadDates(job.date_from, job.date_to, job.post_count);
  const publish = job.publish_mode === "publish";
  console.log(`Backfill: ${dates.length} posts, ${job.date_from} → ${job.date_to}, mode=${job.publish_mode}, categories=${cats.length}`);

  const existing = await sbGet("blog_posts?select=title&limit=1000&order=created_at.desc");
  const usedTitles = new Set(existing.map((p) => slugify(p.title)));

  let done = 0, failed = 0;
  const usedTopics = new Set();
  for (let i = 0; i < dates.length; i++) {
    const when = dates[i];
    const dateISO = when.toISOString().slice(0, 10);
    const category = cats[i % cats.length];
    // ~1 in 3 slots try to be a real dated news analysis; fall back to evergreen.
    const wantNews = i % 3 === 0;
    try {
      let post, contentType, sourceUrl = null, sourceDate = null, refs = "", art = null;
      if (wantNews && (art = await gdeltArticle(dateISO, category))) {
        post = await newsPost(category, art, dateISO);
        contentType = "trending_news"; sourceUrl = art.url; sourceDate = dateISO;
        refs = `<h3>References</h3><ul class="post-references"><li><a href="${escapeHtml(art.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(art.title)}</a> — ${escapeHtml(art.publisher)}, ${dateISO}</li></ul>`;
      } else {
        const bank = EVERGREEN[category] || EVERGREEN["business"];
        const topic = bank.find((t) => !usedTopics.has(t)) || bank[i % bank.length];
        usedTopics.add(topic);
        post = await evergreenPost(category, topic);
        contentType = ["evergreen", "how_to", "faq", "comparison", "opinion"][i % 5];
      }
      if (!post.title || !post.content_html) throw new Error("incomplete AI post");
      if (usedTitles.has(slugify(post.title))) throw new Error("duplicate title");
      usedTitles.add(slugify(post.title));

      const body = String(post.content_html).replace(/<a\b[^>]*>/gi, "").replace(/<\/a>/gi, "");
      const rec = {
        title: String(post.title).slice(0, 120),
        slug: slugify(post.title) + "-" + dateISO.replace(/-/g, ""),
        excerpt: post.excerpt || null,
        content: body + refs,
        tags: Array.isArray(post.tags) ? post.tags.slice(0, 5) : [],
        author: "Varada Nexus",
        status: publish ? "backdated" : "draft",
        source: "ai",
        published_at: when.toISOString(),
        primary_category: category,
        sector: category,
        region: "India",
        content_type: contentType,
        meta_title: post.meta_title ? String(post.meta_title).slice(0, 70) : null,
        meta_description: post.meta_description ? String(post.meta_description).slice(0, 160) : null,
        source_urls: sourceUrl ? [sourceUrl] : [],
        source_dates: sourceDate ? [sourceDate] : [],
        seo_score: Number(post.seo_score) || null,
        quality_score: Number(post.quality_score) || null,
        confidence_score: Number(post.confidence_score) || null,
        featured_image_prompt: post.featured_image_prompt || null,
        alt_text: post.alt_text || null,
        linkedin_post_text: post.linkedin_post_text || null,
        is_backdated: true,
        is_auto_published: false,
      };
      const saved = await sbPost("blog_posts", rec);
      const postId = Array.isArray(saved) ? saved[0]?.id : saved?.id;
      if (postId && sourceUrl) {
        await sbPost("blog_sources", { post_id: postId, url: sourceUrl, publisher: art.publisher, headline: art.title, published_on: sourceDate, kind: "news" }).catch(() => {});
      }
      await logGen({ post_id: postId || null, status: publish ? "published" : "draft", detail: `backdated ${dateISO} [${contentType}/${category}]` });
      done++;
      console.log(`  [${i + 1}/${dates.length}] ${dateISO} ${contentType}/${category}: ${rec.title}`);
    } catch (e) {
      failed++;
      console.warn(`  [${i + 1}/${dates.length}] FAILED (${e.message})`);
      await logGen({ status: "failed", detail: `backfill ${dateISO}/${category}: ${e.message}` });
    }
    // Live progress visible in the Blog Console jobs list.
    if (job.id && (i % 3 === 2 || i === dates.length - 1)) {
      await sbPatch(`blog_backfill_jobs?id=eq.${job.id}`, {
        detail: `progress: ${done + failed}/${dates.length} processed (${done} created, ${failed} failed)`,
      }).catch(() => {});
    }
    await sleep(12000); // Gemini free-tier pacing
  }
  return { done, failed };
}

// --- main ----------------------------------------------------------------------
(async () => {
  // Financial-year default range
  const now = new Date();
  let fyStartMonth = 4;
  try { const s = await sbGet("blog_settings?id=eq.1&limit=1"); if (s[0]?.fy_start_month) fyStartMonth = s[0].fy_start_month; } catch {}
  const fyYear = now.getUTCMonth() + 1 >= fyStartMonth ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const fyStart = `${fyYear}-${String(fyStartMonth).padStart(2, "0")}-01`;
  const today = now.toISOString().slice(0, 10);

  let jobs = [];
  if (DATE_FROM || POST_COUNT) {
    jobs = [{
      id: null,
      date_from: DATE_FROM || fyStart,
      date_to: DATE_TO || today,
      post_count: Math.min(Math.max(parseInt(POST_COUNT || "30", 10) || 30, 1), 200),
      categories: (CATEGORIES || "").split(",").map((s) => s.trim()).filter(Boolean),
      publish_mode: PUBLISH_MODE === "publish" ? "publish" : "draft",
    }];
    console.log("Running from workflow inputs.");
  } else {
    jobs = await sbGet("blog_backfill_jobs?status=eq.queued&order=created_at.asc&limit=3");
    if (!jobs.length) { console.log("No queued backfill jobs. Nothing to do."); return; }
    console.log(`Found ${jobs.length} queued job(s).`);
  }

  for (const job of jobs) {
    if (job.id) await sbPatch(`blog_backfill_jobs?id=eq.${job.id}`, { status: "running", started_at: new Date().toISOString() });
    try {
      const { done, failed } = await runJob(job);
      if (job.id) await sbPatch(`blog_backfill_jobs?id=eq.${job.id}`, {
        status: "completed", finished_at: new Date().toISOString(),
        detail: `${done} created, ${failed} failed`,
      });
      console.log(`Job complete: ${done} created, ${failed} failed.`);
    } catch (e) {
      if (job.id) await sbPatch(`blog_backfill_jobs?id=eq.${job.id}`, { status: "failed", finished_at: new Date().toISOString(), detail: String(e.message).slice(0, 500) });
      console.error("Job failed:", e.message);
    }
  }
})().catch((e) => { console.error(e.message || e); process.exit(1); });
