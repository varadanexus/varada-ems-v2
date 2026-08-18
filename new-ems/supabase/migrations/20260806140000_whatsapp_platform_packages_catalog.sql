-- Admin-managed catalog for the sellable WhatsApp Business Platform:
-- Plans, plan features, add-ons and the public pricing-calculator rates.
-- Managed from the WhatsApp Business Platform console ("Packages & Offers" tab)
-- and read by the public pricing page. All writes go through security-definer
-- RPCs gated by has_permission('whatsapp-platform','edit'); chairman_managing_director
-- and super_admin retain unrestricted access via the central authority invariant.

-- ------------------------------------------------------------------ tables
create table if not exists public.whatsapp_platform_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  name text not null,
  tagline text not null default '',
  price_monthly numeric(12,2) not null default 0,
  price_monthly_usd numeric(12,2) not null default 0,
  price_prefix text not null default '',
  price_suffix text not null default '/mo',
  annual_note text not null default '',
  badge text not null default '',
  cta_label text not null default 'Get started',
  cta_href text not null default '/whatsapp-platform/access/#signup',
  features jsonb not null default '[]'::jsonb,
  is_featured boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_platform_addons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  tooltip text not null default '',
  price_display text not null default '',
  price_unit text not null default '',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_platform_pricing_rates (
  id integer primary key default 1,
  rates jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint whatsapp_platform_pricing_rates_singleton check (id = 1)
);

alter table public.whatsapp_platform_plans enable row level security;
alter table public.whatsapp_platform_addons enable row level security;
alter table public.whatsapp_platform_pricing_rates enable row level security;
-- No RLS policies: all access flows through the security-definer RPCs below.

-- ------------------------------------------------------------------ seed
insert into public.whatsapp_platform_plans
  (code, label, name, tagline, price_monthly, price_monthly_usd, price_prefix, price_suffix, annual_note, badge, cta_label, cta_href, features, is_featured, is_active, sort_order)
values
  ('launch', 'Launch', 'For teams getting started',
   'Establish a professional foundation with guided setup and the essentials for organised customer conversations.',
   999, 12, '', '/mo', '₹899/mo billed annually · 14-day free trial', '',
   'Start with Launch', '/whatsapp-platform/access/#signup',
   jsonb_build_array(
     '1 number · 3 agent seats','Shared team inbox (web + mobile)','Green-tick verification assistance',
     'Template creation & submission','Contacts, tags & import','Broadcasts to opted-in contacts','Quick replies',
     'Auto-replies: welcome, away, business hours','Click-to-WhatsApp link & QR code',
     'Core reports (sent · delivered · read)','Email & chat support'),
   false, true, 1),
  ('growth', 'Growth', 'For scaling customer teams',
   'Add campaigns, automation and richer controls for a growing sales or service operation.',
   2999, 36, '', '/mo', '₹2,499/mo billed annually', 'Most popular',
   'Start with Growth', '/whatsapp-platform/access/#signup',
   jsonb_build_array(
     'Everything in Launch','2 numbers · 10 agent seats','Segmentation, scheduled & drip campaigns',
     'No-code chatbot / flow builder','Smart routing, auto-assignment & SLA timers','Agent roles, notes & @mentions',
     'Catalog & product messages','CRM-lite: attributes & lifecycle stages',
     'Integrations: Shopify, Sheets, Zapier, webhooks','Advanced analytics & campaign insights','Priority support'),
   true, true, 2),
  ('enterprise', 'Enterprise', 'For complex operations',
   'Design a governed implementation around multiple teams, systems, numbers and higher volumes.',
   9999, 120, 'from ', '/mo', 'Volume & pass-through Meta rates', '',
   'Talk to sales', '/contact.html?subject=WhatsApp%20Enterprise%20Pricing',
   jsonb_build_array(
     'Everything in Growth','Unlimited seats · multiple numbers · multi-team',
     'Full API access & custom integrations (Salesforce, Zoho, HubSpot, ERP)',
     'Governance: RBAC, audit logs, approvals, SSO','Higher Meta messaging tiers (100k+/day)',
     'Volume / pass-through Meta rates + prepaid wallet','Custom reporting, data export & white-label',
     'Dedicated account manager & SLA'),
   false, true, 3)
on conflict (code) do nothing;

insert into public.whatsapp_platform_addons (name, description, tooltip, price_display, price_unit, sort_order)
select * from (values
  ('Extra WhatsApp number', 'Add another brand, region or business unit.',
   'A separate WhatsApp Business number with its own inbox, templates and reports — for a second brand, city or department. Billed per extra number each month.',
   '₹400', '/number/mo', 1),
  ('Extra agent seat', 'Add teammates beyond your plan''s included seats.',
   'One seat = one team member who can log in and reply to chats. Add seats above the number included in your plan; billed monthly per extra seat.',
   '₹200', '/seat/mo', 2),
  ('Priority support', 'Faster response times and a named contact.',
   'Front-of-queue support with faster guaranteed response times and a named point of contact for setup, issues and escalations.',
   '₹2,000', '/mo', 3),
  ('Extra integration', 'Connect an additional business system.',
   'Connect one more external system (CRM, online store, spreadsheets) beyond what your plan includes, so data and chats stay in sync. Billed monthly per extra integration.',
   '₹500', '/mo', 4),
  ('Green-tick fast-track', 'Guided official business verification.',
   'Hands-on help to earn WhatsApp''s official green verified-business badge — profile preparation and Meta submission. One-time fee.',
   '₹2,999', 'one-time', 5),
  ('Custom integration build', 'Bespoke CRM / ERP or API integration.',
   'A bespoke connection to your CRM/ERP or internal tools via API when no ready-made integration exists. Scoped and quoted per project.',
   'from ₹15,000', 'one-time', 6),
  ('Prepaid message wallet', 'Top up credits, billed at your per-message rates.',
   'A prepaid balance drawn down as you send messages, charged at your per-message rates — control spend without a monthly commitment.',
   'from ₹1,000', 'top-up', 7)
) as seed(name, description, tooltip, price_display, price_unit, sort_order)
where not exists (select 1 from public.whatsapp_platform_addons);

insert into public.whatsapp_platform_pricing_rates (id, rates)
values (1, jsonb_build_object(
  'INR', jsonb_build_object('marketing', 0.99, 'utility', 0.20, 'authentication', 0.20, 'service', 0),
  'USD', jsonb_build_object('marketing', 0.0120, 'utility', 0.0024, 'authentication', 0.0024, 'service', 0)
))
on conflict (id) do nothing;

-- ------------------------------------------------------------------ permission label
insert into public.permissions (module_code, action_code, label, is_active)
values ('whatsapp-platform', 'edit', 'WhatsApp Platform — Manage packages, add-ons and pricing', true)
on conflict (module_code, action_code) do update
set label = excluded.label, is_active = true;

-- ------------------------------------------------------------------ public read RPC (anon)
create or replace function public.whatsapp_platform_public_catalog()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'plans', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', p.code, 'label', p.label, 'name', p.name, 'tagline', p.tagline,
        'priceMonthly', p.price_monthly, 'priceMonthlyUsd', p.price_monthly_usd,
        'pricePrefix', p.price_prefix, 'priceSuffix', p.price_suffix,
        'annualNote', p.annual_note, 'badge', p.badge,
        'ctaLabel', p.cta_label, 'ctaHref', p.cta_href,
        'features', p.features, 'isFeatured', p.is_featured
      ) order by p.sort_order, p.created_at)
      from public.whatsapp_platform_plans p where p.is_active
    ), '[]'::jsonb),
    'addons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', a.name, 'description', a.description, 'tooltip', a.tooltip,
        'priceDisplay', a.price_display, 'priceUnit', a.price_unit
      ) order by a.sort_order, a.created_at)
      from public.whatsapp_platform_addons a where a.is_active
    ), '[]'::jsonb),
    'rates', coalesce((select r.rates from public.whatsapp_platform_pricing_rates r where r.id = 1), '{}'::jsonb)
  );
$$;

-- ------------------------------------------------------------------ admin catalog RPC (all rows)
create or replace function public.whatsapp_platform_admin_catalog()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_permission('whatsapp-platform', 'view') then
    raise exception 'Not authorized to view WhatsApp Platform packages' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'plans', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'code', p.code, 'label', p.label, 'name', p.name, 'tagline', p.tagline,
        'priceMonthly', p.price_monthly, 'priceMonthlyUsd', p.price_monthly_usd,
        'pricePrefix', p.price_prefix, 'priceSuffix', p.price_suffix,
        'annualNote', p.annual_note, 'badge', p.badge,
        'ctaLabel', p.cta_label, 'ctaHref', p.cta_href,
        'features', p.features, 'isFeatured', p.is_featured,
        'isActive', p.is_active, 'sortOrder', p.sort_order
      ) order by p.sort_order, p.created_at)
      from public.whatsapp_platform_plans p
    ), '[]'::jsonb),
    'addons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'name', a.name, 'description', a.description, 'tooltip', a.tooltip,
        'priceDisplay', a.price_display, 'priceUnit', a.price_unit,
        'isActive', a.is_active, 'sortOrder', a.sort_order
      ) order by a.sort_order, a.created_at)
      from public.whatsapp_platform_addons a
    ), '[]'::jsonb),
    'rates', coalesce((select r.rates from public.whatsapp_platform_pricing_rates r where r.id = 1), '{}'::jsonb)
  );
end;
$$;

-- ------------------------------------------------------------------ admin write RPCs
create or replace function public.whatsapp_platform_admin_upsert_plan(
  p_id uuid,
  p_code text,
  p_label text,
  p_name text,
  p_tagline text,
  p_price_monthly numeric,
  p_price_monthly_usd numeric,
  p_price_prefix text,
  p_price_suffix text,
  p_annual_note text,
  p_badge text,
  p_cta_label text,
  p_cta_href text,
  p_features jsonb,
  p_is_featured boolean,
  p_is_active boolean,
  p_sort_order integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.has_permission('whatsapp-platform', 'edit') then
    raise exception 'Not authorized to manage WhatsApp Platform packages' using errcode = '42501';
  end if;
  if coalesce(btrim(p_code), '') = '' or coalesce(btrim(p_label), '') = '' then
    raise exception 'Plan code and label are required' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_features, '[]'::jsonb)) <> 'array' then
    raise exception 'Features must be a JSON array' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.whatsapp_platform_plans
      (code, label, name, tagline, price_monthly, price_monthly_usd, price_prefix, price_suffix,
       annual_note, badge, cta_label, cta_href, features, is_featured, is_active, sort_order)
    values
      (btrim(p_code), p_label, coalesce(p_name, ''), coalesce(p_tagline, ''),
       coalesce(p_price_monthly, 0), coalesce(p_price_monthly_usd, 0),
       coalesce(p_price_prefix, ''), coalesce(p_price_suffix, '/mo'),
       coalesce(p_annual_note, ''), coalesce(p_badge, ''),
       coalesce(p_cta_label, 'Get started'), coalesce(p_cta_href, '/whatsapp-platform/access/#signup'),
       coalesce(p_features, '[]'::jsonb), coalesce(p_is_featured, false),
       coalesce(p_is_active, true), coalesce(p_sort_order, 0))
    returning id into v_id;
  else
    update public.whatsapp_platform_plans set
      code = btrim(p_code), label = p_label, name = coalesce(p_name, ''), tagline = coalesce(p_tagline, ''),
      price_monthly = coalesce(p_price_monthly, 0), price_monthly_usd = coalesce(p_price_monthly_usd, 0),
      price_prefix = coalesce(p_price_prefix, ''), price_suffix = coalesce(p_price_suffix, '/mo'),
      annual_note = coalesce(p_annual_note, ''), badge = coalesce(p_badge, ''),
      cta_label = coalesce(p_cta_label, 'Get started'),
      cta_href = coalesce(p_cta_href, '/whatsapp-platform/access/#signup'),
      features = coalesce(p_features, '[]'::jsonb), is_featured = coalesce(p_is_featured, false),
      is_active = coalesce(p_is_active, true), sort_order = coalesce(p_sort_order, 0), updated_at = now()
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Plan not found' using errcode = 'P0002';
    end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.whatsapp_platform_admin_delete_plan(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('whatsapp-platform', 'edit') then
    raise exception 'Not authorized to manage WhatsApp Platform packages' using errcode = '42501';
  end if;
  delete from public.whatsapp_platform_plans where id = p_id;
end;
$$;

create or replace function public.whatsapp_platform_admin_upsert_addon(
  p_id uuid,
  p_name text,
  p_description text,
  p_tooltip text,
  p_price_display text,
  p_price_unit text,
  p_is_active boolean,
  p_sort_order integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.has_permission('whatsapp-platform', 'edit') then
    raise exception 'Not authorized to manage WhatsApp Platform packages' using errcode = '42501';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'Add-on name is required' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.whatsapp_platform_addons
      (name, description, tooltip, price_display, price_unit, is_active, sort_order)
    values
      (p_name, coalesce(p_description, ''), coalesce(p_tooltip, ''),
       coalesce(p_price_display, ''), coalesce(p_price_unit, ''),
       coalesce(p_is_active, true), coalesce(p_sort_order, 0))
    returning id into v_id;
  else
    update public.whatsapp_platform_addons set
      name = p_name, description = coalesce(p_description, ''), tooltip = coalesce(p_tooltip, ''),
      price_display = coalesce(p_price_display, ''), price_unit = coalesce(p_price_unit, ''),
      is_active = coalesce(p_is_active, true), sort_order = coalesce(p_sort_order, 0), updated_at = now()
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Add-on not found' using errcode = 'P0002';
    end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.whatsapp_platform_admin_delete_addon(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('whatsapp-platform', 'edit') then
    raise exception 'Not authorized to manage WhatsApp Platform packages' using errcode = '42501';
  end if;
  delete from public.whatsapp_platform_addons where id = p_id;
end;
$$;

create or replace function public.whatsapp_platform_admin_save_rates(p_rates jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('whatsapp-platform', 'edit') then
    raise exception 'Not authorized to manage WhatsApp Platform packages' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_rates, '{}'::jsonb)) <> 'object' then
    raise exception 'Rates must be a JSON object' using errcode = '22023';
  end if;
  insert into public.whatsapp_platform_pricing_rates (id, rates, updated_at)
  values (1, p_rates, now())
  on conflict (id) do update set rates = excluded.rates, updated_at = now();
  return p_rates;
end;
$$;

-- ------------------------------------------------------------------ grants
revoke all on function public.whatsapp_platform_admin_catalog() from public, anon;
revoke all on function public.whatsapp_platform_admin_upsert_plan(uuid, text, text, text, text, numeric, numeric, text, text, text, text, text, text, jsonb, boolean, boolean, integer) from public, anon;
revoke all on function public.whatsapp_platform_admin_delete_plan(uuid) from public, anon;
revoke all on function public.whatsapp_platform_admin_upsert_addon(uuid, text, text, text, text, text, boolean, integer) from public, anon;
revoke all on function public.whatsapp_platform_admin_delete_addon(uuid) from public, anon;
revoke all on function public.whatsapp_platform_admin_save_rates(jsonb) from public, anon;

grant execute on function public.whatsapp_platform_admin_catalog() to authenticated, service_role;
grant execute on function public.whatsapp_platform_admin_upsert_plan(uuid, text, text, text, text, numeric, numeric, text, text, text, text, text, text, jsonb, boolean, boolean, integer) to authenticated, service_role;
grant execute on function public.whatsapp_platform_admin_delete_plan(uuid) to authenticated, service_role;
grant execute on function public.whatsapp_platform_admin_upsert_addon(uuid, text, text, text, text, text, boolean, integer) to authenticated, service_role;
grant execute on function public.whatsapp_platform_admin_delete_addon(uuid) to authenticated, service_role;
grant execute on function public.whatsapp_platform_admin_save_rates(jsonb) to authenticated, service_role;

grant execute on function public.whatsapp_platform_public_catalog() to anon, authenticated, service_role;

comment on function public.whatsapp_platform_public_catalog() is
  'Public, anon-readable pricing catalog (active plans, add-ons and calculator rates) for the WhatsApp Platform pricing page.';

notify pgrst, 'reload schema';
