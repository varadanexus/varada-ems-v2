const S=[['General Medicine',.25],['Surgery',.20],['OB-GYN',.15],['ICU / Critical',.12],['Orthopaedics',.10],['Paediatrics',.10],['Cardiology',.08]];
export function compute(v){const b=+v.beds||0;const rows=S.map(([n,p])=>[n,(p*100)+'%',Math.round(b*p)]);
 return{rows,k1:Math.round(b*.25)+' beds',k2:Math.round(b*.20)+' beds',k3:Math.round(b*.12)+' beds'};}
