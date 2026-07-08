// mcp/lib/audit.mjs
// Writes an entry to public.mcp_action_logs for every state-changing tool call.
// Never throws into the caller — audit failure must not block the primary
// action, but it is surfaced to stderr for the operator.

import { sbInsert } from "./supabase.mjs";
import { CONFIG } from "./config.mjs";

/**
 * @param {object} e
 * @param {string} e.tool           tool name (e.g. "publish_blog")
 * @param {string} e.action         create|update|publish|unpublish|delete|restore|schedule|generate|backfill|settings|linkedin|refresh
 * @param {string} [e.targetType]   blog_post|category|job|settings|linkedin
 * @param {string} [e.targetId]     uuid or slug
 * @param {boolean}[e.destructive]  marks delete/unpublish/publish/bulk
 * @param {string} [e.summary]      human-readable one-liner
 * @param {object} [e.detail]       structured before/after / inputs
 */
export async function audit(e) {
  try {
    await sbInsert("mcp_action_logs", {
      tool: e.tool,
      action: e.action,
      target_type: e.targetType || "blog_post",
      target_id: e.targetId ? String(e.targetId) : null,
      is_destructive: !!e.destructive,
      actor: CONFIG.actor,
      summary: e.summary || null,
      detail: e.detail || {},
    });
  } catch (err) {
    console.error("[audit] failed to write mcp_action_logs:", err.message);
  }
}
