const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const c0=+v.current||500000,c30=+v.days_30_60||200000;
  const c60=+v.days_60_90||100000,c90=+v.days_90_plus||80000;
  const c180=+v.days_180_plus||40000,mSales=+v.monthly_sales||600000;
  const total=c0+c30+c60+c90+c180;
  const bd=Math.round(c0*0+c30*0.02+c60*0.10+c90*0.25+c180*0.50);
  const dso=Math.round(total/(mSales/30));
  const pct=r=>Math.round(r/total*1000)/10;
  return{
    rows:[
      ['0–30 days (Current)',inr(c0)+' ('+pct(c0)+'%)','0%'],
      ['31–60 days',inr(c30)+' ('+pct(c30)+'%)','2%'],
      ['61–90 days',inr(c60)+' ('+pct(c60)+'%)','10%'],
      ['91–180 days',inr(c90)+' ('+pct(c90)+'%)','25%'],
      ['180+ days',inr(c180)+' ('+pct(c180)+'%)','50%'],
      ['Bad Debt Provision','',inr(bd)]],
    k1:inr(total),k2:dso+' days',k3:inr(bd)};
}
