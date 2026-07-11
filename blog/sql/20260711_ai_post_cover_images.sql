-- Guarantees a polished cover image when the external AI publisher omits one.
-- The two alternatives per topic keep consecutive AI articles visually distinct.
create or replace function public.assign_ai_blog_cover_image()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  image_url text;
  variant integer := mod(hashtext(coalesce(new.slug, new.title, '')), 2);
  topic text := lower(coalesce(nullif(new.sector, ''), nullif(new.primary_category, ''), ''));
begin
  if (new.source = 'ai' or new.status = 'auto_published')
     and nullif(btrim(coalesce(new.cover_image, '')), '') is null then
    image_url := case
      when topic in ('mining', 'finance', 'arbitrage') then case when variant = 0
        then 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=1600&q=85'
        else 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1600&q=85' end
      when topic in ('import-export', 'logistics', 'trade') then case when variant = 0
        then 'https://images.unsplash.com/photo-1494412574643-ff11b0a5c1c3?auto=format&fit=crop&w=1600&q=85'
        else 'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?auto=format&fit=crop&w=1600&q=85' end
      when topic in ('healthcare', 'hospital') then case when variant = 0
        then 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=1600&q=85'
        else 'https://images.unsplash.com/photo-1505751172876-fa1923c5c528?auto=format&fit=crop&w=1600&q=85' end
      when topic in ('ecommerce', 'marketing', 'hr', 'pr') then case when variant = 0
        then 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=1600&q=85'
        else 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=1600&q=85' end
      when topic in ('technology', 'artificial-intelligence', 'automation', 'cybersecurity', 'software-development') then case when variant = 0
        then 'https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=1600&q=85'
        else 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1600&q=85' end
      else case when variant = 0
        then 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1600&q=85'
        else 'https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=1600&q=85' end
    end;
    new.cover_image := image_url;
  end if;

  if (new.source = 'ai' or new.status = 'auto_published')
     and nullif(btrim(coalesce(new.alt_text, '')), '') is null then
    new.alt_text := coalesce(new.title, 'Varada Nexus insight') || ' — Varada Nexus insight';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_assign_ai_blog_cover_image on public.blog_posts;
create trigger trg_assign_ai_blog_cover_image
before insert or update of source, status, cover_image, alt_text on public.blog_posts
for each row execute function public.assign_ai_blog_cover_image();

update public.blog_posts
set cover_image = case id
  when '8b35cf63-6d12-4bec-8494-79a90ab473cf'::uuid then 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1600&q=85'
  when 'a22b75c9-14a7-4a62-bd10-0c362376dc4c'::uuid then 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=1600&q=85'
  else cover_image
end,
alt_text = coalesce(nullif(alt_text, ''), title || ' — Varada Nexus insight')
where id in (
  '8b35cf63-6d12-4bec-8494-79a90ab473cf'::uuid,
  'a22b75c9-14a7-4a62-bd10-0c362376dc4c'::uuid
)
and nullif(btrim(coalesce(cover_image, '')), '') is null;
