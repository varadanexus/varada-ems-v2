export function compute(v){
  const sitemap=(v.sitemap_url||'').trim();
  const lines=['User-agent: *'];
  const disallows=[];
  if(v.block_admin==='yes'){disallows.push('/admin/','/wp-admin/');}
  if(v.block_search==='yes'){disallows.push('/*?s=','/*?q=','/*?search=');}
  if(v.block_login==='yes'){disallows.push('/login/','/wp-login.php');}
  if(+v.crawl_delay>0)lines.push('Crawl-delay: '+(+v.crawl_delay));
  disallows.forEach(d=>lines.push('Disallow: '+d));
  lines.push('Allow: /');
  if(sitemap){lines.push('');lines.push('Sitemap: '+sitemap);}
  const content=lines.join('\n');
  const rows=lines.filter(l=>l).map(l=>[l,'','']);
  return{rows,k1:disallows.length+' disallow rules',k2:sitemap?'Yes':'No',k3:'Valid robots.txt generated'};}
