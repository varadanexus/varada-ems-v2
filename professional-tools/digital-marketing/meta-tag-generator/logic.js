function trunc(s,n){return s.length>n?s.slice(0,n-3)+'...':s;}
export function compute(v){
  const brand=v.brand||'Your Brand';
  const kw=v.primary_kw||'keyword';
  const topic=v.page_topic||'Service';
  const benefit=v.benefit||'Expert help';
  const loc=v.location?v.location+' ':'';
  const title=kw.charAt(0).toUpperCase()+kw.slice(1)+' — '+topic+' | '+brand;
  const desc=benefit+'. '+kw.charAt(0).toUpperCase()+kw.slice(1)+' services in '+loc+'by '+brand+'. Get started today.';
  const titleT=trunc(title,60);
  const descT=trunc(desc,158);
  const html='<title>'+titleT+'</title>\n<meta name="description" content="'+descT+'">';
  const rows=[['Title tag',titleT.length+' chars',titleT],['Meta description',descT.length+' chars',descT],['HTML output','','Copy below'],['<title>','',titleT],['<meta name="description"','',descT]];
  return{rows,k1:titleT,k2:descT,k3:titleT.length+' chars'};}
