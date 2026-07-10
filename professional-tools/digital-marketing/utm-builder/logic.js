function enc(s){return encodeURIComponent(String(s||'').trim().replace(/\s+/g,'-'));}
export function compute(v){
  const base=(v.url||'').trim().replace(/\?.*$/,'');
  const params=[['utm_source',v.source||'google'],['utm_medium',v.medium||'cpc'],['utm_campaign',v.campaign||'campaign']];
  if(v.term&&v.term.trim())params.push(['utm_term',v.term]);
  if(v.content&&v.content.trim())params.push(['utm_content',v.content]);
  const qs=params.map(([k,val])=>k+'='+enc(val)).join('&');
  const full=base+'?'+qs;
  const rows=params.map(([k,val])=>[k,'',enc(val)]);
  rows.unshift(['Base URL','',base]);
  rows.push(['Full UTM URL','',full]);
  return{rows,k1:full,k2:params.length+' params',k3:full.length};}
