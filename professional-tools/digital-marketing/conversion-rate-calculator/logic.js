const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const vis=+v.visitors||10000,conv=+v.conversions||200,aov=+v.order_value||2500,tcvr=+v.target_cvr||3;
  const cvr=vis>0?conv/vis*100:0;
  const rev=conv*aov;
  const targetConv=Math.round(vis*tcvr/100);
  const targetRev=targetConv*aov;
  const uplift=targetRev-rev;
  const extraConv=targetConv-conv;
  const rows=[['Visitors/month','',vis.toLocaleString('en-IN'),''],['Conversions/month',conv,'→ '+targetConv,''],['Conversion rate',Math.round(cvr*100)/100+'%','→ '+tcvr+'%',''],['Revenue/month',inr(rev),'→ '+inr(targetRev),''],['Revenue uplift','','',inr(uplift)]];
  return{rows:rows.map(r=>[r[0],r[1]+' → '+r[2],r[3]||'']),k1:Math.round(cvr*100)/100+'%',k2:inr(uplift)+'/mo',k3:extraConv+' more'};}
