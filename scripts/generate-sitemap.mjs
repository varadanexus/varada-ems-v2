// scripts/generate-sitemap.mjs
// Rebuilds sitemap.xml for SEO: static public pages + blog category pages
// + every live blog post (published, auto_published, backdated; not deleted).
//
// Run locally / in CI:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/generate-sitemap.mjs
//
// Recommended: run in GitHub Actions right after publish-scheduled-posts.mjs
// and generate-daily-news-posts.mjs so new posts are indexed the same day.
// Private areas (/new-ems/, /portals/, blog admin/console) are excluded here
// and blocked in robots.txt.

import { readdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://www.varadanexus.com";
const OUT = join(ROOT, "sitemap.xml");

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

// ---------- static public pages ----------
// [path, changefreq, priority] — path is relative to site root.
const STATIC_PAGES = [
  ["/", "weekly", "1.0"],
  ["/services.html", "monthly", "0.9"],
  ["/blog/", "daily", "0.9"],
  ["/founder.html", "monthly", "0.8"],
  ["/contact.html", "monthly", "0.8"],
  ["/hospital.html", "monthly", "0.8"],
  ["/consultancy.html", "monthly", "0.8"],
  ["/logistics.html", "monthly", "0.8"],
  ["/import-export.html", "monthly", "0.8"],
  ["/ecommerce.html", "monthly", "0.8"],
  ["/hr.html", "monthly", "0.8"],
  ["/arbitrage.html", "monthly", "0.8"],
  ["/mining.html", "monthly", "0.8"],
  ["/pr.html", "monthly", "0.8"],
  ["/team.html", "monthly", "0.7"],
];

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function isoDate(value) {
  const d = value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null;
}

function fileLastmod(relPath) {
  // Map "/" -> index.html, "/blog/" -> blog/index.html
  const rel = relPath === "/" ? "index.html" : relPath.endsWith("/") ? `${relPath.slice(1)}index.html` : relPath.slice(1);
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) return null;
  return isoDate(statSync(abs).mtime);
}

function urlEntry(loc, { lastmod, changefreq, priority } = {}) {
  const parts = [`<loc>${esc(loc)}</loc>`];
  if (lastmod) parts.push(`<lastmod>${lastmod}</lastmod>`);
  if (changefreq) parts.push(`<changefreq>${changefreq}</changefreq>`);
  if (priority) parts.push(`<priority>${priority}</priority>`);
  return `  <url>${parts.join("")}</url>`;
}

// ---------- blog categories (from the generated static dirs) ----------
function categorySlugs() {
  const dir = join(ROOT, "blog", "category");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

// ---------- live blog posts from Supabase ----------
async function fetchPosts() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.warn("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — keeping sitemap without post refresh is NOT possible; aborting to avoid dropping post URLs.");
    process.exit(1);
  }
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY,
  };
  const posts = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const url = `${SUPABASE_URL}/rest/v1/blog_posts` +
      `?select=slug,updated_at,published_at` +
      `&status=in.(published,auto_published,backdated)` +
      `&deleted_at=is.null` +
      `&order=published_at.desc`;
    const res = await fetch(url, { headers: { ...headers, range: `${from}-${from + pageSize - 1}` } });
    if (!res.ok) throw new Error(`blog_posts query failed ${res.status}: ${await res.text()}`);
    const rows = await res.json();
    posts.push(...rows);
    if (rows.length < pageSize) break;
  }
  return posts;
}

(async () => {
  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');

  for (const [path, changefreq, priority] of STATIC_PAGES) {
    lines.push(urlEntry(SITE + path, { lastmod: fileLastmod(path), changefreq, priority }));
  }

  lines.push("  <!-- blog-categories:start -->");
  for (const slug of categorySlugs()) {
    lines.push(urlEntry(`${SITE}/blog/category/${slug}/`, { changefreq: "daily", priority: "0.7" }));
  }
  lines.push("  <!-- blog-categories:end -->");

  const posts = await fetchPosts();
  const seen = new Set();
  lines.push("  <!-- blog-posts:start -->");
  for (const post of posts) {
    if (!post.slug || seen.has(post.slug)) continue;
    seen.add(post.slug);
    lines.push(urlEntry(`${SITE}/blog/post.html?slug=${encodeURIComponent(post.slug)}`, {
      lastmod: isoDate(post.updated_at) || isoDate(post.published_at),
      changefreq: "monthly",
      priority: "0.6",
    }));
  }
  lines.push("  <!-- blog-posts:end -->");

  lines.push("</urlset>");
  lines.push("");
  writeFileSync(OUT, lines.join("\n"), "utf8");
  console.log(`sitemap.xml written: ${STATIC_PAGES.length} static pages, ${categorySlugs().length} categories, ${seen.size} posts`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
