export function compute(v){const vol=+v.vol||0,[c,s,a]=(v.grade||'1-1.5-3').split('-').map(Number),tot=c+s+a,dry=vol*1.54;
 const bags=dry*(c/tot)*1440/50,sand=dry*(s/tot)*35.315,agg=dry*(a/tot)*35.315;
 const rows=[['Cement','1440 kg/m³',Math.ceil(bags)+' bags'],['Sand','',Math.round(sand)+' cft'],['Aggregate','',Math.round(agg)+' cft']];
 return{rows,k1:Math.ceil(bags)+' bags',k2:Math.round(sand)+' cft',k3:Math.round(agg)+' cft'};}
