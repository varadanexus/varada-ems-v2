// mcp/tools/insights.mjs — SEO audit, low-quality finder, generation logs, failed posts.

import { z } from "zod";
import { sbGet, enc, findPost } from "../lib/supabase.mjs";
import { auditPost } from "../lib/seo.mjs";
import { ok, fail, guard } from "./_util.mjs";

const AUDIT_COLS =
  "id,slug,title,excerpt,content,meta_title,meta_description,tags,primary_category," +
  "cover_image,alt_text,canonical_url,seo_score,quality_score,status";

export function register(server) {
  // 23) run_seo_audit ---------------------------------------------------------
  server.registerTool(
    "run_seo_audit",
    {
      title: "Run SEO audit",
      description:
        "Run a deterministic on-page SEO audit (no AI, fast). Audit one post (blog_id) or a batch by " +
        "category / all live posts. Flags missing meta, weak titles, thin content, no internal links, " +
        "missing images/alt/tags, and returns a heuristic 0-100 score per post.",
      inputSchema: {
        blog_id: z.string().optional().describe("Audit a single post (uuid or slug)."),
        category: z.string().optional().describe("Audit all live posts in this primary_category."),
        limit: z.number().int().min(1).max(100).optional().describe("Batch cap (default 25)."),
      },
    },
    guard(async (a) => {
      if (a.blog_id) {
        const p = await findPost(a.blog_id, AUDIT_COLS);
        const r = auditPost(p);
        return ok({ post: { id: p.id, slug: p.slug, title: p.title, status: p.status },
          seo_score: r.score, problems: r.problems, stats: r.stats });
      }
      const parts = [`select=${enc(AUDIT_COLS)}`, "status=in.(published,auto_published,backdated)",
        `limit=${a.limit || 25}`, "order=published_at.desc"];
      if (a.category) parts.push(`primary_category=eq.${enc(a.category)}`);
      const rows = (await sbGet("blog_posts", parts.join("&"))) || [];
      const results = rows.map((p) => {
        const r = auditPost(p);
        return { id: p.id, slug: p.slug, title: p.title, seo_score: r.score,
          problem_count: r.problems.length, problems: r.problems };
      }).sort((x, y) => x.seo_score - y.seo_score);
      const avg = results.length ? Math.round(results.reduce((s, r) => s + r.seo_score, 0) / results.length) : null;
      return ok({ audited: results.length, average_seo_score: avg,
        worst_first: results });
    })
  );

  // 24) find_low_quality_posts ------------------------------------------------
  server.registerTool(
    "find_low_quality_posts",
    {
      title: "Find low-quality posts",
      description:
        "Find posts whose seo_score, quality_score OR confidence_score falls below a threshold. " +
        "Useful for 'find all posts with SEO score below 75'.",
      inputSchema: {
        threshold: z.number().min(0).max(100).optional().describe("Score threshold (default 75)."),
        metric: z.enum(["seo", "quality", "confidence", "any"]).optional().describe("Which score to test (default 'any')."),
        limit: z.number().int().min(1).max(200).optional().describe("Default 50."),
      },
    },
    guard(async (a) => {
      const t = a.threshold ?? 75;
      const metric = a.metric || "any";
      const cols = "id,slug,title,status,primary_category,seo_score,quality_score,confidence_score,published_at";
      const parts = [`select=${cols}`, "status=neq.deleted", `limit=${a.limit || 50}`, "order=seo_score.asc.nullslast"];
      const col = metric === "seo" ? "seo_score" : metric === "quality" ? "quality_score"
        : metric === "confidence" ? "confidence_score" : null;
      if (col) parts.push(`${col}=lt.${t}`);
      else parts.push(`or=(seo_score.lt.${t},quality_score.lt.${t},confidence_score.lt.${t})`);
      const rows = (await sbGet("blog_posts", parts.join("&"))) || [];
      return ok({ threshold: t, metric, count: rows.length, posts: rows });
    })
  );

  // (capability 16) get_generation_logs --------------------------------------
  server.registerTool(
    "get_generation_logs",
    {
      title: "Get generation logs",
      description: "View recent AI blog generation logs (daily/backfill/manual/regenerate runs).",
      inputSchema: {
        run_kind: z.enum(["daily", "backfill", "manual", "regenerate"]).optional(),
        status: z.enum(["published", "draft", "needs_review", "failed", "skipped"]).optional(),
        limit: z.number().int().min(1).max(200).optional().describe("Default 30."),
      },
    },
    guard(async (a) => {
      const parts = ["select=id,run_kind,post_id,status,detail,model,created_at",
        "order=created_at.desc", `limit=${a.limit || 30}`];
      if (a.run_kind) parts.push(`run_kind=eq.${enc(a.run_kind)}`);
      if (a.status) parts.push(`status=eq.${enc(a.status)}`);
      const rows = (await sbGet("blog_generation_logs", parts.join("&"))) || [];
      return ok({ count: rows.length, logs: rows });
    })
  );

  // (capability 17) get_failed_posts -----------------------------------------
  server.registerTool(
    "get_failed_posts",
    {
      title: "Get failed posts",
      description:
        "List posts/generations that need attention: status failed_review or needs_review, plus recent " +
        "failed generation-log entries. These are the candidates for retry_failed_generation.",
      inputSchema: { limit: z.number().int().min(1).max(200).optional().describe("Default 30.") },
    },
    guard(async (a) => {
      const lim = a.limit || 30;
      const [posts, logs] = await Promise.all([
        sbGet("blog_posts",
          `select=id,slug,title,status,primary_category,updated_at&status=in.(failed_review,needs_review)` +
          `&order=updated_at.desc&limit=${lim}`),
        sbGet("blog_generation_logs",
          `select=id,run_kind,post_id,detail,created_at&status=eq.failed&order=created_at.desc&limit=${lim}`),
      ]);
      return ok({
        needs_attention_posts: posts || [],
        recent_failed_generations: logs || [],
      });
    })
  );
}
