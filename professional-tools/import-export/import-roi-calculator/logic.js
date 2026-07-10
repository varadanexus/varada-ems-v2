const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const lc=+v.landed_cost||1200,sp=+v.selling_price||1800,qty=+v.quantity||500;
  const oh=+v.overheads||100,wcc=+v.working_capital_cost||30000,days=+v.finance_days||90;
  const revenue=sp*qty;
  const totalCost=lc*qty+oh*qty+wcc;
  const profit=revenue-totalCost;
  const roi=Math.round(profit/totalCost*1000)/10;
  const margin=Math.round(profit/revenue*1000)/10;
  const annRoi=Math.round(roi*(365/days)*10)/10;
  return{
    rows:[
      ['Revenue',qty+' × ₹'+sp,inr(revenue)],
      ['Landed Cost',qty+' × ₹'+lc,inr(lc*qty)],
      ['Overheads',qty+' × ₹'+oh,inr(oh*qty)],
      ['Working Capital Finance Cost','',inr(wcc)],
      ['Total Investment','',inr(totalCost)],
      ['Net Profit','',inr(profit)],
      ['Annualised ROI','('+days+' day cycle)',annRoi+'%']],
    k1:inr(profit),k2:roi+'%',k3:margin+'%'};
}
