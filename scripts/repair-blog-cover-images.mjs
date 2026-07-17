// Replaces missing, repeated, and legacy stock covers without touching posts
// that already have a unique custom image. New images are generated from each
// post's exact title/prompt and uploaded to the public blog-covers bucket.

import { generateCoverImage } from "./image-gen.mjs";

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  REPAIR_ALL,
  DRY_RUN,
  MAX_COVERS,
  REPAIR_DELAY_MS,
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const headers = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY,
  "content-type": "application/json",
};
const delay = Math.max(Number(REPAIR_DELAY_MS) || 8000, 0);
const limit = Math.max(Number(MAX_COVERS) || 500, 1);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const LEGACY_PHOTO_IDS = new Set([
  "1554224155-6726b3ff858f", "1454165804606-c3d57bc86b40",
  "1494412574643-ff11b0a5c1c3", "1566576912321-d58ddd7a6088",
  "1576091160399-112ba8d25d1d", "1505751172876-fa1923c5c528",
  "1556742049-0cfed4f6a45d", "1551836022-d5d88e9218df",
  "1531482615713-2afd69097998", "1518770660439-4636190af475",
  "1521737711867-e3b97375f902",
]);

function canonicalUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(String(value).trim());
    return url.hostname === "images.unsplash.com" ? url.origin + url.pathname : url.href;
  } catch {
    return String(value).trim();
  }
}

function isLegacyStock(value) {
  const canonical = canonicalUrl(value);
  for (const id of LEGACY_PHOTO_IDS) if (canonical.includes(id)) return true;
  return false;
}

async function loadPosts() {
  const posts = [];
  for (let from = 0; ; from += 1000) {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/blog_posts?select=id,slug,title,cover_image,featured_image_prompt,primary_category,sector,tags,alt_text&order=created_at.asc`,
      { headers: { ...headers, range: `${from}-${from + 999}` } },
    );
    if (!response.ok) throw new Error(`Supabase read failed ${response.status}: ${await response.text()}`);
    const page = await response.json();
    posts.push(...page);
    if (page.length < 1000) return posts;
  }
}

async function updatePost(post, coverImage) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/blog_posts?id=eq.${post.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      cover_image: coverImage,
      alt_text: `${post.title} - Varada Nexus article cover`.slice(0, 110),
    }),
  });
  if (!response.ok) throw new Error(`Supabase update failed ${response.status}: ${await response.text()}`);
}

const posts = await loadPosts();
const counts = new Map();
for (const post of posts) {
  const key = canonicalUrl(post.cover_image);
  if (key) counts.set(key, (counts.get(key) || 0) + 1);
}

const repairAll = String(REPAIR_ALL).toLowerCase() === "true";
const candidates = posts.filter((post) => {
  const key = canonicalUrl(post.cover_image);
  return repairAll || !key || (counts.get(key) || 0) > 1 || isLegacyStock(key);
}).slice(0, limit);

console.log(`Found ${posts.length} posts; ${candidates.length} covers need repair.`);
if (String(DRY_RUN).toLowerCase() === "true") {
  for (const post of candidates) console.log(`DRY RUN: ${post.title}`);
  process.exit(0);
}

let repaired = 0;
let failed = 0;
for (const post of candidates) {
  try {
    const coverImage = await generateCoverImage({
      prompt: post.featured_image_prompt || null,
      title: post.title,
      category: post.primary_category || post.sector || null,
      keywords: Array.isArray(post.tags) ? post.tags : [],
      seed: post.id || post.slug,
    });
    if (!coverImage) throw new Error("image generation or upload failed");
    await updatePost(post, coverImage);
    repaired++;
    console.log(`[${repaired + failed}/${candidates.length}] Repaired: ${post.title}`);
  } catch (error) {
    failed++;
    console.error(`[${repaired + failed}/${candidates.length}] Failed: ${post.title} - ${error.message}`);
  }
  if (repaired + failed < candidates.length && delay) await sleep(delay);
}

console.log(`Cover repair complete: ${repaired} repaired, ${failed} failed.`);
if (failed) process.exit(1);
