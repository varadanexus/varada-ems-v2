# Varada Blog Admin — Claude Desktop MCP

Turn Claude Desktop into your manual blog administrator. Claude calls typed MCP
tools that talk directly to Supabase and reuse the existing AI router — it never
scrapes or clicks the website UI.

Automatic scheduled publishing still runs from **GitHub Actions / Supabase cron**
(daily news, backfill worker, and the new `publish-scheduled` workflow). This MCP
server is for **on-demand admin control only** and does not run in the background.

---

## 1. What it can do (26 tools)

| # | Tool | Purpose |
|---|------|---------|
| 1 | `search_blogs` | Search/list posts (query, category, status, date range) — admin view incl. drafts |
| 2 | `get_blog` | Full details of one post by id or slug |
| 3 | `create_blog_draft` | Create a manual draft |
| 4 | `update_blog` | Edit any fields on a post |
| 5 | `publish_blog` | Publish now; optionally queue a LinkedIn post |
| 6 | `unpublish_blog` | Revert a live post to draft |
| 7 | `delete_blog` | Soft-delete (default) or permanent hard delete |
| 8 | `restore_blog` | Restore a soft-deleted post to its prior status |
| 9 | `schedule_blog` | Set status=scheduled + publish_at (CI publishes it) |
| 10 | `generate_blog` | AI-generate an article (draft / publish / scheduled) with quality gate |
| 11 | `generate_from_global_news` | Pick a real recent news story and write a grounded explainer |
| 12 | `backfill_blogs` | Queue a backdated backfill job (non-blocking) → returns `job_id` |
| 13 | `get_backfill_status` | Track a backfill job + recent logs |
| 14 | `retry_failed_generation` | Retry a failed post (regenerate) or re-queue a failed job |
| 15 | `get_ai_costs` | Budget vs spend, by provider/model, recent calls |
| 16 | `update_ai_router_settings` | Budgets, model overrides, provider order, **pause/resume** |
| 17 | `get_categories` | List categories with live post counts |
| 18 | `create_category` | Create a category |
| 19 | `update_category` | Update a category |
| 20 | `generate_linkedin_post` | Draft LinkedIn text for a post |
| 21 | `publish_linkedin_post` | Post to LinkedIn (needs token) |
| 22 | `refresh_blog` | Regenerate an old article, preserving slug/URL |
| 23 | `run_seo_audit` | Deterministic on-page SEO audit (single or batch) |
| 24 | `find_low_quality_posts` | Posts below an SEO/quality/confidence threshold |
| + | `get_generation_logs` | View AI generation run logs |
| + | `get_failed_posts` | Posts needing attention (needs_review / failed) |

---

## 2. Prerequisites

1. **Apply the migration** (adds `mcp_action_logs` + soft-delete columns):

   ```bash
   npm run check:migrations
   npm run db:dry-run       # confirm only 20260708210000_sprint18e_mcp_admin.sql is pending
   npm run db:push          # apply when you're ready (production change)
   npm run db:status
   ```

2. **Install the MCP server dependencies** (Node 18+; this repo runs Node 20/22):

   ```bash
   cd mcp
   npm install
   ```

3. **Add the GitHub Actions secret** `SUPABASE_SERVICE_ROLE_KEY` (already used by the
   other blog workflows) so the new `publish-scheduled` workflow can run.

---

## 3. Environment variables

| Variable | Required | Notes |
|----------|----------|-------|
| `SUPABASE_URL` | ✅ | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Server-side only — never exposed to output/browser |
| `BLOG_ADMIN_SECRET` | ✅ | Any long random string; server refuses to boot without it |
| `SITE_URL` | ✅ | e.g. `https://varadanexus.com` (used to build preview URLs) |
| `OPENROUTER_API_KEY` | ⛅ | At least one AI provider required for generate/refresh/backfill content |
| `OPENROUTER_MODEL` | — | Optional medium-tier override |
| `GEMINI_API_KEY` | ⛅ | Gemini Direct fallback |
| `OPENAI_API_KEY` | ⛅ | OpenAI fallback |
| `ANTHROPIC_API_KEY` | ⛅ | Anthropic fallback |
| `LINKEDIN_ACCESS_TOKEN` | ❌ | Only to `publish_linkedin_post` |
| `LINKEDIN_AUTHOR_URN` | ❌ | e.g. `urn:li:organization:12345` |
| `BLOG_ADMIN_ACTOR` | ❌ | Label in the audit log (default `claude-desktop`) |

⛅ = at least one of the AI keys is needed for AI generation tools.

---

## 4. Connect Claude Desktop (Windows)

1. Find the config file. In File Explorer paste this into the address bar:

   ```
   %APPDATA%\Claude
   ```

   Open (or create) **`claude_desktop_config.json`** there.
   Full path is usually:
   `C:\Users\<you>\AppData\Roaming\Claude\claude_desktop_config.json`

2. Paste this, editing the **absolute path** and secrets (use **double backslashes**
   in the path). A ready-to-edit copy is in `mcp/claude_desktop_config.example.json`:

   ```json
   {
     "mcpServers": {
       "varada-blog-admin": {
         "command": "node",
         "args": ["C:\\Users\\YOU\\path\\to\\Varada EMS 2.0\\mcp\\server.mjs"],
         "env": {
           "SUPABASE_URL": "https://YOUR-PROJECT.supabase.co",
           "SUPABASE_SERVICE_ROLE_KEY": "your-service-role-key",
           "BLOG_ADMIN_SECRET": "any-long-random-string",
           "OPENROUTER_API_KEY": "your-openrouter-key",
           "SITE_URL": "https://varadanexus.com"
         }
       }
     }
   }
   ```

   - Find your project's absolute path: open the folder in File Explorer and copy
     it from the address bar, then append `\mcp\server.mjs` and double every `\`.
   - If `node` isn't on PATH, use the full path to node.exe, e.g.
     `"command": "C:\\Program Files\\nodejs\\node.exe"`.

3. **Quit Claude Desktop completely** (system tray → Quit) and reopen it.
   The `varada-blog-admin` tools appear under the tools (plug) icon.

---

## 5. Example commands in Claude Desktop

- "Show me today's drafts." → `search_blogs` (status draft)
- "Generate a blog about global AI healthcare trends and save as draft." → `generate_blog`
- "Publish the best draft." → `search_blogs` → `get_blog` → `publish_blog`
- "Backfill 20 blogs from April 1 to today across AI, healthcare, SaaS, cybersecurity." → `backfill_blogs`
- "Show AI cost this month." → `get_ai_costs`
- "Find all posts with SEO score below 75." → `find_low_quality_posts`
- "Run an SEO audit on the healthcare category." → `run_seo_audit`
- "Refresh the weakest healthcare article." → `find_low_quality_posts` → `refresh_blog`
- "Generate LinkedIn posts for this week's published blogs." → `search_blogs` → `generate_linkedin_post`
- "Pause all AI generation." / "Resume AI generation." → `update_ai_router_settings`
- "Schedule this post for next Monday 9am IST." → `schedule_blog`

---

## 6. Testing

From the `mcp/` folder with env vars set:

```bash
node test-mcp.mjs             # read-only: config, Supabase, schema, search, costs, SEO
node test-mcp.mjs --backfill  # also queues a tiny backfill job
node test-mcp.mjs --generate  # also generates ONE draft (spends a little AI budget)
```

To verify the server boots as an MCP process:

```bash
# should print "[varada-blog-admin] ready — 26 tools registered" to stderr, then wait
node server.mjs
```

(Ctrl-C to stop; Claude Desktop starts it automatically.)

---

## 7. Security

- **Local-only:** the server speaks MCP over **stdio** — Claude Desktop spawns it
  locally; no network port is opened.
- **Admin gate:** it refuses to start unless `BLOG_ADMIN_SECRET` is set.
- **Service role stays server-side:** the key is read from env and never returned
  in any tool output.
- **Audit trail:** every state-changing action writes to `public.mcp_action_logs`
  (tool, action, target, destructive flag, actor, summary, detail).
- **Soft delete by default;** hard delete requires `soft_delete=false` explicitly.
- **Confirmations:** publish/unpublish/delete/restore return a clear confirmation
  banner naming the affected post.
- **Injection-safe:** all data access is via parameter-encoded PostgREST calls —
  no hand-built SQL, no shell execution.

---

## 8. Troubleshooting

| Symptom | Fix |
|---------|-----|
| Server won't start: "missing required environment variable" | Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BLOG_ADMIN_SECRET` in the config `env`. |
| Tools don't appear in Claude Desktop | Fully quit (tray → Quit) and reopen. Check the path uses `\\` and points to `mcp\server.mjs`. |
| `Cannot find package '@modelcontextprotocol/sdk'` | Run `npm install` inside `mcp/`. |
| `mcp_action_logs ... does not exist` | Apply migration `20260708210000_sprint18e_mcp_admin.sql` (`npm run db:push`). |
| Generation says "No AI provider key configured" | Add at least one of the AI keys to the config `env`. |
| LinkedIn publish fails | Set `LINKEDIN_ACCESS_TOKEN` + `LINKEDIN_AUTHOR_URN`; token needs `w_member_social`/`w_organization_social`. |
| Scheduled posts don't go live | Ensure the `publish-scheduled` GitHub Action is enabled and `SUPABASE_SERVICE_ROLE_KEY` secret is set. |
| Windows can't find `node` | Use the full path to `node.exe` in `command`. |

---

## 9. Limitations

- **Sitemap** is regenerated by CI (`generate-category-pages.mjs`) on deploy, not
  live on publish. `publish_blog` makes the post publicly queryable immediately;
  the static sitemap file updates on the next site build.
- **Backfill runs on GitHub Actions**, not inside Claude Desktop — `backfill_blogs`
  queues a job and returns a `job_id`; the hourly worker (or a manual "Blog
  backfill" dispatch) processes it. `get_backfill_status` reports progress.
- `create_category`'s `seo_title` / `meta_description` are recorded in the audit
  log only — `blog_categories` derives page SEO from `name` + `intro` (no dedicated
  columns), by design of the existing schema.
- LinkedIn image attachments are not supported (text share only).
