export function compute(v){const vol=+v.vol||0,[c,s,a]=(v.grade||'1-1.5-3').split('-').map(Number),tot=c+s+a,dry=vol*1.54;
 const sandM=dry*(s/tot),sand=sandM*35.315,bags=dry*(c/tot)*1440/50;
 const rows=[['Sand','',Math.round(sand)+' cft'],['Sand (m³)','',(Math.round(sandM*100)/100)+' m³'],['Cement','',Math.ceil(bags)+' bags']];
 return{rows,k1:Math.round(sand)+' cft',k2:(Math.round(sandM*100)/100)+' m³',k3:Math.ceil(bags)+' bags'};}
