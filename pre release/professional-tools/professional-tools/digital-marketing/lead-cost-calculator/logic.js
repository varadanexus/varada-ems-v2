const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const spend=+v.spend||50000,imp=+v.impressions||100000,clicks=+v.clicks||2000;
  const lcp=+v.landing_conv||5,qual=+v.lead_qual||60;
  const ctr=clicks/imp*100;
  const leads=Math.round(clicks*lcp/100);
  const qualLeads=Math.round(leads*qual/100);
  const cpl=leads>0?spend/leads:0;
  const cpql=qualLeads>0?spend/qualLeads:0;
  const rows=[['Impressions','',imp.toLocaleString('en-IN')],['Clicks','CTR '+Math.round(ctr*100)/100+'%',clicks.toLocaleString('en-IN')],['Leads ('+lcp+'% conv)','',leads],['Qualified leads ('+qual+'%)','',qualLeads],['Cost per lead (CPL)','',inr(Math.round(cpl))],['Cost per qualified lead','',inr(Math.round(cpql))]];
  return{rows,k1:inr(Math.round(cpl)),k2:leads,k3:qualLeads};}
