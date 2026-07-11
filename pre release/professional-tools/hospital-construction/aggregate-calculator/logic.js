export function compute(v){const vol=+v.vol||0,[c,s,a]=(v.grade||'1-1.5-3').split('-').map(Number),tot=c+s+a,dry=vol*1.54;
 const aggM=dry*(a/tot),agg=aggM*35.315,bags=dry*(c/tot)*1440/50;
 const rows=[['Aggregate','',Math.round(agg)+' cft'],['Aggregate (m³)','',(Math.round(aggM*100)/100)+' m³'],['Cement','',Math.ceil(bags)+' bags']];
 return{rows,k1:Math.round(agg)+' cft',k2:(Math.round(aggM*100)/100)+' m³',k3:Math.ceil(bags)+' bags'};}
