// scripts/ai-router.mjs
// Varada Nexus — AI Provider Router
//
// Single entry point for all AI generation in the Varada Nexus blog pipeline.
// Handles: provider selection by priority, task-based model tier assignment,
// monthly budget enforcement, per-minute retry with backoff, automatic provider
// fallback, quality-based escalation, and per-call cost logging to Supabase.
//
// Supported providers (enable by setting the corresponding env key):
//   OPENROUTER_API_KEY  → OpenRouter  (priority 1, default)
//   GEMINI_API_KEY      → Gemini Direct (priority 2)
//   OPENAI_API_KEY      → OpenAI       (priority 3)
//   ANTHROPIC_API_KEY   → Anthropic    (priority 4)
//
// Provider priority and model overrides are also configurable via the
// ai_router_settings table (managed from the Blog Console → AI Costs page).
//
// Export surface:
//   callAI(options)   → Object   parsed JSON from the AI
//   loadBudget()      → Object   current spend vs monthly budget
//   loadSettings()    → Object   ai_router_settings row
//   RUN_ID            → string   8-char hex grouping this process run's logs

import { randomBytes } from "crypto";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const {
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
  OPENROUTER_API_KEY, OPENROUTER_MODEL,
  GEMINI_API_KEY,     AI_MODEL,
  OPENAI_API_KEY,
  ANTHROPIC_API_KEY,
} = process.env;

/** Unique 8-char ID for this process invocation — groups cost log rows. */
export const RUN_ID = randomBytes(4).toString("hex");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Provider registry
// Each entry declares three model tiers and per-1K-token USD rates.
// Rates marked [0,0] are free-tier; tokens are still tracked for visibility.
// ---------------------------------------------------------------------------
const PROVIDER_DEFS = {
  openrouter: {
    name: "OpenRouter",
    enabled() { return !!OPENROUTER_API_KEY; },
    models: {
      cheap:   "google/gemini-2.0-flash-lite:free",
      medium:  OPENROUTER_MODEL || "google/gemini-2.5-flash",
      premium: "anthropic/claude-sonnet-4-6",
    },
    // [input per 1K tokens, output per 1K tokens] USD
    rates: {
      "google/gemini-2.0-flash-lite:free": [0, 0],
      "google/gemini-2.5-flash":           [0.00030, 0.00125],
      "anthropic/claude-sonnet-4-6":       [0.00300, 0.01500],
      "meta-llama/llama-3.3-70b-instruct:free": [0, 0],
    },
    defaultRate: [0.00030, 0.00125],
  },
  gemini_direct: {
    name: "Gemini Direct",
    enabled() { return !!GEMINI_API_KEY; },
    models: {
      cheap:   "gemini-2.0-flash-lite",
      medium:  AI_MODEL || "gemini-2.5-flash",
      premium: "gemini-2.5-pro",
    },
    rates: {
      "gemini-2.0-flash-lite": [0, 0],      // free tier
      "gemini-2.5-flash":      [0, 0],      // free tier
      "gemini-2.5-pro":        [0.00125, 0.01000],
    },
    defaultRate: [0, 0],
  },
  openai: {
    name: "OpenAI",
    enabled() { return !!OPENAI_API_KEY; },
    models: {
      cheap:   "gpt-4o-mini",
      medium:  "gpt-4o-mini",
      premium: "gpt-4o",
    },
    rates: {
      "gpt-4o-mini": [0.00015, 0.00060],
      "gpt-4o":      [0.00250, 0.01000],
    },
    defaultRate: [0.00015, 0.00060],
  },
  anthropic: {
    name: "Anthropic",
    enabled() { return !!ANTHROPIC_API_KEY; },
    models: {
      cheap:   "claude-haiku-4-5-20251001",
      medium:  "claude-haiku-4-5-20251001",
      premium: "claude-sonnet-5",
    },
    rates: {
      "claude-haiku-4-5-20251001": [0.00025, 0.00125],
      "claude-sonnet-5":           [0.00300, 0.01500],
    },
    defaultRate: [0.00025, 0.00125],
  },
};

const DEFAULT_PRIORITY = ["openrouter", "gemini_direct", "openai", "anthropic"];

// ---------------------------------------------------------------------------
// Task → tier mapping
// article_writing tier is further refined by the `importance` parameter.
// ---------------------------------------------------------------------------
const TASK_TIERS = {
  trend_detection:        "cheap",
  research:               "cheap",
  seo_optimization:       "cheap",
  keyword_extraction:     "cheap",
  meta_description:       "cheap",
  faq_generation:         "cheap",
  content_classification: "cheap",
  outline_creation:       "medium",
  article_writing:        "medium",   // overridden by importance below
};

const IMPORTANCE_TIERS = { low: "cheap", medium: "medium", high: "premium" };

// Approx token counts [input, output] used for budget pre-estimation.
const TIER_TOKEN_ESTIMATES = {
  cheap:   [600,  500],
  medium:  [800,  1600],
  premium: [900,  2200],
};

// ---------------------------------------------------------------------------
// Supabase helpers (server-side only — service role)
// ---------------------------------------------------------------------------
function sbHeaders() {
  if (!SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_URL) return null;
  return {
    apikey:          SUPABASE_SERVICE_ROLE_KEY,
    authorization:   "Bearer " + SUPABASE_SERVICE_ROLE_KEY,
    "content-type":  "application/json",
  };
}

async function sbGet(path) {
  const h = sbHeaders();
  if (!h) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: h });
    if (!r.ok) return null;
    return r.json();
  } catch { return null; }
}

async function sbPost(path, body) {
  const h = sbHeaders();
  if (!h) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method: "POST", headers: h, body: JSON.stringify(body),
    });
  } catch { /* cost logging must never break the generation run */ }
}

// ---------------------------------------------------------------------------
// Settings + budget  (cached for the lifetime of the process)
// ---------------------------------------------------------------------------
let _settings = null;

export async function loadSettings() {
  if (_settings) return _settings;
  const rows = await sbGet("ai_router_settings?id=eq.1&limit=1");
  _settings = (rows && rows[0]) || {
    monthly_budget_usd:           15.00,
    daily_budget_usd:             null,
    max_cost_per_article_usd:     0.50,
    ai_paused:                    false,
    provider_priority:            DEFAULT_PRIORITY,
    quality_escalation_threshold: 90,
    cheap_model:  null,
    medium_model: null,
    premium_model: null,
    task_models:  {},
  };
  return _settings;
}

export async function loadBudget() {
  const settings = await loadSettings();
  const now       = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const dayStart   = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

  const [monthRows, dayRows] = await Promise.all([
    sbGet(`ai_cost_logs?select=cost_usd&created_at=gte.${monthStart}`),
    sbGet(`ai_cost_logs?select=cost_usd&created_at=gte.${dayStart}`),
  ]);

  const monthSpent = (monthRows || []).reduce((s, r) => s + (Number(r.cost_usd) || 0), 0);
  const daySpent   = (dayRows   || []).reduce((s, r) => s + (Number(r.cost_usd) || 0), 0);
  const monthBudget = Number(settings.monthly_budget_usd) || 15;
  const dayBudget   = settings.daily_budget_usd ? Number(settings.daily_budget_usd) : null;

  return {
    monthSpent,
    daySpent,
    monthBudget,
    monthRemaining: Math.max(0, monthBudget - monthSpent),
    dayBudget,
    dayRemaining: dayBudget != null ? Math.max(0, dayBudget - daySpent) : null,
    paused: !!settings.ai_paused,
  };
}

function costEstimate(tier, def, model) {
  const rates = def.rates[model] || def.defaultRate || [0, 0];
  const [tokIn, tokOut] = TIER_TOKEN_ESTIMATES[tier] || TIER_TOKEN_ESTIMATES.medium;
  return (tokIn / 1000) * rates[0] + (tokOut / 1000) * rates[1];
}

function actualCost(def, model, tokIn, tokOut) {
  const rates = def.rates[model] || def.defaultRate || [0, 0];
  return (tokIn / 1000) * rates[0] + (tokOut / 1000) * rates[1];
}

// ---------------------------------------------------------------------------
// JSON extraction (AI responses sometimes wrap JSON in markdown fences)
// ---------------------------------------------------------------------------
function extractJSON(text) {
  // Strip markdown code fences if present
  const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  const a = stripped.indexOf("{"), b = stripped.lastIndexOf("}");
  if (a === -1 || b === -1) throw new Error("No JSON object found in AI response");
  return JSON.parse(stripped.slice(a, b + 1));
}

// ---------------------------------------------------------------------------
// Per-provider call implementations
// Each returns { result: Object, tokensIn: number, tokensOut: number }
// Errors are typed:
//   e.isRateLimit = true + e.isDaily = true/false (429 errors)
//   e.isProviderError = true                       (5xx, timeout, parse)
// ---------------------------------------------------------------------------

async function callOpenRouter(model, system, user) {
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type":  "application/json",
      "authorization": "Bearer " + OPENROUTER_API_KEY,
      "x-title":       "Varada Nexus Blog",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      response_format: { type: "json_object" },
      temperature: 0.6,
      max_tokens: 8192,
    }),
  });
  if (r.status === 429) {
    const body = await r.text();
    const e = new Error("OpenRouter 429: " + body.slice(0, 200));
    e.isRateLimit = true;
    e.isDaily = /day|daily|quota|credits/i.test(body);
    throw e;
  }
  if (!r.ok) {
    const e = new Error("OpenRouter " + r.status + ": " + (await r.text()).slice(0, 200));
    e.isProviderError = true;
    throw e;
  }
  const data = await r.json();
  const text = data.choices?.[0]?.message?.content || "";
  return {
    result:    extractJSON(text),
    tokensIn:  data.usage?.prompt_tokens     || 0,
    tokensOut: data.usage?.completion_tokens || 0,
  };
}

async function callGeminiDirect(model, system, user) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });
  if (r.status === 429) {
    const body = await r.text();
    const e = new Error("Gemini 429: " + body.slice(0, 200));
    e.isRateLimit = true;
    e.isDaily = /per.?day|daily|quota.*day|resource_exhausted/i.test(body);
    throw e;
  }
  if (!r.ok) {
    const e = new Error("Gemini " + r.status + ": " + (await r.text()).slice(0, 300));
    e.isProviderError = true;
    throw e;
  }
  const data = await r.json();
  const text = ((data.candidates?.[0]?.content?.parts) || []).map((p) => p.text || "").join("");
  if (!text) {
    const reason = data.candidates?.[0]?.finishReason || "unknown";
    const e = new Error("Gemini returned no text (finishReason=" + reason + ")");
    e.isProviderError = true;
    throw e;
  }
  const tokIn  = data.usageMetadata?.promptTokenCount     || Math.ceil((system.length + user.length) / 4);
  const tokOut = data.usageMetadata?.candidatesTokenCount || Math.ceil(text.length / 4);
  return { result: extractJSON(text), tokensIn: tokIn, tokensOut: tokOut };
}

async function callOpenAI(model, system, user) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { authorization: "Bearer " + OPENAI_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      response_format: { type: "json_object" },
      temperature: 0.6,
      max_tokens: 8192,
    }),
  });
  if (r.status === 429) {
    const body = await r.text();
    const e = new Error("OpenAI 429: " + body.slice(0, 200));
    e.isRateLimit = true;
    e.isDaily = /quota|billing|limit_exceeded|insufficient/i.test(body);
    throw e;
  }
  if (!r.ok) {
    const e = new Error("OpenAI " + r.status + ": " + (await r.text()).slice(0, 200));
    e.isProviderError = true;
    throw e;
  }
  const data = await r.json();
  return {
    result:    extractJSON(data.choices?.[0]?.message?.content || ""),
    tokensIn:  data.usage?.prompt_tokens     || 0,
    tokensOut: data.usage?.completion_tokens || 0,
  };
}

async function callAnthropic(model, system, user) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key":          ANTHROPIC_API_KEY,
      "anthropic-version":  "2023-06-01",
      "content-type":       "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (r.status === 429) {
    const body = await r.text();
    const e = new Error("Anthropic 429: " + body.slice(0, 200));
    e.isRateLimit = true;
    e.isDaily = /credit|quota|billing|overloaded/i.test(body);
    throw e;
  }
  if (!r.ok) {
    const e = new Error("Anthropic " + r.status + ": " + (await r.text()).slice(0, 200));
    e.isProviderError = true;
    throw e;
  }
  const data = await r.json();
  const text = (data.content || []).map((c) => c.text || "").join("");
  return {
    result:    extractJSON(text),
    tokensIn:  data.usage?.input_tokens  || 0,
    tokensOut: data.usage?.output_tokens || 0,
  };
}

const PROVIDER_CALLERS = {
  openrouter:    callOpenRouter,
  gemini_direct: callGeminiDirect,
  openai:        callOpenAI,
  anthropic:     callAnthropic,
};

// ---------------------------------------------------------------------------
// Retry within a single provider (handles RPM 429 only; daily = fail fast)
// ---------------------------------------------------------------------------
const RPM_BACKOFF_SECS = [65, 90, 150, 300];

async function callWithRetry(providerId, model, system, user) {
  const caller = PROVIDER_CALLERS[providerId];
  let lastErr;
  for (let attempt = 0; attempt <= RPM_BACKOFF_SECS.length; attempt++) {
    try {
      return await caller(model, system, user);
    } catch (e) {
      lastErr = e;
      if (e.isDaily) throw e;                           // daily quota → switch provider
      if (e.isRateLimit && attempt < RPM_BACKOFF_SECS.length) {
        const wait = RPM_BACKOFF_SECS[attempt];
        console.log(`  [router] ${providerId} RPM 429 — waiting ${wait}s (attempt ${attempt + 1}/${RPM_BACKOFF_SECS.length})`);
        await sleep(wait * 1000);
        continue;
      }
      throw e;                                          // provider error → switch provider
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// Cost logging helper (never throws — logging must not break the pipeline)
// ---------------------------------------------------------------------------
async function logCost(fields) {
  await sbPost("ai_cost_logs", {
    run_id:                  RUN_ID,
    provider:                fields.provider,
    model:                   fields.model,
    task_type:               fields.task,
    tier:                    fields.tier,
    tokens_in:               fields.tokensIn  || null,
    tokens_out:              fields.tokensOut || null,
    cost_usd:                fields.costUsd   || 0,
    duration_ms:             fields.durationMs || null,
    attempt_count:           fields.attempts  || 1,
    escalated:               !!fields.escalated,
    escalated_from_model:    fields.escalatedFromModel    || null,
    fallback_from_provider:  fields.fallbackFromProvider  || null,
    quality_score:           fields.qualityScore ?? null,
    run_kind:                fields.runKind || "manual",
    post_id:                 fields.postId  || null,
    error:                   fields.error   || null,
  });
}

// ---------------------------------------------------------------------------
// Main export: callAI
// ---------------------------------------------------------------------------
/**
 * Generate content through the AI Provider Router.
 *
 * @param {object}  options
 * @param {string}  options.task        Task type (see TASK_TIERS). Use "article_writing" for blog posts.
 * @param {string}  options.system      System prompt text.
 * @param {string}  options.user        User prompt text.
 * @param {string}  [options.importance]  "low" | "medium" | "high" — only affects article_writing tier.
 * @param {string}  [options.runKind]   "daily" | "backfill" | "weekly" | "manual"
 * @param {string}  [options.postId]    UUID of the blog post for cost log linkage.
 * @returns {Promise<object>}  Parsed JSON object returned by the AI.
 */
export async function callAI({ task, system, user, importance = "medium", runKind = "manual", postId = null }) {
  const settings = await loadSettings();

  // Kill-switch
  if (settings.ai_paused) {
    const e = new Error("AI generation is paused by the administrator. Resume it from Blog Console → AI Costs.");
    e.shouldRequeue = true;
    throw e;
  }

  // Load current spend once per call (cached settings mean only budget rows are refetched)
  const budget = await loadBudget();

  // --- Determine initial tier ---
  let tier = task === "article_writing"
    ? (IMPORTANCE_TIERS[importance] || "medium")
    : (TASK_TIERS[task] || "medium");

  // --- Build ordered provider list ---
  const rawPriority = (settings.provider_priority && settings.provider_priority.length)
    ? settings.provider_priority : DEFAULT_PRIORITY;
  const providers = rawPriority.filter((id) => PROVIDER_DEFS[id] && PROVIDER_DEFS[id].enabled());

  if (!providers.length) {
    throw new Error(
      "No AI providers are configured. Set at least one of: " +
      "OPENROUTER_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY"
    );
  }

  let fallbackFrom = null;
  let lastError    = null;

  for (const providerId of providers) {
    const def = PROVIDER_DEFS[providerId];

    // Resolve model: task override → tier override → provider default
    const taskOverride = settings.task_models && settings.task_models[task];
    const tierOverride = settings[tier + "_model"];
    const model = taskOverride || tierOverride || def.models[tier] || def.models.medium;

    // --- Budget check ---
    const estCost = costEstimate(tier, def, model);
    if (estCost > 0) {
      // Check daily budget
      if (budget.dayRemaining != null && budget.dayRemaining < estCost) {
        console.warn(`  [router] Daily budget exhausted ($${budget.daySpent.toFixed(4)}/$${budget.dayBudget}) — trying cheaper tier`);
        if (tier === "premium") { tier = "medium"; }
        else if (tier === "medium") { tier = "cheap"; }
        else {
          const e = new Error(`Daily AI budget exhausted ($${budget.daySpent.toFixed(2)} of $${budget.dayBudget})`);
          e.shouldRequeue = true; e.isBudgetExhausted = true;
          throw e;
        }
      }
      // Check monthly budget
      if (budget.monthRemaining < estCost) {
        if (tier === "premium") {
          tier = "medium";
          console.log(`  [router] Monthly budget low — downgrading to medium tier`);
        } else if (tier === "medium") {
          tier = "cheap";
          console.log(`  [router] Monthly budget low — downgrading to cheap tier`);
        } else {
          const e = new Error(`Monthly AI budget exhausted ($${budget.monthSpent.toFixed(2)} of $${budget.monthBudget})`);
          e.shouldRequeue = true; e.isBudgetExhausted = true;
          throw e;
        }
      }
    }

    const startMs = Date.now();
    try {
      console.log(`  [router] ${providerId}/${model} [${tier}] task=${task}`);
      const { result, tokensIn, tokensOut } = await callWithRetry(providerId, model, system, user);
      const durationMs = Date.now() - startMs;
      const costUsd    = actualCost(def, model, tokensIn, tokensOut);

      // --- Quality escalation (article writing only, once) ---
      let finalResult        = result;
      let escalated          = false;
      let escalatedFromModel = null;

      if (task === "article_writing") {
        const quality    = Number(result.quality_score) || 0;
        const threshold  = Number(settings.quality_escalation_threshold) || 90;

        if (quality > 0 && quality < threshold && tier !== "premium") {
          const nextTier     = tier === "cheap" ? "medium" : "premium";
          const nextTierKey  = settings[nextTier + "_model"];
          const nextModel    = nextTierKey || def.models[nextTier] || def.models.premium;
          const nextEstCost  = costEstimate(nextTier, def, nextModel);
          const canAfford    = nextEstCost === 0 || (budget.monthRemaining - costUsd) >= nextEstCost;

          if (canAfford && nextModel !== model) {
            console.log(`  [router] Quality ${quality} < ${threshold} → escalating to ${nextTier}/${nextModel}`);
            try {
              const escStart = Date.now();
              const esc = await callWithRetry(providerId, nextModel, system, user);
              const escDuration = Date.now() - escStart;
              const escCost = actualCost(def, nextModel, esc.tokensIn, esc.tokensOut);
              await logCost({
                provider: providerId, model: nextModel, task, tier: nextTier,
                tokensIn: esc.tokensIn, tokensOut: esc.tokensOut, costUsd: escCost,
                durationMs: escDuration, attempts: 1,
                escalated: false,          // this row IS the escalation result
                qualityScore: Number(esc.result?.quality_score) || null,
                runKind, postId,
              });
              finalResult = esc.result;
              escalated   = true;
              escalatedFromModel = model;
            } catch (escErr) {
              console.warn(`  [router] Escalation failed (${escErr.message}) — keeping original result`);
            }
          }
        }
      }

      // Log original call
      await logCost({
        provider: providerId, model, task, tier,
        tokensIn, tokensOut, costUsd, durationMs, attempts: 1,
        escalated, escalatedFromModel,
        fallbackFromProvider: fallbackFrom,
        qualityScore: Number(result?.quality_score) || null,
        runKind, postId,
      });

      return finalResult;

    } catch (e) {
      lastError = e;
      const durationMs = Date.now() - startMs;
      console.warn(`  [router] ${providerId} failed — ${e.message.slice(0, 120)}`);

      // Log the failed attempt
      await logCost({
        provider: providerId, model, task, tier,
        tokensIn: 0, tokensOut: 0, costUsd: 0, durationMs,
        attempts: RPM_BACKOFF_SECS.length + 1,
        fallbackFromProvider: fallbackFrom,
        runKind, postId,
        error: e.message.slice(0, 300),
      });

      // Budget / pause errors are not retryable by switching provider
      if (e.isBudgetExhausted || e.isAIPaused) throw e;

      fallbackFrom = providerId;
      // Continue to next provider
    }
  }

  // All providers exhausted
  const e = lastError || new Error("All configured AI providers failed");
  e.shouldRequeue = true;
  throw e;
}
