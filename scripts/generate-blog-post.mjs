// Weekly AI blog-post generator for Varada Nexus.
// Generates one industry-insight post and inserts it into Supabase (blog_posts)
// as a published, source='ai' row. Runs from GitHub Actions on a schedule.
//
// Provider is swappable via env AI_PROVIDER = "gemini" | "anthropic" | "openai".
// "gemini" uses Google's permanent FREE tier (Gemini 2.5 Flash) — recommended.
// Required env:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   AI_PROVIDER (default "gemini")
//   GEMINI_API_KEY (if gemini) | ANTHROPIC_API_KEY (if anthropic) | OPENAI_API_KEY (if openai)
// Optional env: AI_MODEL

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  AI_PROVIDER = "gemini",
  GEMINI_API_KEY,
  ANTHROPIC_API_KEY,
  OPENAI_API_KEY,
  AI_MODEL,
} = process.env;

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
  "HR, workforce structuring, and organizational systems",
  "strategic arbitrage and deal structuring",
  "multi-sector enterprise execution and operations",
];
// rotate topic by ISO week so posts vary week to week
const week = Math.floor(Date.now() / (7 * 24 * 3600 * 1000));
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
  "no <html>/<head>/<body>, no inline styles, no <h1>). No markdown, no code fences.";

async function callAnthropic() {
  const model = AI_MODEL || "claude-3-5-sonnet-latest";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      system: SYSTEM,
      messages: [{ role: "user", content: USER }],
    }),
  });
  if (!res.ok) throw new Error("Anthropic error " + res.status + ": " + (await res.text()));
  const data = await res.json();
  return data.content.map((c) => c.text || "").join("");
}

async function callGemini() {
  const model = AI_MODEL || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: USER }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 }, // disable "thinking" so tokens go to the answer
      },
    }),
  });
  if (!res.ok) throw new Error("Gemini error " + res.status + ": " + (await res.text()));
  const data = await res.json();
  const cand = data.candidates && data.candidates[0];
  const parts = cand && cand.content && cand.content.parts;
  const text = (parts || []).map((p) => p.text || "").join("");
  if (!text) {
    throw new Error(
      "Gemini returned no text (finishReason=" + (cand && cand.finishReason) + "). " +
      "Response: " + JSON.stringify(data).slice(0, 500)
    );
  }
  return text;
}

async function callOpenAI() {
  const model = AI_MODEL || "gpt-4o-mini";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { authorization: "Bearer " + OPENAI_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: USER },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error("OpenAI error " + res.status + ": " + (await res.text()));
  const data = await res.json();
  return data.choices[0].message.content;
}

function extractJSON(text) {
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a === -1 || b === -1) throw new Error("No JSON in AI response");
  return JSON.parse(text.slice(a, b + 1));
}

function slugify(s) {
  return String(s).toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);
}

async function insertPost(rec) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/blog_posts`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY,
      "content-type": "application/json",
      prefer: "return=representation",
    },
    body: JSON.stringify(rec),
  });
  if (!res.ok) throw new Error("Supabase insert failed " + res.status + ": " + (await res.text()));
  return res.json();
}

(async () => {
  const raw =
    AI_PROVIDER === "openai" ? await callOpenAI()
    : AI_PROVIDER === "anthropic" ? await callAnthropic()
    : await callGemini();
  const post = extractJSON(raw);
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rec = {
    title: post.title,
    slug: slugify(post.title) + "-" + datePart,
    excerpt: post.excerpt || null,
    content: post.content_html || "",
    tags: Array.isArray(post.tags) ? post.tags : [],
    author: "Varada Nexus",
    status: "published",
    source: "ai",
    published_at: new Date().toISOString(),
  };
  if (!rec.title || !rec.content) throw new Error("AI returned an incomplete post");
  const saved = await insertPost(rec);
  console.log("Published:", rec.title, "->", "/blog/post.html?slug=" + rec.slug);
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
