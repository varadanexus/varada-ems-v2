export function compute(v){
  const pages=+v.pages||50,pillar=+v.pillar_pages||5,blog=+v.blog_posts||30,wc=+v.avg_wc||1200;
  const linksPerContent=Math.max(3,Math.round(wc/250));
  const pillarLinks=pillar*blog; // each blog links to its pillar
  const blogLinks=blog*linksPerContent;
  const totalLinks=pillarLinks+blogLinks;
  const rows=[
   ['Links per blog post (1/250 words)','',linksPerContent+' links'],
   ['Links per pillar page (from all clusters)','',Math.round(blog/pillar)+' links'],
   ['Total blog-to-pillar links','',pillarLinks+' links'],
   ['Total blog internal links','',blogLinks+' links'],
   ['Grand total internal links','',totalLinks+' links'],
   ['Pillar pages','',pillar],['Blog posts','',blog]];
  return{rows,k1:Math.round(blog/pillar)+' links',k2:linksPerContent+' links',k3:totalLinks+' links'};}
