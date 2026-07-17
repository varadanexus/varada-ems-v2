-- Creates the public storage bucket that scripts/image-gen.mjs uploads
-- generated cover images into (see mcp/lib/generate.mjs and the three
-- scripts/*.mjs post generators for the callers).
--
-- Context: until this change, no code ever generated a real per-post cover
-- image — blog_posts.cover_image was left null by every generator, and the
-- assign_ai_blog_cover_image() trigger (20260711072025_assign_ai_blog_
-- cover_images.sql) silently filled it from a hardcoded pool of ~12 stock
-- photo URLs keyed by a coarse topic bucket, which is why many unrelated
-- posts ended up sharing the same handful of images. That trigger is left
-- in place as a last-resort fallback only (e.g. GEMINI_API_KEY unset, or
-- the image call fails) — it should rarely fire once this bucket exists
-- and GEMINI_API_KEY is configured wherever the generators run.

insert into storage.buckets (id, name, public)
values ('blog-covers', 'blog-covers', true)
on conflict (id) do update set public = true;

-- Public read (the blog is a public site; images must be publicly fetchable).
drop policy if exists "blog-covers public read" on storage.objects;
create policy "blog-covers public read"
on storage.objects for select
to public
using (bucket_id = 'blog-covers');

-- Service-role only writes (scripts/image-gen.mjs uploads with the service
-- role key; no anon/authenticated client should ever write to this bucket).
drop policy if exists "blog-covers service role write" on storage.objects;
create policy "blog-covers service role write"
on storage.objects for insert
to service_role
with check (bucket_id = 'blog-covers');

drop policy if exists "blog-covers service role update" on storage.objects;
create policy "blog-covers service role update"
on storage.objects for update
to service_role
using (bucket_id = 'blog-covers')
with check (bucket_id = 'blog-covers');

drop policy if exists "blog-covers service role delete" on storage.objects;
create policy "blog-covers service role delete"
on storage.objects for delete
to service_role
using (bucket_id = 'blog-covers');
