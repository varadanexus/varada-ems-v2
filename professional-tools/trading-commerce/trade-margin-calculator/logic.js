const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const pp=+v.purchase_price||800,sp=+v.selling_price||1200,qty=+v.quantity||500;
  const oh=+v.overhead_per_unit||60,taxR=+v.tax_rate||18;
  const revenue=sp*qty;
  const cogs=pp*qty;
  const grossProfit=revenue-cogs;
  const grossMargin=Math.round(grossProfit/revenue*1000)/10;
  const markup=Math.round((sp-pp)/pp*1000)/10;
  const netProfit=grossProfit-oh*qty;
  const netMargin=Math.round(netProfit/revenue*1000)/10;
  const tax=Math.round(revenue*taxR/100);
  const roc=Math.round(netProfit/cogs*1000)/10;
  return{
    rows:[
      ['Revenue',qty+' × ₹'+sp,inr(revenue)],
      ['COGS',qty+' × ₹'+pp,inr(cogs)],
      ['Gross Profit','',inr(grossProfit)],
      ['Overheads',qty+' × ₹'+oh,inr(oh*qty)],
      ['Net Profit','',inr(netProfit)],
      ['Markup %','(SP−PP)/PP',markup+'%'],
      ['Return on Cost','Profit / COGS',roc+'%']],
    k1:grossMargin+'%',k2:netMargin+'%',k3:inr(netProfit)};
}
