// mcp/lib/config.mjs
// Central environment loading + security gate for the Varada blog-admin MCP server.
//
// Security model:
//   * The server speaks MCP over stdio — Claude Desktop spawns it locally, so
//     it is inherently local-only (no network listener is opened).
//   * BLOG_ADMIN_SECRET must be present in the environment for the server to
//     start. This proves the operator deliberately configured admin access and
//     matches the same guard the website/CI use. Without it the server refuses
//     to boot rather than silently exposing destructive tools.
//   * The Supabase SERVICE ROLE key is only ever read here (server-side) and is
//     never returned to any tool output.

const REQUIRED = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "BLOG_ADMIN_SECRET"];

export const CONFIG = {
  supabaseUrl: process.env.SUPABASE_URL || "",
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  blogAdminSecret: process.env.BLOG_ADMIN_SECRET || "",
  siteUrl: (process.env.SITE_URL || "https://varadanexus.com").replace(/\/+$/, ""),
  actor: process.env.BLOG_ADMIN_ACTOR || "claude-desktop",

  // Optional integrations (feature-detected at call time)
  openRouterKey: process.env.OPENROUTER_API_KEY || "",
  geminiKey: process.env.GEMINI_API_KEY || "",
  openAiKey: process.env.OPENAI_API_KEY || "",
  anthropicKey: process.env.ANTHROPIC_API_KEY || "",
  linkedInToken: process.env.LINKEDIN_ACCESS_TOKEN || "",
  linkedInAuthor: process.env.LINKEDIN_AUTHOR_URN || "", // e.g. urn:li:organization:12345
};

/** Throws with a clear message if the server is not safely configured. */
export function assertConfigured() {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(
      "Varada blog-admin MCP cannot start — missing required environment " +
        "variable(s): " + missing.join(", ") + ".\n" +
        "Set them in your Claude Desktop mcpServers config (see docs/MCP_SETUP.md)."
    );
  }
}

/** True when at least one AI provider key is present (generation possible). */
export function hasAnyAiProvider() {
  return !!(CONFIG.openRouterKey || CONFIG.geminiKey || CONFIG.openAiKey || CONFIG.anthropicKey);
}

/** True when LinkedIn publishing is possible. */
export function hasLinkedIn() {
  return !!(CONFIG.linkedInToken && CONFIG.linkedInAuthor);
}

/** Public statuses a visitor can see (kept in sync with the SQL policies). */
export const LIVE_STATUSES = ["published", "auto_published", "backdated"];
