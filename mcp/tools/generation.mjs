// mcp/tools/generation.mjs — AI generation, backfill queue, retry, refresh.

import { z } from "zod";
import { sbGet, sbInsert, sbUpdate, enc, findPost } from "../lib/supabase.mjs";
import { audit } from "../lib/audit.mjs";
import { CONFIG, hasAnyAiProvider } from "../lib/config.mjs";
import { generatePost } from "../lib/generate.mjs";
import { ok, fail, guard, confirmation } from "./_util.mjs";

const CONTENT_TYPES = ["evergreen", "trending_news", "how_to", "comparison", "case_study",
  "opinion", "product_service", "global_news_explainer", "faq"];

const postUrl = (slug) => `${CONFIG.siteUrl}/blog/post.html?slug=${slug}`;

async function loadBlogSettings() {
  const rows = await sbGet("blog_settings", "select=*&id=eq.1&limit=1");
  return (rows && rows[0]) || {
    auto_publish_enabled: true, approved_categories: [],
    min_seo_score: 60, min_quality_score: 60, min_confidence_score: 70,
  };
}

/** Apply the same owner-control quality gate the CI generators use. */
function gate(scores, category, settings) {
  const reasons = [];
  const seo = Number(scores.seo_score) || 0;
  const q = Number(scores.quality_score) || 0;
  const c = Number(scores.confidence_score) || 0;
  if (!settings.auto_publish_enabled) reasons.push("auto-publish disabled in blog_settings");
  if (settings.approved_categories?.length && category && !settings.approved_categories.includes(category))
    reasons.push(`category '${category}' not in approved list`);
  if (seo < settings.min_seo_score) reasons.push(`seo ${seo} < ${settings.min_seo_score}`);
  if (q < settings.min_quality_score) reasons.push(`quality ${q} < ${settings.min_quality_score}`);
  if (c < settings.min_confidence_score) reasons.push(`confidence ${c} < ${settings.min_confidence_score}`);
  return reasons;
}

export function register(server) {
  // 10) generate_blog ---------------------------------------------------------
  server.registerTool(
    "generate_blog",
    {
      title: "Generate blog",
      description:
        "Generate a full SEO article via the project AI router (OpenRouter→Gemini→OpenAI→Anthropic with " +
        "budget + fallback + quality escalation), run the quality gate, and save it. publish_mode=draft " +
        "saves a draft; publish only goes live if the quality thresholds pass, otherwise it is held as " +
        "needs_review; scheduled sets a future publish_at.",
      inputSchema: {
        topic: z.string().min(3).describe("What the article should be about."),
        category: z.string().optional().describe("primary_category slug."),
        content_type: z.enum(CONTENT_TYPES).optional().describe("Default evergreen."),
        target_keywords: z.array(z.string()).optional(),
        publish_mode: z.enum(["draft", "publish", "scheduled"]).optional().describe("Default draft."),
        publish_date: z.string().optional().describe("ISO datetime — required when publish_mode=scheduled."),
        use_premium_model: z.boolean().optional().describe("Bias the router toward the premium tier."),
      },
    },
    guard(async (a) => {
      if (!hasAnyAiProvider()) return fail("No AI provider key configured (OPENROUTER_API_KEY / GEMINI_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY).");
      const mode = a.publish_mode || "draft";
      if (mode === "scheduled" && !a.publish_date) return fail("publish_date is required when publish_mode=scheduled.");

      const { rec, scores } = await generatePost({
        topic: a.topic, category: a.category, contentType: a.content_type,
        keywords: a.target_keywords, usePremium: a.use_premium_model, runKind: "manual",
      });

      const settings = await loadBlogSettings();
      const reasons = gate(scores, a.category, settings);
      let status = "draft", published_at = null, held = false;

      if (mode === "publish") {
        if (reasons.length === 0) { status = "published"; published_at = new Date().toISOString(); }
        else { status = "needs_review"; held = true; }
      } else if (mode === "scheduled") {
        status = "scheduled"; published_at = new Date(a.publish_date).toISOString();
      }

      const [created] = await sbInsert("blog_posts", { ...rec, status, published_at });
      // Record a quality review row + generation log for traceability.
      await sbInsert("blog_quality_reviews", {
        post_id: created.id, seo_score: scores.seo_score, quality_score: scores.quality_score,
        confidence_score: scores.confidence_score, passed: reasons.length === 0,
        notes: reasons.join("; ") || "passed",
      }).catch(() => {});
      await sbInsert("blog_generation_logs", {
        run_kind: "manual", post_id: created.id,
        status: status === "published" ? "published" : status === "needs_review" ? "needs_review" : "draft",
        detail: `generate_blog (${mode})${held ? " held: " + reasons.join("; ") : ""}`,
      }).catch(() => {});
      await audit({ tool: "generate_blog", action: "generate", targetId: created.id,
        destructive: status === "published",
        summary: `Generated "${created.title}" → ${status}`, detail: { mode, scores, reasons } });

      return ok({
        id: created.id, slug: created.slug, status, published_at,
        scores, url: postUrl(created.slug),
        held_for_review: held, gate_reasons: reasons,
      }, held
        ? "Generated but quality gate failed — saved as needs_review instead of publishing."
        : `Generated and saved as ${status}.`);
    })
  );

  // 11) generate_from_global_news --------------------------------------------
  server.registerTool(
    "generate_from_global_news",
    {
      title: "Generate from global news",
      description:
        "Scan Google News RSS for a category/region, pick the strongest recent story, and generate a " +
        "grounded SEO explainer that cites the source. Saves draft or publishes per publish_mode " +
        "(publish still respects the quality gate).",
      inputSchema: {
        category: z.string().describe("primary_category slug, e.g. 'artificial-intelligence'."),
        region: z.string().optional().describe("Region hint, default 'India'."),
        limit: z.number().int().min(1).max(5).optional().describe("How many stories to consider (default 3)."),
        publish_mode: z.enum(["draft", "publish"]).optional().describe("Default draft."),
      },
    },
    guard(async (a) => {
      if (!hasAnyAiProvider()) return fail("No AI provider key configured.");
      const region = a.region || "India";
      const q = encodeURIComponent(`${a.category.replace(/-/g, " ")} ${region}`);
      const rssUrl = `https://news.google.com/rss/search?q=${q}&hl=en-IN&gl=IN&ceid=IN:en`;
      let xml = "";
      try {
        const r = await fetch(rssUrl, { headers: { "user-agent": "VaradaBlogAdminMCP/1.0" } });
        xml = await r.text();
      } catch (e) {
        return fail("Could not fetch Google News RSS: " + e.message);
      }
      const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, a.limit || 3).map((m) => {
        const block = m[1];
        const pick = (t) => (block.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)<\\/${t}>`)) || [, ""])[1]
          .replace(/<!\[CDATA\[|\]\]>/g, "").trim();
        return { title: pick("title"), link: pick("link"), pubDate: pick("pubDate"), source: pick("source") };
      }).filter((it) => it.title && it.link);

      if (!items.length) return fail(`No news stories found for '${a.category}' in ${region}.`);
      const best = items[0];

      const { rec, scores } = await generatePost({
        topic: `${best.title} — an explainer for Indian enterprises`,
        category: a.category, contentType: "global_news_explainer",
        keywords: [a.category.replace(/-/g, " "), region], runKind: "manual",
      });

      const refs = `<h3>Source</h3><p><a href="${best.link}" rel="nofollow noopener" target="_blank">${best.source || "Read the original report"}</a></p>`;
      rec.content += refs;
      rec.region = region;
      rec.source_urls = [best.link];

      const settings = await loadBlogSettings();
      const reasons = gate(scores, a.category, settings);
      const wantPublish = (a.publish_mode || "draft") === "publish";
      const publishNow = wantPublish && reasons.length === 0;
      const status = publishNow ? "auto_published" : wantPublish ? "needs_review" : "draft";
      const published_at = publishNow ? new Date().toISOString() : null;

      const [created] = await sbInsert("blog_posts", {
        ...rec, status, published_at, is_auto_published: publishNow,
      });
      if (created.id) {
        await sbInsert("blog_sources", {
          post_id: created.id, url: best.link, publisher: best.source || null,
          headline: best.title, kind: "news",
        }).catch(() => {});
        await sbInsert("blog_generation_logs", {
          run_kind: "manual", post_id: created.id,
          status: publishNow ? "published" : wantPublish ? "needs_review" : "draft",
          detail: `news explainer from ${best.link}`,
        }).catch(() => {});
      }
      await audit({ tool: "generate_from_global_news", action: "generate", targetId: created.id,
        destructive: publishNow, summary: `News explainer: ${created.title}`,
        detail: { source: best.link, status, reasons } });

      return ok({ id: created.id, slug: created.slug, status, source: best.link,
        scores, gate_reasons: reasons, url: postUrl(created.slug), considered: items.length });
    })
  );

  // 12) backfill_blogs --------------------------------------------------------
  server.registerTool(
    "backfill_blogs",
    {
      title: "Backfill blogs",
      description:
        "Start a backdated backfill job by QUEUEING a row in blog_backfill_jobs. The existing GitHub " +
        "Actions worker (hourly cron) picks it up and generates posts — this returns immediately with a " +
        "job_id (non-blocking). Use get_backfill_status to track it.",
      inputSchema: {
        date_from: z.string().describe("Start date YYYY-MM-DD."),
        date_to: z.string().describe("End date YYYY-MM-DD."),
        count: z.number().int().min(1).max(200).describe("Number of posts to generate."),
        categories: z.array(z.string()).optional().describe("Category slugs (empty = all active)."),
        mode: z.enum(["draft", "publish"]).optional().describe("draft (review first) or publish (goes live, backdated). Default draft."),
      },
    },
    guard(async (a) => {
      const [job] = await sbInsert("blog_backfill_jobs", {
        date_from: a.date_from, date_to: a.date_to, post_count: a.count,
        categories: a.categories || [], publish_mode: a.mode || "draft",
        status: "queued", requested_by: CONFIG.actor,
      });
      await audit({ tool: "backfill_blogs", action: "backfill", targetType: "job", targetId: job.id,
        destructive: (a.mode === "publish"),
        summary: `Queued backfill of ${a.count} posts (${a.date_from}→${a.date_to}, ${a.mode || "draft"})`,
        detail: { categories: a.categories || "all" } });
      return ok({ job_id: job.id, status: job.status, post_count: job.post_count,
        publish_mode: job.publish_mode },
        "Backfill QUEUED. The GitHub Actions worker (runs hourly, or trigger 'Blog backfill' manually) " +
        "will process it. Poll with get_backfill_status.");
    })
  );

  // 13) get_backfill_status ---------------------------------------------------
  server.registerTool(
    "get_backfill_status",
    {
      title: "Get backfill status",
      description: "Report a backfill job's status, counts and recent generation logs. Omit job_id for the latest jobs.",
      inputSchema: { job_id: z.string().optional().describe("Job uuid; omit to list recent jobs.") },
    },
    guard(async (a) => {
      if (!a.job_id) {
        const jobs = (await sbGet("blog_backfill_jobs", "select=*&order=created_at.desc&limit=5")) || [];
        return ok({ recent_jobs: jobs });
      }
      const jobs = await sbGet("blog_backfill_jobs", `select=*&id=eq.${enc(a.job_id)}&limit=1`);
      if (!jobs || !jobs.length) return fail(`No backfill job ${a.job_id}.`);
      const job = jobs[0];
      const logs = (await sbGet("blog_generation_logs",
        `select=status,detail,model,created_at&run_kind=eq.backfill&order=created_at.desc&limit=20`)) || [];
      const completed = logs.filter((l) => ["published", "draft"].includes(l.status)).length;
      const failed = logs.filter((l) => l.status === "failed").length;
      return ok({ job, completed_recent: completed, failed_recent: failed, recent_logs: logs });
    })
  );

  // 14) retry_failed_generation ----------------------------------------------
  server.registerTool(
    "retry_failed_generation",
    {
      title: "Retry failed generation",
      description:
        "Retry a failed generation. Provide blog_id to regenerate content for an existing failed/empty " +
        "post (via the router with fallback), or job_id to re-queue a failed backfill job.",
      inputSchema: {
        blog_id: z.string().optional().describe("Regenerate this post's content."),
        job_id: z.string().optional().describe("Re-queue this failed backfill job."),
      },
    },
    guard(async (a) => {
      if (a.job_id) {
        const jobs = await sbGet("blog_backfill_jobs", `select=*&id=eq.${enc(a.job_id)}&limit=1`);
        if (!jobs?.length) return fail(`No backfill job ${a.job_id}.`);
        const [job] = await sbUpdate("blog_backfill_jobs", `id=eq.${enc(a.job_id)}`,
          { status: "queued", started_at: null, finished_at: null, detail: "re-queued via MCP" });
        await audit({ tool: "retry_failed_generation", action: "backfill", targetType: "job",
          targetId: job.id, summary: "Re-queued failed backfill job" });
        return ok({ job_id: job.id, status: job.status }, "Job re-queued for the CI worker.");
      }
      if (a.blog_id) {
        if (!hasAnyAiProvider()) return fail("No AI provider key configured.");
        const post = await findPost(a.blog_id, "id,slug,title,primary_category,content_type");
        const { rec, scores } = await generatePost({
          topic: post.title, category: post.primary_category,
          contentType: post.content_type || "evergreen", runKind: "manual", postId: post.id,
        });
        const [updated] = await sbUpdate("blog_posts", `id=eq.${enc(post.id)}`, {
          content: rec.content, excerpt: rec.excerpt, meta_title: rec.meta_title,
          meta_description: rec.meta_description, seo_score: scores.seo_score,
          quality_score: scores.quality_score, confidence_score: scores.confidence_score,
          status: "needs_review",
        });
        await sbInsert("blog_generation_logs", { run_kind: "regenerate", post_id: post.id,
          status: "needs_review", detail: "retry_failed_generation" }).catch(() => {});
        await audit({ tool: "retry_failed_generation", action: "generate", targetId: post.id,
          summary: `Regenerated content for ${post.title}`, detail: { scores } });
        return ok({ id: updated.id, slug: updated.slug, status: updated.status, scores },
          "Content regenerated and held as needs_review for you to check.");
      }
      return fail("Provide either blog_id or job_id.");
    })
  );

  // 22) refresh_blog ----------------------------------------------------------
  server.registerTool(
    "refresh_blog",
    {
      title: "Refresh blog",
      description:
        "Regenerate/refresh an older article with current framing while PRESERVING its slug and " +
        "published_at (unless change_slug=true). Result is held as needs_review for your approval.",
      inputSchema: {
        blog_id: z.string().describe("Post uuid or slug."),
        reason: z.string().optional().describe("Why you're refreshing (logged)."),
        change_slug: z.boolean().optional().describe("Default false — keep the existing slug/URL."),
      },
    },
    guard(async (a) => {
      if (!hasAnyAiProvider()) return fail("No AI provider key configured.");
      const post = await findPost(a.blog_id, "id,slug,title,primary_category,content_type,published_at,status");
      const { rec, scores } = await generatePost({
        topic: post.title, category: post.primary_category,
        contentType: post.content_type || "evergreen", runKind: "manual", postId: post.id,
      });
      const patch = {
        content: rec.content, excerpt: rec.excerpt, meta_title: rec.meta_title,
        meta_description: rec.meta_description, tags: rec.tags,
        seo_score: scores.seo_score, quality_score: scores.quality_score,
        confidence_score: scores.confidence_score, status: "needs_review",
      };
      if (a.change_slug) patch.slug = rec.slug;
      const [updated] = await sbUpdate("blog_posts", `id=eq.${enc(post.id)}`, patch);
      await sbInsert("blog_generation_logs", { run_kind: "regenerate", post_id: post.id,
        status: "needs_review", detail: `refresh: ${a.reason || "manual refresh"}` }).catch(() => {});
      await audit({ tool: "refresh_blog", action: "refresh", targetId: post.id,
        summary: `Refreshed: ${post.title}`, detail: { reason: a.reason || null, slug_preserved: !a.change_slug } });
      return ok({ id: updated.id, slug: updated.slug, slug_preserved: !a.change_slug, scores,
        url: postUrl(updated.slug) },
        "Refreshed and held as needs_review. Publish it when you're happy with the update.");
    })
  );
}
