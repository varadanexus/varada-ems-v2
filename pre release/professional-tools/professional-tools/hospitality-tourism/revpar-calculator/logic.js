const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const r=+v.rooms||0,adr=+v.adr||0,o=+v.occ||0;
  const revpar=adr*o/100, daily=r*revpar, monthly=daily*30;
  const rows=[['RevPAR','ADR x occupancy',inr(revpar)],['Daily room revenue','',inr(daily)],['Monthly room revenue','x 30 days',inr(monthly)]];
  return {rows,k1:inr(revpar),k2:inr(daily),k3:inr(monthly)};
}
