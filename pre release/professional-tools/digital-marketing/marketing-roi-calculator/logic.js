const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN'); const pc=n=>(Math.round(n*10)/10)+'%'; const x=n=>(Math.round(n*100)/100)+'x';
export function compute(v){
  const rev=+v.revenue||0, cost=+v.cost||0, profit=rev-cost, roi=cost>0?profit/cost*100:0, roas=cost>0?rev/cost:0;
  const rows=[['Revenue','',inr(rev)],['Marketing spend','',inr(cost)],['Net profit','',inr(profit)],['ROI','',pc(roi)],['ROAS','',x(roas)]];
  return {rows,k1:pc(roi),k2:x(roas),k3:inr(profit)};
}
