const inr=n=>'₹'+(Math.round(n*100)/100).toLocaleString('en-IN'); const pc=n=>(Math.round(n*100)/100)+'%';
export function compute(v){
  const s=+v.spend||0,imp=+v.impressions||0,cl=+v.clicks||0,cv=+v.conversions||0;
  const cpc=cl>0?s/cl:0,cpm=imp>0?s/imp*1000:0,ctr=imp>0?cl/imp*100:0,cr=cl>0?cv/cl*100:0,cpa=cv>0?s/cv:0;
  const rows=[['CPC','spend ÷ clicks',inr(cpc)],['CPM','per 1000 impressions',inr(cpm)],['CTR','clicks ÷ impressions',pc(ctr)],['Conversion rate','conv ÷ clicks',pc(cr)],['CPA','spend ÷ conversions',inr(cpa)]];
  return {rows,k1:inr(cpc),k2:pc(ctr),k3:inr(cpa)};
}
