// scripts/publish-scheduled-posts.mjs
// Flips any blog_posts row with status='scheduled' whose published_at is now due
// to status='published'. This is what makes Claude Desktop's schedule_blog tool
// safe: the actual go-live is driven by GitHub Actions cron, NOT by Claude
// Desktop being open. Idempotent and safe to run frequently.
//
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const REST = `${SUPABASE_URL}/rest/v1`;
const H = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY,
  "content-type": "application/json",
};

(async () => {
  const nowIso = new Date().toISOString();
  // Find due scheduled posts.
  const dueRes = await fetch(
    `${REST}/blog_posts?select=id,slug,title,published_at&status=eq.scheduled&published_at=lte.${encodeURIComponent(nowIso)}`,
    { headers: H }
  );
  if (!dueRes.ok) throw new Error("query failed " + dueRes.status + ": " + (await dueRes.text()));
  const due = await dueRes.json();

  if (!due.length) { console.log("No scheduled posts are due."); return; }

  // Publish them (published_at already set to the scheduled time — keep it).
  const patchRes = await fetch(
    `${REST}/blog_posts?status=eq.scheduled&published_at=lte.${encodeURIComponent(nowIso)}`,
    {
      method: "PATCH",
      headers: { ...H, prefer: "return=representation" },
      body: JSON.stringify({ status: "published" }),
    }
  );
  if (!patchRes.ok) throw new Error("publish failed " + patchRes.status + ": " + (await patchRes.text()));
  const published = await patchRes.json();

  // Audit trail (best-effort).
  await fetch(`${REST}/mcp_action_logs`, {
    method: "POST",
    headers: H,
    body: JSON.stringify(published.map((p) => ({
      tool: "publish-scheduled-posts.mjs", action: "publish", target_type: "blog_post",
      target_id: p.id, is_destructive: true, actor: "github-actions-cron",
      summary: `Auto-published scheduled post: ${p.title}`,
    }))),
  }).catch(() => {});

  for (const p of published) console.log(`Published scheduled: ${p.title} -> /blog/post.html?slug=${p.slug}`);
  console.log(`Done: ${published.length} scheduled post(s) published.`);
})().catch((e) => { console.error(e.message || e); process.exit(1); });
