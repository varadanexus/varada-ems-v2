const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){const b=+v.budget||0;const S=[['Civil',.45],['MEP & services',.22],['Equipment',.18],['Contingency',.06],['Preliminaries',.05],['Consultancy',.04]];
 const rows=S.map(([n,p])=>[n,(p*100)+'%',inr(b*p)]);
 return{rows,k1:inr(b*.45),k2:inr(b*.22),k3:inr(b*.18)};}
