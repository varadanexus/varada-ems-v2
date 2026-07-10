export function compute(v){const a=+v.area||0,s=+v.speed||1,d=+v.design||0,con=a/s,fin=con*0.25,tot=d+con+fin;
 const r=n=>Math.round(n*10)/10;
 const rows=[['Design & approvals','',r(d)],['Construction','@ '+s+' sqft/mo',r(con)],['Finishing & MEP','~25%',r(fin)],['Total','',r(tot)]];
 return{rows,k1:r(tot)+' months',k2:r(con)+' months',k3:r(d)+' months'};}
