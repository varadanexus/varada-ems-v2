const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const spY=+v.shipments_per_year||12,asv=+v.avg_shipment_value||1500000;
  const marginPct=+v.avg_margin_pct||15,wcDays=+v.working_capital_days||90;
  const finRate=+v.finance_rate||10,fixOH=+v.fixed_overheads||1200000;
  const turnover=spY*asv;
  const grossProfit=Math.round(turnover*marginPct/100);
  const wc=Math.round(asv*wcDays/365);
  const financeCost=Math.round(wc*finRate/100);
  const netProfit=grossProfit-fixOH-financeCost;
  const netMargin=Math.round(netProfit/turnover*1000)/10;
  return{
    rows:[
      ['Annual Turnover',spY+' × ₹'+asv.toLocaleString('en-IN'),inr(turnover)],
      ['Gross Profit (Trade Margin)',marginPct+'%',inr(grossProfit)],
      ['Fixed Overheads','Annual',inr(fixOH)],
      ['Working Capital',asv.toLocaleString('en-IN')+' × '+wcDays+'/365',inr(wc)],
      ['Finance Cost on WC',finRate+'% p.a.',inr(financeCost)],
      ['Net Annual Profit','',inr(netProfit)]],
    k1:inr(turnover),k2:inr(netProfit),k3:inr(wc)};
}
