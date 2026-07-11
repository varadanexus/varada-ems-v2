const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const P=+v.monthly||0, i=(+v.annualReturn||0)/1200, n=(+v.years||0)*12;
  const fv = i>0 ? P*((Math.pow(1+i,n)-1)/i)*(1+i) : P*n;
  const invested=P*n, gains=fv-invested;
  const rows=[['Monthly investment','x '+n+' months',inr(P)],['Total invested','',inr(invested)],['Estimated gains','',inr(gains)],['Maturity value','',inr(fv)]];
  return {rows,k1:inr(fv),k2:inr(invested),k3:inr(gains)};
}
