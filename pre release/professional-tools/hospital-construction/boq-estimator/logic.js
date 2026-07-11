const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){const a=+v.area||0,r=+v.rate||0,t=a*r;const S=[['Substructure',.15],['Superstructure',.30],['Finishes',.25],['MEP',.22],['External & site',.08]];
 const rows=S.map(([n,p])=>[n,(p*100)+'%',inr(t*p)]);rows.push(['Total','',inr(t)]);
 return{rows,k1:inr(t),k2:inr(t*.30),k3:inr(t*.25)};}
