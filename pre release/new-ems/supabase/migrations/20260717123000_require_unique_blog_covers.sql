-- Stop future AI posts from falling back to the small shared stock-photo pool.
-- Existing repeated covers are replaced by scripts/repair-blog-cover-images.mjs.
create or replace function public.assign_ai_blog_cover_image()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if (new.source = 'ai' or new.status = 'auto_published')
     and nullif(btrim(coalesce(new.cover_image, '')), '') is null then
    raise exception using
      errcode = '23514',
      message = 'AI blog posts require a generated cover image';
  end if;

  if (new.source = 'ai' or new.status = 'auto_published')
     and nullif(btrim(coalesce(new.alt_text, '')), '') is null then
    new.alt_text := coalesce(new.title, 'Varada Nexus insight') || ' - Varada Nexus insight';
  end if;
  return new;
end;
$$;

-- Generated filenames contain a UUID nonce. This partial unique index adds a
-- database-level guarantee that a generated URL cannot be reused by two posts.
create unique index if not exists blog_posts_generated_cover_image_unique
on public.blog_posts (lower(cover_image))
where cover_image like '%/storage/v1/object/public/blog-covers/%';
