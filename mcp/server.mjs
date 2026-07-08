#!/usr/bin/env node
// mcp/server.mjs
// Varada Nexus — Blog Admin MCP server.
//
// Lets Claude Desktop act as the manual blog administrator for the Varada Nexus
// website. Speaks MCP over stdio (Claude Desktop spawns this process locally).
// All data access is via Supabase REST using the service-role key; AI generation
// reuses the project's existing scripts/ai-router.mjs.
//
// Automatic scheduled publishing still runs from GitHub Actions / Supabase cron —
// this server is for on-demand admin control only, never a background worker.
//
// Start:  node mcp/server.mjs   (with the required env vars set)
// See docs/MCP_SETUP.md for the Claude Desktop configuration.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { assertConfigured, hasAnyAiProvider, hasLinkedIn } from "./lib/config.mjs";
import { register as registerPosts } from "./tools/posts.mjs";
import { register as registerGeneration } from "./tools/generation.mjs";
import { register as registerAi } from "./tools/ai.mjs";
import { register as registerCategories } from "./tools/categories.mjs";
import { register as registerLinkedIn } from "./tools/linkedin.mjs";
import { register as registerInsights } from "./tools/insights.mjs";

async function main() {
  // Security + config gate — refuses to boot without the required secrets.
  assertConfigured();

  const server = new McpServer(
    { name: "varada-blog-admin", version: "1.0.0" },
    {
      instructions:
        "Manual blog administration for the Varada Nexus website. Use these tools to search, create, " +
        "edit, publish, unpublish, schedule, delete/restore, generate (AI), backfill, refresh, audit SEO, " +
        "manage categories, control AI cost/router settings, and manage LinkedIn posts. " +
        "Destructive actions (publish/unpublish/delete/hard-delete/pause) are logged to mcp_action_logs. " +
        "Soft delete is the default. Automatic scheduled publishing runs from GitHub Actions, not here.",
    }
  );

  registerPosts(server);
  registerGeneration(server);
  registerAi(server);
  registerCategories(server);
  registerLinkedIn(server);
  registerInsights(server);

  // Startup diagnostics go to stderr (stdout is reserved for the MCP protocol).
  console.error(
    "[varada-blog-admin] ready — 26 tools registered. " +
      `AI providers: ${hasAnyAiProvider() ? "yes" : "NONE"}; LinkedIn: ${hasLinkedIn() ? "yes" : "no"}.`
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("[varada-blog-admin] fatal:", err?.message || err);
  process.exit(1);
});
