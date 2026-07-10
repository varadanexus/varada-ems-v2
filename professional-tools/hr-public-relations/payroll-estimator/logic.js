const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const b1c=+v.band1_count||0,b1s=+v.band1_ctc||0,b2c=+v.band2_count||0,b2s=+v.band2_ctc||0,b3c=+v.band3_count||0,b3s=+v.band3_ctc||0,bm=+v.bonus_month||1;
  const bands=[['Junior',b1c,b1s],['Mid-level',b2c,b2s],['Senior',b3c,b3s]];
  const rows=bands.filter(b=>b[1]>0).map(([n,c,s])=>[n,c,inr(Math.round(c*s))]);
  const total=bands.reduce((a,[,c,s])=>a+c*s,0);
  const bonus=bands.reduce((a,[,c,s])=>a+c*(s/12)*bm,0);
  const grand=total+bonus;
  const headcount=b1c+b2c+b3c;
  rows.push(['Annual bonus','',inr(Math.round(bonus))]);
  rows.push(['TOTAL',headcount,inr(Math.round(grand))]);
  return{rows,k1:inr(Math.round(grand/12))+'/mo',k2:inr(Math.round(grand))+'/yr',k3:headcount+' employees'};}
