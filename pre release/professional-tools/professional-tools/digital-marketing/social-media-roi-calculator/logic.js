const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const spend=+v.monthly_spend||30000,team=+v.team_cost||20000,reach=+v.reach||50000;
  const leads=+v.leads||80,cr=+v.close_rate||10,dv=+v.deal_value||5000;
  const totalCost=spend+team;
  const sales=Math.round(leads*cr/100);
  const revenue=sales*dv;
  const roi=totalCost>0?(revenue-totalCost)/totalCost*100:0;
  const cpl=leads>0?totalCost/leads:0;
  const rows=[['Monthly reach','',reach.toLocaleString('en-IN')],['Leads generated','',leads],['Sales ('+cr+'% close)','',sales],['Revenue','',inr(revenue)],['Total cost (spend+team)','',inr(totalCost)],['Net profit','',inr(revenue-totalCost)],['ROI','',Math.round(roi)+'%'],['Cost per lead','',inr(Math.round(cpl))]];
  return{rows,k1:inr(revenue),k2:Math.round(roi)+'%',k3:inr(Math.round(cpl))};}
