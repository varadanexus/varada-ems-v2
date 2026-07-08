#!/usr/bin/env node
// mcp/test-mcp.mjs
// Smoke tests for the Varada blog-admin MCP server. Talks directly to the same
// libraries the tools use (no MCP transport needed) so you can validate config,
// Supabase connectivity and read-only tools quickly.
//
// Usage (from the mcp/ folder, with env vars set):
//   node test-mcp.mjs                 # read-only checks (safe)
//   node test-mcp.mjs --generate      # also generate ONE draft (uses AI budget)
//   node test-mcp.mjs --backfill      # also queue a tiny backfill job
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BLOG_ADMIN_SECRET (+ AI keys for --generate)

import { assertConfigured, hasAnyAiProvider } from "./lib/config.mjs";
import { sbGet, sbInsert } from "./lib/supabase.mjs";
import { auditPost } from "./lib/seo.mjs";

const args = new Set(process.argv.slice(2));
let pass = 0, fail = 0;
const ok = (n, extra = "") => { pass++; console.log(`  PASS  ${n}${extra ? " — " + extra : ""}`); };
const no = (n, e) => { fail++; console.log(`  FAIL  ${n} — ${e?.message || e}`); };

console.log("Varada blog-admin MCP — smoke tests\n");

// 1) Config gate
try { assertConfigured(); ok("config present (SUPABASE_URL, SERVICE_ROLE_KEY, BLOG_ADMIN_SECRET)"); }
catch (e) { no("config", e); console.log("\nCannot continue without config."); process.exit(1); }

// 2) Supabase connectivity + schema presence
try {
  const rows = await sbGet("blog_posts", "select=id&limit=1");
  ok("Supabase connection + blog_posts readable", `${Array.isArray(rows) ? rows.length : 0} row sampled`);
} catch (e) { no("Supabase connection", e); }

try {
  await sbGet("mcp_action_logs", "select=id&limit=1");
  ok("mcp_action_logs table exists (migration applied)");
} catch (e) { no("mcp_action_logs (apply migration 20260708210000_sprint18e_mcp_admin.sql)", e); }

try {
  await sbGet("ai_router_settings", "select=id&limit=1");
  ok("ai_router_settings readable");
} catch (e) { no("ai_router_settings", e); }

// 3) search_blogs equivalent (read-only)
try {
  const rows = await sbGet("blog_posts", "select=id,title,status&status=neq.deleted&limit=5");
  ok("search_blogs query", `${rows?.length || 0} posts`);
} catch (e) { no("search_blogs query", e); }

// 4) get_ai_costs equivalent
try {
  const start = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
  const logs = await sbGet("ai_cost_logs", `select=cost_usd&created_at=gte.${encodeURIComponent(start)}&limit=1000`);
  const spent = (logs || []).reduce((s, r) => s + (Number(r.cost_usd) || 0), 0);
  ok("get_ai_costs query", `MTD spend $${spent.toFixed(4)}`);
} catch (e) { no("get_ai_costs query", e); }

// 5) SEO audit (pure function)
try {
  const r = auditPost({ title: "Test", content: "<p>short</p>", slug: "test", tags: [] });
  if (typeof r.score === "number") ok("run_seo_audit scorer", `score=${r.score}, ${r.problems.length} problems`);
  else no("run_seo_audit scorer", "no score");
} catch (e) { no("run_seo_audit scorer", e); }

// 6) Optional: queue a tiny backfill job
if (args.has("--backfill")) {
  try {
    const [job] = await sbInsert("blog_backfill_jobs", {
      date_from: new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10),
      date_to: new Date().toISOString().slice(0, 10),
      post_count: 1, categories: ["business"], publish_mode: "draft",
      status: "queued", requested_by: "mcp-test",
    });
    ok("backfill_blogs queue", `job_id=${job.id}`);
  } catch (e) { no("backfill_blogs queue", e); }
}

// 7) Optional: generate ONE draft (spends a little AI budget)
if (args.has("--generate")) {
  if (!hasAnyAiProvider()) no("generate_blog", "no AI provider key set");
  else try {
    const { generatePost } = await import("./lib/generate.mjs");
    const { rec, scores } = await generatePost({
      topic: "How Indian enterprises should evaluate AI automation vendors",
      category: "artificial-intelligence", contentType: "how_to", runKind: "manual",
    });
    const [created] = await sbInsert("blog_posts", { ...rec, status: "draft" });
    ok("generate_blog (draft)", `slug=${created.slug}, seo=${scores.seo_score}`);
  } catch (e) { no("generate_blog (draft)", e); }
}

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
