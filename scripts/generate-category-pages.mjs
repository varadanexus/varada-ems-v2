// Generates static, SEO-indexable category pages at /blog/category/<slug>/index.html
// and refreshes the category section of sitemap.xml.
// Run locally: node scripts/generate-category-pages.mjs
// Static pages ensure crawlable URLs on GitHub Pages; posts load client-side.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://www.varadanexus.com";

// Keep in sync with the blog_categories seed in
// new-ems/supabase/migrations/20260708150000_sprint18b_blog_platform_v2.sql
const CATEGORIES = [
  ["healthcare", "Healthcare", "Hospital infrastructure, healthcare systems, medical technology and health policy — analysis grounded in Varada Nexus's healthcare execution experience across India."],
  ["ems", "EMS", "Enterprise management systems: operations platforms, workflow digitisation and the systems that run multi-sector businesses like Varada Nexus."],
  ["artificial-intelligence", "Artificial Intelligence", "How AI is reshaping Indian enterprises — practical adoption stories, automation opportunities and the policy developments that govern them."],
  ["business", "Business", "Business strategy, market movements, corporate developments and execution insight across India's key sectors."],
  ["startups", "Startups", "India's startup ecosystem: funding trends, government policy, scaling lessons and sector opportunities for founders and operators."],
  ["cybersecurity", "Cybersecurity", "Security threats, regulation and defensive practice for enterprises operating digital systems and handling sensitive data."],
  ["saas", "SaaS", "Software-as-a-service business models, tooling decisions and the fast-growing Indian SaaS landscape."],
  ["software-development", "Software Development", "Engineering practice, architecture choices and delivery discipline for building reliable business software."],
  ["web-development", "Web Development", "Modern web platforms, performance engineering and the technologies behind effective business websites."],
  ["cloud-computing", "Cloud Computing", "Cloud infrastructure, migration strategy and cost management for Indian enterprises moving workloads online."],
  ["digital-transformation", "Digital Transformation", "Digitising operations across healthcare, logistics, trade and commerce — lessons from real enterprise execution."],
  ["marketing", "Marketing", "Growth, brand building and demand generation for multi-sector businesses in Indian and global markets."],
  ["seo", "SEO", "Search visibility, content strategy and technical SEO for business websites that need to be found."],
  ["finance", "Finance", "Banking, markets, taxation, GST and the financial policy landscape affecting Indian businesses."],
  ["education", "Education", "Skilling, workforce education and the learning systems that build capable teams."],
  ["global-news", "Global News", "World events and international developments that matter to Indian enterprises — trade, technology and policy."],
  ["technology", "Technology", "Broader technology shifts and what they mean for day-to-day business operations."],
  ["automation", "Automation", "Process automation, robotics and workflow efficiency across healthcare, logistics and commerce."],
  ["logistics", "Logistics", "Freight, transport, mining logistics, supply chains and the movement of trade across India."],
  ["mining", "Mining", "Mining operations, mineral resources, regulation and the commodity supply chains that move India's raw materials."],
  ["import-export", "Import & Export", "Global trade execution — sourcing, customs, DGFT policy, tariffs, FTAs and the mechanics of moving goods across borders."],
  ["ecommerce", "E-Commerce", "Online retail, marketplaces, ONDC, storefront strategy and growing digital commerce businesses in India."],
  ["hr", "HR & PR", "Recruitment, workforce structuring, labour policy, branding and public relations for growing enterprises."],
  ["interior-design", "Interior Design", "Commercial and healthcare interior design — planning, materials, execution and creating functional professional spaces."],
  ["arbitrage", "Strategic Arbitrage", "Deal structuring, regulatory strategy, market positioning and financial modelling for strategic advantage."],
];

function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

function pageHtml(slug, name, intro) {
  const url = `${SITE}/blog/category/${slug}/`;
  const otherLinks = CATEGORIES.filter(([s]) => s !== slug).slice(0, 8)
    .map(([s, n]) => `<a class="chip" href="/blog/category/${s}/">${esc(n)}</a>`).join("\n        ");
  const breadcrumb = JSON.stringify({
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE + "/" },
      { "@type": "ListItem", position: 2, name: "Insights", item: SITE + "/blog/" },
      { "@type": "ListItem", position: 3, name, item: url },
    ],
  });
  const collection = JSON.stringify({
    "@context": "https://schema.org", "@type": "CollectionPage",
    name: `${name} — Varada Nexus Insights`, description: intro, url,
  });
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(name)} Insights — Varada Nexus</title>
<meta name="description" content="${esc(intro)}">
<link rel="canonical" href="${url}">
<link rel="icon" type="image/png" href="/images/logo.png">
<meta property="og:title" content="${esc(name)} Insights — Varada Nexus">
<meta property="og:description" content="${esc(intro)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/images/logo.png">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(name)} Insights — Varada Nexus">
<meta name="twitter:description" content="${esc(intro)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700;800&display=swap">
<link rel="stylesheet" href="/assets/site.css">
<script type="application/ld+json">${breadcrumb}</script>
<script type="application/ld+json">${collection}</script>
<style>
  .cat-chips{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:18px 0 0}
  .chip{font-size:12.5px;padding:6px 14px;border-radius:99px;border:1px solid var(--border,#333);background:var(--surface,#161616);color:var(--text-2,#bbb);text-decoration:none}
  .chip:hover{border-color:var(--border-gold,#a8873a);color:var(--gold,#c8a456)}
</style>
</head>
<body>
<div class="ambient"></div>

<header class="site-nav">
  <div class="nav-inner">
    <a class="nav-brand" href="/">
      <img src="/images/logo.png" alt="Varada Nexus logo">
      <span><span class="b-name">Varada <span class="gold-text">Nexus</span></span><span class="b-sub">Private Limited</span></span>
    </a>
    <button class="nav-toggle" aria-label="Menu"><span></span><span></span><span></span></button>
    <nav class="nav-links">
      <a href="/">Home</a>
      <a href="/founder.html">Founder</a>
      <a href="/services.html">Services</a>
      <a href="/team.html">Team</a>
      <a href="/blog/" class="active">Blog</a>
      <a href="/contact.html">Contact</a>
      <a href="/login.html">Login</a>
    </nav>
  </div>
</header>

<main>
  <section class="page-hero">
    <span class="eyebrow reveal"><a href="/blog/" style="color:inherit;text-decoration:none">Insights</a> / ${esc(name)}</span>
    <h1 class="display reveal reveal-d1" style="font-size:clamp(34px,5vw,60px)">${esc(name)}</h1>
    <p class="sub reveal reveal-d2">${esc(intro)}</p>
    <div class="cat-chips">
      <a class="chip" href="/blog/">All insights</a>
        ${otherLinks}
    </div>
  </section>

  <div class="divider"></div>

  <section class="section">
    <div class="wrap">
      <div id="posts" class="grid grid-3" aria-live="polite">
        <p class="blog-status">Loading ${esc(name)} posts&hellip;</p>
      </div>
    </div>
  </section>
</main>

<footer class="site-footer">
  <div class="wrap">
    <div class="footer-bottom">
      <span>&copy; <span data-year>2026</span> Varada Nexus Private Limited. All rights reserved.</span>
      <span>Rajahmundry, Andhra Pradesh, India</span>
    </div>
  </div>
</footer>

<script src="/assets/site.js"></script>
<script src="/new-ems/config/runtime.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script>
(function () {
  var CAT = ${JSON.stringify(slug)};
  var cfg = window.EMS_RUNTIME_CONFIG || {};
  var wrap = document.getElementById("posts");
  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabaseAnonKey) { wrap.innerHTML = '<p class="blog-status">Loading&hellip; please refresh in a moment.</p>'; return; }
  var sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  function esc(s){ return (s||"").replace(/[&<>"']/g, function(c){ return ({"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","'":"&#39;"})[c]; }); }
  function fmtDate(d){ if(!d) return ""; try { return new Date(d).toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"}); } catch(e){ return ""; } }
  function card(p){
    var tags=(p.tags||[]).slice(0,3).map(function(t){return '<span>'+esc(t)+'</span>';}).join("");
    return '<a class="card blog-card reveal in" href="/blog/post.html?slug='+encodeURIComponent(p.slug)+'">'
      + '<div class="blog-meta">'+esc(fmtDate(p.published_at))+(p.author?' &middot; '+esc(p.author):'')+'</div>'
      + '<h3>'+esc(p.title)+'</h3>'+(p.excerpt?'<p>'+esc(p.excerpt)+'</p>':'')
      + (tags?'<div class="blog-tags">'+tags+'</div>':'')+'<span class="card-more">Read more &rarr;</span></a>';
  }
  sb.rpc("search_blog_posts", { cat: CAT, lim: 60 }).then(function(res){
    var rows = (res.data)||[];
    if (res.error || !rows.length) { wrap.innerHTML = '<div class="blog-empty"><h3>No posts in this category yet</h3><p>New insights are published daily. Meanwhile, browse <a href="/blog/">all insights</a>.</p></div>'; return; }
    wrap.innerHTML = rows.map(card).join("");
  });
})();
</script>
</body>
</html>
`;
}

let made = 0;
for (const [slug, name, intro] of CATEGORIES) {
  const dir = join(ROOT, "blog", "category", slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), pageHtml(slug, name, intro));
  made++;
}
console.log(`Generated ${made} category pages under blog/category/`);

// --- sitemap.xml: refresh category entries ---
const smPath = join(ROOT, "sitemap.xml");
if (existsSync(smPath)) {
  let sm = readFileSync(smPath, "utf8");
  sm = sm.replace(/\s*<!-- blog-categories:start -->[\s\S]*?<!-- blog-categories:end -->/g, "");
  const entries = CATEGORIES.map(([slug]) =>
    `  <url><loc>${SITE}/blog/category/${slug}/</loc><changefreq>daily</changefreq><priority>0.7</priority></url>`
  ).join("\n");
  sm = sm.replace("</urlset>", `  <!-- blog-categories:start -->\n${entries}\n  <!-- blog-categories:end -->\n</urlset>`);
  writeFileSync(smPath, sm);
  console.log("sitemap.xml updated with category URLs");
}
