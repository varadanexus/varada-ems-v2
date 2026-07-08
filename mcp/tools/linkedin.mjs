// mcp/tools/linkedin.mjs — LinkedIn post generation + publishing.
// Publishing uses LinkedIn's UGC Posts API and requires LINKEDIN_ACCESS_TOKEN
// and LINKEDIN_AUTHOR_URN (e.g. urn:li:organization:12345 or urn:li:person:abc).

import { z } from "zod";
import { sbGet, sbInsert, sbUpdate, enc, isUuid, findPost } from "../lib/supabase.mjs";
import { audit } from "../lib/audit.mjs";
import { CONFIG, hasLinkedIn, hasAnyAiProvider } from "../lib/config.mjs";
import { callAI } from "../../scripts/ai-router.mjs";
import { ok, fail, guard } from "./_util.mjs";

const postUrl = (slug) => `${CONFIG.siteUrl}/blog/post.html?slug=${slug}`;

export function register(server) {
  // 20) generate_linkedin_post ------------------------------------------------
  server.registerTool(
    "generate_linkedin_post",
    {
      title: "Generate LinkedIn post",
      description:
        "Create LinkedIn post text for a blog post and store it as a draft in linkedin_posts (also " +
        "caches it on the post's linkedin_post_text). Reuses the AI router; falls back to the post's " +
        "existing linkedin_post_text / excerpt if no AI key is set.",
      inputSchema: { blog_id: z.string().describe("Post uuid or slug.") },
    },
    guard(async (a) => {
      const post = await findPost(a.blog_id, "id,slug,title,excerpt,linkedin_post_text,primary_category");
      let content = post.linkedin_post_text;
      if (hasAnyAiProvider()) {
        try {
          const r = await callAI({
            task: "social_post",
            system: "You write concise, professional LinkedIn posts for Varada Nexus, an Indian multi-sector enterprise. No hype, max 3 hashtags.",
            user: `Write a 2-4 sentence LinkedIn post announcing this article titled "${post.title}". ` +
              `Excerpt: ${post.excerpt || "(none)"}. Include the URL ${postUrl(post.slug)} on its own line. ` +
              `Return ONLY JSON: {"text": string}.`,
            importance: "low", runKind: "manual", postId: post.id,
          });
          if (r && r.text) content = String(r.text);
        } catch (e) {
          if (!content) return fail("AI generation failed and no cached text exists: " + e.message);
        }
      }
      if (!content) content = `${post.title}\n\n${post.excerpt || ""}\n\n${postUrl(post.slug)}`.trim();

      const [lp] = await sbInsert("linkedin_posts", { post_id: post.id, text: content, status: "draft" });
      await sbUpdate("blog_posts", `id=eq.${enc(post.id)}`, { linkedin_post_text: content }).catch(() => {});
      await audit({ tool: "generate_linkedin_post", action: "linkedin", targetType: "linkedin", targetId: lp.id,
        summary: `Drafted LinkedIn post for ${post.title}` });
      return ok({ linkedin_post_id: lp.id, blog_id: post.id, status: "draft", text: content },
        hasLinkedIn() ? "Draft ready. Use publish_linkedin_post to post it."
          : "Draft saved. LinkedIn publishing is not configured (set LINKEDIN_ACCESS_TOKEN + LINKEDIN_AUTHOR_URN to enable).");
    })
  );

  // 21) publish_linkedin_post -------------------------------------------------
  server.registerTool(
    "publish_linkedin_post",
    {
      title: "Publish LinkedIn post",
      description:
        "Publish a LinkedIn post via the LinkedIn API. Requires LINKEDIN_ACCESS_TOKEN + LINKEDIN_AUTHOR_URN. " +
        "Provide linkedin_post_id, or blog_id to publish that post's latest LinkedIn draft.",
      inputSchema: {
        linkedin_post_id: z.string().optional(),
        blog_id: z.string().optional().describe("Publish the newest LinkedIn draft for this post."),
      },
    },
    guard(async (a) => {
      if (!hasLinkedIn())
        return fail("LinkedIn is not configured. Set LINKEDIN_ACCESS_TOKEN and LINKEDIN_AUTHOR_URN.");

      let lp;
      if (a.linkedin_post_id) {
        const rows = await sbGet("linkedin_posts", `select=*&id=eq.${enc(a.linkedin_post_id)}&limit=1`);
        lp = rows?.[0];
      } else if (a.blog_id) {
        const post = await findPost(a.blog_id, "id");
        const rows = await sbGet("linkedin_posts",
          `select=*&post_id=eq.${enc(post.id)}&order=created_at.desc&limit=1`);
        lp = rows?.[0];
      }
      if (!lp) return fail("No LinkedIn post found to publish. Generate one first.");
      if (lp.status === "posted") return fail(`Already posted (urn: ${lp.linkedin_urn}).`);

      const body = {
        author: CONFIG.linkedInAuthor,
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: { text: lp.text },
            shareMediaCategory: "NONE",
          },
        },
        visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
      };
      const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
        method: "POST",
        headers: {
          authorization: "Bearer " + CONFIG.linkedInToken,
          "content-type": "application/json",
          "x-restli-protocol-version": "2.0.0",
        },
        body: JSON.stringify(body),
      });
      const raw = await res.text();
      if (!res.ok) {
        await sbUpdate("linkedin_posts", `id=eq.${enc(lp.id)}`, { status: "failed" }).catch(() => {});
        return fail(`LinkedIn API ${res.status}: ${raw.slice(0, 300)}`);
      }
      let urn = null;
      try { urn = JSON.parse(raw).id; } catch { urn = res.headers.get("x-restli-id"); }
      const [updated] = await sbUpdate("linkedin_posts", `id=eq.${enc(lp.id)}`,
        { status: "posted", linkedin_urn: urn, posted_at: new Date().toISOString() });
      await audit({ tool: "publish_linkedin_post", action: "linkedin", targetType: "linkedin",
        targetId: lp.id, destructive: true, summary: `Posted to LinkedIn (${urn})` });
      return ok({ linkedin_post_id: updated.id, status: "posted", linkedin_urn: urn },
        "✔ Published to LinkedIn.");
    })
  );
}
