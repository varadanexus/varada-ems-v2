const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const P=+v.principal||0, r=+v.rate||0, t=+v.years||0, f=+v.comp||1;
  const A=P*Math.pow(1+r/(100*f), f*t), interest=A-P;
  const rows=[['Principal','',inr(P)],['Interest earned','@ '+r+'% p.a.',inr(interest)],['Maturity value','after '+t+' yr',inr(A)]];
  return {rows,k1:inr(A),k2:inr(interest),k3:inr(P)};
}
