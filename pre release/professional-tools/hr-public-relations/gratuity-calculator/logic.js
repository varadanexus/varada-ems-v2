const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const s=+v.salary||0, y=+v.years||0; let g=(15/26)*s*y; const capped=g>2000000; if(capped)g=2000000;
  const rows=[['Last salary (Basic+DA)','',inr(s)],['Years of service','',y+' yr'],['Gratuity (15/26 x salary x years)','',inr((15/26)*s*y)],['Payable (after ₹20L cap)','',inr(g)]];
  return {rows,k1:inr(g),k2:y+' yr',k3:'15/26 x salary x years'};
}
