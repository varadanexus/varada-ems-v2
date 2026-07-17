// scripts/image-gen.mjs
//
// Generates a real, unique cover image per blog post with Gemini's image
// model, then uploads it to Supabase Storage and returns a public URL.
//
// WHY THIS FILE EXISTS:
// Until now, nothing in the pipeline ever generated an actual image. The AI
// writer produced a `featured_image_prompt` string, but no code consumed it —
// every post's `cover_image` was left null. A Postgres trigger
// (assign_ai_blog_cover_image, see new-ems/supabase/migrations/
// 20260711072025_assign_ai_blog_cover_images.sql) then silently filled the
// gap from a hardcoded pool of only ~12 Unsplash URLs, keyed by a coarse
// topic bucket + a hash-based 0/1 variant. That is the root cause of the
// site-wide duplicate/mismatched cover images: dozens of unrelated posts
// were being assigned the same handful of stock photos by design.
//
// This module closes that gap by actually generating and hosting a unique
// image per post. The DB trigger is left in place as a last-resort safety
// net (e.g. if GEMINI_API_KEY is unset or the call fails) but should now
// rarely fire, since every caller below sets cover_image before insert.
//
// Required env: GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Storage: bucket "blog-covers" (public read) — see migration
//   new-ems/supabase/migrations/<timestamp>_create_blog_covers_bucket.sql
//
// Failure mode: NEVER throws. On any error (missing key, quota, network,
// upload failure) this returns `null` so callers can proceed without an
// image rather than blocking publication; the DB trigger fallback still
// applies in that case.

const { GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image";
const BUCKET = "blog-covers";

function slugFileName(seed) {
  const base = String(seed || "cover")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const nonce = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  return `${base}-${nonce}.png`;
}

/** Build a strong, brand-safe image prompt. Always includes a uniqueness cue. */
function buildPrompt({ prompt, title, category, keywords }) {
  const topic = prompt || `An editorial cover image representing: ${title || category || "Indian enterprise"}.`;
  const kw = Array.isArray(keywords) && keywords.length ? ` Related concepts: ${keywords.slice(0, 4).join(", ")}.` : "";
  return (
    `${topic}${kw} ` +
    "Professional editorial/business photography or clean modern illustration style, suitable as a blog " +
    "cover image for an Indian enterprise consultancy. Widescreen 16:9 composition, natural lighting, " +
    "realistic detail, no embedded text, no logos, no watermarks, no borders. " +
    `Distinct and specific to the subject matter above — avoid generic stock-photo clichés. (ref:${slugFileName(title).slice(0, 12)})`
  );
}

/** Call Gemini's image-generation endpoint. Returns raw PNG bytes (Buffer) or null. */
async function callGeminiImage(promptText) {
  if (!GEMINI_API_KEY) return null;
  const url = `https://generativelanguage.googleapis.com/v1/models/${IMAGE_MODEL}:generateContent`;
  let r;
  try {
    r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: {
          responseModalities: ["IMAGE"],
          responseFormat: { image: { aspectRatio: "16:9" } },
        },
      }),
    });
  } catch (e) {
    console.error("[image-gen] Gemini fetch failed:", e.message || e);
    return null;
  }
  if (!r.ok) {
    console.error("[image-gen] Gemini " + r.status + ": " + (await r.text()).slice(0, 300));
    return null;
  }
  const data = await r.json().catch(() => null);
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const imgPart = parts.find((p) => p.inlineData?.data);
  if (!imgPart) {
    console.error("[image-gen] Gemini returned no image part (finishReason=" +
      (data?.candidates?.[0]?.finishReason || "unknown") + ")");
    return null;
  }
  try {
    return Buffer.from(imgPart.inlineData.data, "base64");
  } catch {
    return null;
  }
}

/** Upload PNG bytes to the public blog-covers bucket. Returns the public URL or null. */
async function uploadToStorage(bytes, fileName) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${fileName}`;
  let r;
  try {
    r = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY,
        "content-type": "image/png",
        "x-upsert": "true",
      },
      body: bytes,
    });
  } catch (e) {
    console.error("[image-gen] Supabase Storage upload failed:", e.message || e);
    return null;
  }
  if (!r.ok) {
    console.error("[image-gen] Supabase Storage " + r.status + ": " + (await r.text()).slice(0, 300));
    return null;
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${fileName}`;
}

/**
 * Generate a unique cover image for a post and host it in Supabase Storage.
 * Never throws — returns null on any failure so callers can fall back safely.
 * @returns {Promise<string|null>} public image URL, or null
 */
export async function generateCoverImage({ prompt, title, category, keywords, seed } = {}) {
  if (!GEMINI_API_KEY) {
    console.error("[image-gen] GEMINI_API_KEY not set — skipping real image generation (DB fallback pool will apply).");
    return null;
  }
  const promptText = buildPrompt({ prompt, title, category, keywords });
  const bytes = await callGeminiImage(promptText);
  if (!bytes || !bytes.length) return null;
  const fileName = slugFileName(seed || title || category);
  return uploadToStorage(bytes, fileName);
}
