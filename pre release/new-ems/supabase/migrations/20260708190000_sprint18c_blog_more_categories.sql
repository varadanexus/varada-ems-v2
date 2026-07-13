-- Sprint 18C: Additional blog categories matching Varada Nexus service lines:
-- mining, import-export, e-commerce, HR & PR, interior design, strategic arbitrage.

insert into public.blog_categories (slug, name, intro, sort_order) values
  ('mining','Mining','Mining operations, mineral resources, regulation and the commodity supply chains that move India''s raw materials.',12),
  ('import-export','Import & Export','Global trade execution — sourcing, customs, DGFT policy, tariffs, FTAs and the mechanics of moving goods across borders.',14),
  ('ecommerce','E-Commerce','Online retail, marketplaces, ONDC, storefront strategy and growing digital commerce businesses in India.',16),
  ('hr','HR & PR','Recruitment, workforce structuring, labour policy, branding and public relations for growing enterprises.',18),
  ('interior-design','Interior Design','Commercial and healthcare interior design — planning, materials, execution and creating functional professional spaces.',22),
  ('arbitrage','Strategic Arbitrage','Deal structuring, regulatory strategy, market positioning and financial modelling for strategic advantage.',24)
on conflict (slug) do nothing;
