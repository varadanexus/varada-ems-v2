// mcp/tools/posts.mjs — post lifecycle tools (search, get, create, update,
// publish, unpublish, delete, restore, schedule).

import { z } from "zod";
import { sbGet, sbInsert, sbUpdate, enc, slugify, findPost, isUuid } from "../lib/supabase.mjs";
import { audit } from "../lib/audit.mjs";
import { CONFIG, LIVE_STATUSES } from "../lib/config.mjs";
import { ok, text, fail, guard, confirmation } from "./_util.mjs";

const LIST_COLS =
  "id,slug,title,status,primary_category,secondary_categories,content_type,author," +
  "published_at,updated_at,seo_score,quality_score,confidence_score,is_backdated,deleted_at";

const STATUS = ["draft", "scheduled", "published", "auto_published", "backdated",
  "needs_review", "failed_review", "deleted", "archived"];

function postUrl(slug) {
  return `${CONFIG.siteUrl}/blog/post.html?slug=${slug}`;
}

export function register(server) {
  // 1) search_blogs -----------------------------------------------------------
  server.registerTool(
    "search_blogs",
    {
      title: "Search blogs",
      description:
        "Search/list blog posts by free-text query, category, status and date range. " +
        "Admin view — returns drafts, scheduled, needs_review and deleted posts too. " +
        "Returns id, title, slug, status, category, published_at, SEO & quality scores.",
      inputSchema: {
        query: z.string().optional().describe("Free-text search across title/content/tags."),
        category: z.string().optional().describe("primary_category slug, e.g. 'healthcare'."),
        status: z.enum(STATUS).optional().describe("Filter by exact status."),
        date_from: z.string().optional().describe("ISO date (YYYY-MM-DD) lower bound on published_at."),
        date_to: z.string().optional().describe("ISO date (YYYY-MM-DD) upper bound on published_at."),
        include_deleted: z.boolean().optional().describe("Include soft-deleted posts (default false)."),
        limit: z.number().int().min(1).max(100).optional().describe("Max rows (default 30)."),
      },
    },
    guard(async (a) => {
      const parts = [`select=${enc(LIST_COLS)}`, "order=published_at.desc.nullslast,updated_at.desc"];
      const lim = a.limit || 30;
      parts.push(`limit=${lim}`);
      if (a.status) parts.push(`status=eq.${enc(a.status)}`);
      else if (!a.include_deleted) parts.push("status=neq.deleted");
      if (a.category) parts.push(`or=(primary_category.eq.${enc(a.category)},secondary_categories.cs.{${enc(a.category)}})`);
      if (a.date_from) parts.push(`published_at=gte.${enc(a.date_from)}`);
      if (a.date_to) parts.push(`published_at=lte.${enc(a.date_to)}T23:59:59`);
      if (a.query) {
        // title/excerpt ilike OR full-text; keep it simple + injection-safe via encoding.
        parts.push(`or=(title.ilike.*${enc(a.query)}*,excerpt.ilike.*${enc(a.query)}*)`);
      }
      const rows = (await sbGet("blog_posts", parts.join("&"))) || [];
      return ok({ count: rows.length, posts: rows });
    })
  );

  // 2) get_blog ---------------------------------------------------------------
  server.registerTool(
    "get_blog",
    {
      title: "Get blog",
      description: "Fetch the full details of one blog post by blog_id (uuid) or slug.",
      inputSchema: {
        blog_id: z.string().optional().describe("Post uuid."),
        slug: z.string().optional().describe("Post slug (used if blog_id omitted)."),
      },
    },
    guard(async (a) => {
      const key = a.blog_id || a.slug;
      const post = await findPost(key, "*");
      return ok({ post, url: postUrl(post.slug) });
    })
  );

  // 3) create_blog_draft ------------------------------------------------------
  server.registerTool(
    "create_blog_draft",
    {
      title: "Create blog draft",
      description:
        "Create a new DRAFT post in Supabase (never auto-published). Provide title + content; " +
        "everything else is optional. Returns the created post id, slug and preview URL.",
      inputSchema: {
        title: z.string().min(3).describe("Post title."),
        content: z.string().describe("HTML body (use <p>,<h2>,<ul>… no <h1>/<html>)."),
        category: z.string().optional().describe("primary_category slug."),
        tags: z.array(z.string()).optional(),
        excerpt: z.string().optional(),
        meta_title: z.string().optional(),
        meta_description: z.string().optional(),
        cover_image: z.string().optional().describe("Cover image URL."),
        content_type: z.string().optional().describe("evergreen|trending_news|how_to|comparison|case_study|opinion|product_service|global_news_explainer|faq"),
        publish_date: z.string().optional().describe("Optional ISO datetime to store as published_at (stays draft)."),
      },
    },
    guard(async (a) => {
      const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const rec = {
        title: a.title.slice(0, 120),
        slug: slugify(a.title) + "-" + datePart,
        content: a.content || "",
        excerpt: a.excerpt || null,
        tags: a.tags || [],
        author: "Varada Nexus",
        source: "manual",
        status: "draft",
        primary_category: a.category || null,
        content_type: a.content_type || "evergreen",
        meta_title: a.meta_title || null,
        meta_description: a.meta_description || null,
        cover_image: a.cover_image || null,
        published_at: a.publish_date || null,
      };
      const [created] = await sbInsert("blog_posts", rec);
      await audit({ tool: "create_blog_draft", action: "create", targetId: created.id,
        summary: `Draft created: ${created.title}`, detail: { slug: created.slug } });
      return ok({ id: created.id, slug: created.slug, status: created.status, url: postUrl(created.slug) },
        "Draft created — not live. Use publish_blog to make it public.");
    })
  );

  // 4) update_blog ------------------------------------------------------------
  server.registerTool(
    "update_blog",
    {
      title: "Update blog",
      description:
        "Update fields on an existing post (title, content, category, tags, meta, excerpt, cover, " +
        "content_type, status, published_at). Only provided fields change.",
      inputSchema: {
        blog_id: z.string().describe("Post uuid or slug."),
        title: z.string().optional(),
        content: z.string().optional(),
        excerpt: z.string().optional(),
        category: z.string().optional().describe("Sets primary_category."),
        tags: z.array(z.string()).optional(),
        meta_title: z.string().optional(),
        meta_description: z.string().optional(),
        cover_image: z.string().optional(),
        alt_text: z.string().optional(),
        content_type: z.string().optional(),
        status: z.enum(STATUS).optional().describe("Set status directly (advanced)."),
        published_at: z.string().optional().describe("ISO datetime."),
      },
    },
    guard(async (a) => {
      const post = await findPost(a.blog_id, "id,slug,status");
      const patch = {};
      const map = {
        title: "title", content: "content", excerpt: "excerpt", tags: "tags",
        meta_title: "meta_title", meta_description: "meta_description",
        cover_image: "cover_image", alt_text: "alt_text", content_type: "content_type",
        status: "status", published_at: "published_at",
      };
      for (const [k, col] of Object.entries(map)) if (a[k] !== undefined) patch[col] = a[k];
      if (a.category !== undefined) patch.primary_category = a.category;
      if (Object.keys(patch).length === 0) return fail("No fields to update were provided.");
      const [updated] = await sbUpdate("blog_posts", `id=eq.${enc(post.id)}`, patch);
      await audit({ tool: "update_blog", action: "update", targetId: post.id,
        summary: `Updated ${Object.keys(patch).join(", ")}`, detail: { fields: Object.keys(patch) } });
      return ok({ id: updated.id, slug: updated.slug, changed: Object.keys(patch), url: postUrl(updated.slug) });
    })
  );

  // 5) publish_blog -----------------------------------------------------------
  server.registerTool(
    "publish_blog",
    {
      title: "Publish blog",
      description:
        "Publish a post immediately: sets status=published and published_at=now (unless already set). " +
        "Optionally queues a LinkedIn post. Live sitemap is rebuilt by CI on the next deploy.",
      inputSchema: {
        blog_id: z.string().describe("Post uuid or slug."),
        queue_linkedin: z.boolean().optional().describe("If true, queue a LinkedIn post from linkedin_post_text."),
      },
    },
    guard(async (a) => {
      const post = await findPost(a.blog_id, "id,slug,title,status,published_at,linkedin_post_text");
      const patch = {
        status: "published",
        published_at: post.published_at || new Date().toISOString(),
        deleted_at: null,
      };
      const [updated] = await sbUpdate("blog_posts", `id=eq.${enc(post.id)}`, patch);
      let linkedin = null;
      if (a.queue_linkedin && post.linkedin_post_text) {
        const [lp] = await sbInsert("linkedin_posts", {
          post_id: post.id, text: post.linkedin_post_text, status: "queued",
        });
        linkedin = { linkedin_post_id: lp.id, status: "queued" };
      }
      await audit({ tool: "publish_blog", action: "publish", targetId: post.id, destructive: true,
        summary: `Published: ${post.title}`, detail: { from: post.status, queue_linkedin: !!a.queue_linkedin } });
      return ok({ id: updated.id, slug: updated.slug, status: updated.status,
        published_at: updated.published_at, url: postUrl(updated.slug), linkedin },
        confirmation("Post is now LIVE", updated.slug));
    })
  );

  // 6) unpublish_blog ---------------------------------------------------------
  server.registerTool(
    "unpublish_blog",
    {
      title: "Unpublish blog",
      description: "Move a live post back to draft (status=draft). It disappears from the public site.",
      inputSchema: { blog_id: z.string().describe("Post uuid or slug.") },
    },
    guard(async (a) => {
      const post = await findPost(a.blog_id, "id,slug,title,status");
      const [updated] = await sbUpdate("blog_posts", `id=eq.${enc(post.id)}`, { status: "draft" });
      await audit({ tool: "unpublish_blog", action: "unpublish", targetId: post.id, destructive: true,
        summary: `Unpublished: ${post.title}`, detail: { from: post.status } });
      return ok({ id: updated.id, slug: updated.slug, status: updated.status },
        confirmation("Post reverted to DRAFT (no longer public)", updated.slug));
    })
  );

  // 7) delete_blog ------------------------------------------------------------
  server.registerTool(
    "delete_blog",
    {
      title: "Delete blog",
      description:
        "Delete a post. Soft-delete by default (status=deleted, recoverable via restore_blog). " +
        "Set soft_delete=false to PERMANENTLY remove the row — irreversible.",
      inputSchema: {
        blog_id: z.string().describe("Post uuid or slug."),
        soft_delete: z.boolean().optional().describe("Default true. false = permanent hard delete."),
      },
    },
    guard(async (a) => {
      const soft = a.soft_delete !== false;
      const post = await findPost(a.blog_id, "id,slug,title,status");
      if (soft) {
        const [updated] = await sbUpdate("blog_posts", `id=eq.${enc(post.id)}`, {
          status: "deleted", previous_status: post.status, deleted_at: new Date().toISOString(),
        });
        await audit({ tool: "delete_blog", action: "delete", targetId: post.id, destructive: true,
          summary: `Soft-deleted: ${post.title}`, detail: { previous_status: post.status } });
        return ok({ id: updated.id, slug: updated.slug, status: "deleted", recoverable: true },
          confirmation("Post SOFT-DELETED (recoverable with restore_blog)", updated.slug));
      }
      const { sbDelete } = await import("../lib/supabase.mjs");
      await sbDelete("blog_posts", `id=eq.${enc(post.id)}`);
      await audit({ tool: "delete_blog", action: "delete", targetId: post.id, destructive: true,
        summary: `HARD-deleted: ${post.title}`, detail: { permanent: true } });
      return ok({ id: post.id, slug: post.slug, status: "hard_deleted", recoverable: false },
        confirmation("Post PERMANENTLY deleted (irreversible)", post.slug));
    })
  );

  // 8) restore_blog -----------------------------------------------------------
  server.registerTool(
    "restore_blog",
    {
      title: "Restore blog",
      description: "Restore a soft-deleted post to its previous status (or draft if unknown).",
      inputSchema: { blog_id: z.string().describe("Post uuid or slug.") },
    },
    guard(async (a) => {
      const post = await findPost(a.blog_id, "id,slug,title,status,previous_status");
      if (post.status !== "deleted") return fail(`Post "${post.slug}" is not deleted (status=${post.status}).`);
      const restored = post.previous_status && post.previous_status !== "deleted" ? post.previous_status : "draft";
      const [updated] = await sbUpdate("blog_posts", `id=eq.${enc(post.id)}`, {
        status: restored, previous_status: null, deleted_at: null,
      });
      await audit({ tool: "restore_blog", action: "restore", targetId: post.id,
        summary: `Restored to ${restored}: ${post.title}` });
      return ok({ id: updated.id, slug: updated.slug, status: updated.status },
        confirmation(`Post RESTORED to ${restored}`, updated.slug));
    })
  );

  // 9) schedule_blog ----------------------------------------------------------
  server.registerTool(
    "schedule_blog",
    {
      title: "Schedule blog",
      description:
        "Schedule a post to go live at a future time: sets status=scheduled and published_at=publish_at. " +
        "The publish-scheduled GitHub Action flips it to published when the time arrives (Claude Desktop " +
        "does NOT need to be running).",
      inputSchema: {
        blog_id: z.string().describe("Post uuid or slug."),
        publish_at: z.string().describe("ISO datetime in the future, e.g. 2026-07-15T09:00:00Z."),
      },
    },
    guard(async (a) => {
      const when = new Date(a.publish_at);
      if (isNaN(when.getTime())) return fail("publish_at is not a valid datetime.");
      const post = await findPost(a.blog_id, "id,slug,title,status");
      const [updated] = await sbUpdate("blog_posts", `id=eq.${enc(post.id)}`, {
        status: "scheduled", published_at: when.toISOString(), deleted_at: null,
      });
      await audit({ tool: "schedule_blog", action: "schedule", targetId: post.id,
        summary: `Scheduled for ${when.toISOString()}: ${post.title}` });
      return ok({ id: updated.id, slug: updated.slug, status: "scheduled", publish_at: when.toISOString() },
        `Scheduled. It will auto-publish via GitHub Actions at ${when.toISOString()}.`);
    })
  );
}
