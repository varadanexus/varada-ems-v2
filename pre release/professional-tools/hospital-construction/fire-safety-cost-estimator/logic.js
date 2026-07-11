const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){const a=+v.area||0,r=+v.rate||140,t=a*r;const S=[['Sprinklers',.4],['Hydrants & pumps',.3],['Detection & alarm',.2],['Extinguishers & signage',.1]];
 const rows=S.map(([n,p])=>[n,(p*100)+'%',inr(t*p)]);rows.push(['Total','',inr(t)]);
 return{rows,k1:inr(t),k2:inr(t*.4),k3:inr(r)};}
