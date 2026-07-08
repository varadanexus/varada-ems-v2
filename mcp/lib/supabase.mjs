// mcp/lib/supabase.mjs
// Thin, safe wrapper over the Supabase PostgREST API using the service-role key.
//
// Why REST (not @supabase/supabase-js): the rest of this repo's automation
// (ai-router.mjs, backfill, generators) talks to Supabase over raw REST with
// global fetch and no client dependency. We match that so the MCP server stays
// dependency-light and behaves identically to the CI pipeline.
//
// Injection safety: PostgREST is parameterised at the API layer, but we build
// query strings, so every user-supplied value that lands in a filter is passed
// through encodeURIComponent and column identifiers are whitelisted by the
// callers. No SQL is ever concatenated by hand.

import { CONFIG } from "./config.mjs";

const REST = () => `${CONFIG.supabaseUrl}/rest/v1`;

function headers(extra = {}) {
  return {
    apikey: CONFIG.serviceRoleKey,
    authorization: "Bearer " + CONFIG.serviceRoleKey,
    "content-type": "application/json",
    ...extra,
  };
}

async function handle(res, path) {
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Supabase ${res.status} on ${path}: ${text.slice(0, 400)}`);
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** GET rows. `query` is a raw PostgREST query string (already encoded). */
export async function sbGet(table, query = "") {
  const path = `/${table}${query ? "?" + query : ""}`;
  const res = await fetch(REST() + path, { headers: headers() });
  return handle(res, path);
}

/** INSERT one or many rows; returns the created representation. */
export async function sbInsert(table, body) {
  const path = `/${table}`;
  const res = await fetch(REST() + path, {
    method: "POST",
    headers: headers({ prefer: "return=representation" }),
    body: JSON.stringify(body),
  });
  return handle(res, path);
}

/** PATCH rows matching `query`; returns the updated representation. */
export async function sbUpdate(table, query, body) {
  const path = `/${table}?${query}`;
  const res = await fetch(REST() + path, {
    method: "PATCH",
    headers: headers({ prefer: "return=representation" }),
    body: JSON.stringify(body),
  });
  return handle(res, path);
}

/** Hard DELETE rows matching `query`; returns the deleted representation. */
export async function sbDelete(table, query) {
  const path = `/${table}?${query}`;
  const res = await fetch(REST() + path, {
    method: "DELETE",
    headers: headers({ prefer: "return=representation" }),
  });
  return handle(res, path);
}

/** Call a Postgres function (RPC). */
export async function sbRpc(fn, args = {}) {
  const path = `/rpc/${fn}`;
  const res = await fetch(REST() + path, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(args),
  });
  return handle(res, path);
}

// ---------------------------------------------------------------------------
// Small helpers used across tools
// ---------------------------------------------------------------------------

/** Percent-encode a value for use inside a PostgREST filter. */
export const enc = (v) => encodeURIComponent(String(v));

/** UUID v4-ish check (also accepts other UUID versions). */
export function isUuid(v) {
  return typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

/** Build a `slug` from arbitrary text — identical rules to the site scripts. */
export function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

/**
 * Resolve a post by id (uuid) or slug. Returns the full row or throws a clear
 * not-found error. `cols` selects which columns to return.
 */
export async function findPost(idOrSlug, cols = "*") {
  if (!idOrSlug) throw new Error("blog_id or slug is required");
  const filter = isUuid(idOrSlug) ? `id=eq.${enc(idOrSlug)}` : `slug=eq.${enc(idOrSlug)}`;
  const rows = await sbGet("blog_posts", `select=${enc(cols)}&${filter}&limit=1`);
  if (!rows || !rows.length) throw new Error(`No blog post found for "${idOrSlug}".`);
  return rows[0];
}
