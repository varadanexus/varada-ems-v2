// mcp/tools/categories.mjs — category management (list with counts, create, update).

import { z } from "zod";
import { sbGet, sbInsert, sbUpdate, enc, slugify, isUuid } from "../lib/supabase.mjs";
import { audit } from "../lib/audit.mjs";
import { ok, fail, guard } from "./_util.mjs";

const LIVE = ["published", "auto_published", "backdated"];

export function register(server) {
  // 17) get_categories --------------------------------------------------------
  server.registerTool(
    "get_categories",
    {
      title: "Get categories",
      description: "List all blog categories with their live post counts.",
      inputSchema: {
        include_inactive: z.boolean().optional().describe("Include is_active=false categories."),
      },
    },
    guard(async (a) => {
      const filter = a.include_inactive ? "" : "&is_active=eq.true";
      const cats = (await sbGet("blog_categories",
        `select=id,slug,name,intro,sort_order,is_active&order=sort_order${filter}`)) || [];
      // Count live posts per primary_category in one pass.
      const posts = (await sbGet("blog_posts",
        `select=primary_category,status&status=in.(${LIVE.join(",")})&limit=5000`)) || [];
      const counts = {};
      for (const p of posts) if (p.primary_category) counts[p.primary_category] = (counts[p.primary_category] || 0) + 1;
      const out = cats.map((c) => ({ ...c, live_post_count: counts[c.slug] || 0 }));
      return ok({ count: out.length, categories: out });
    })
  );

  // 18) create_category -------------------------------------------------------
  server.registerTool(
    "create_category",
    {
      title: "Create category",
      description: "Create a new blog category. slug is auto-derived from name if omitted.",
      inputSchema: {
        name: z.string().min(2),
        slug: z.string().optional(),
        description: z.string().optional().describe("Intro text for the category page (SEO)."),
        seo_title: z.string().optional().describe("Stored inside intro metadata note (no dedicated column)."),
        meta_description: z.string().optional(),
        sort_order: z.number().int().optional(),
      },
    },
    guard(async (a) => {
      const slug = a.slug ? slugify(a.slug) : slugify(a.name);
      if (!slug) return fail("Could not derive a valid slug.");
      const exists = await sbGet("blog_categories", `select=id&slug=eq.${enc(slug)}&limit=1`);
      if (exists?.length) return fail(`Category slug '${slug}' already exists.`);
      const intro = a.description || null;
      const [created] = await sbInsert("blog_categories", {
        slug, name: a.name, intro, sort_order: a.sort_order ?? 100, is_active: true,
      });
      await audit({ tool: "create_category", action: "create", targetType: "category", targetId: created.id,
        summary: `Category created: ${a.name} (${slug})`,
        detail: { seo_title: a.seo_title || null, meta_description: a.meta_description || null } });
      return ok({ category: created },
        (a.seo_title || a.meta_description)
          ? "Created. Note: blog_categories has no dedicated seo_title/meta_description columns — those " +
            "were recorded in the audit log; the category page derives SEO from name + intro."
          : "Category created.");
    })
  );

  // 19) update_category -------------------------------------------------------
  server.registerTool(
    "update_category",
    {
      title: "Update category",
      description: "Update a category's name, intro/description, sort order, active flag or slug.",
      inputSchema: {
        category_id: z.string().describe("Category uuid or slug."),
        name: z.string().optional(),
        description: z.string().optional().describe("Sets intro."),
        slug: z.string().optional(),
        sort_order: z.number().int().optional(),
        is_active: z.boolean().optional(),
      },
    },
    guard(async (a) => {
      const filter = isUuid(a.category_id) ? `id=eq.${enc(a.category_id)}` : `slug=eq.${enc(a.category_id)}`;
      const found = await sbGet("blog_categories", `select=id,slug&${filter}&limit=1`);
      if (!found?.length) return fail(`No category '${a.category_id}'.`);
      const patch = {};
      if (a.name !== undefined) patch.name = a.name;
      if (a.description !== undefined) patch.intro = a.description;
      if (a.slug !== undefined) patch.slug = slugify(a.slug);
      if (a.sort_order !== undefined) patch.sort_order = a.sort_order;
      if (a.is_active !== undefined) patch.is_active = a.is_active;
      if (Object.keys(patch).length === 0) return fail("No fields to update.");
      const [updated] = await sbUpdate("blog_categories", `id=eq.${enc(found[0].id)}`, patch);
      await audit({ tool: "update_category", action: "update", targetType: "category", targetId: found[0].id,
        summary: `Category updated: ${Object.keys(patch).join(", ")}`, detail: { patch } });
      return ok({ category: updated });
    })
  );
}
