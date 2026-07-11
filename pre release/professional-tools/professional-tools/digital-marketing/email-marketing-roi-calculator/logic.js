const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const ls=+v.list_size||10000,op=+v.open_rate||22,cr=+v.ctr||3,cv=+v.conv_rate||5,aov=+v.aov||2000,cost=+v.cost||8000;
  const opens=Math.round(ls*op/100);
  const clicks=Math.round(opens*cr/100);
  const buyers=Math.round(clicks*cv/100);
  const revenue=buyers*aov;
  const roi=cost>0?(revenue-cost)/cost*100:0;
  const rpe=revenue/ls;
  const rows=[['Emails sent','',ls.toLocaleString('en-IN')],['Opens ('+op+'%)','',opens.toLocaleString('en-IN')],['Clicks ('+cr+'% of opens)','',clicks],['Buyers ('+cv+'% of clicks)','',buyers],['Revenue','',inr(revenue)],['Campaign cost','',inr(cost)],['Net profit','',inr(revenue-cost)],['ROI','',Math.round(roi)+'%']];
  return{rows,k1:inr(revenue),k2:Math.round(roi)+'%',k3:'₹'+Math.round(rpe*100)/100};}
