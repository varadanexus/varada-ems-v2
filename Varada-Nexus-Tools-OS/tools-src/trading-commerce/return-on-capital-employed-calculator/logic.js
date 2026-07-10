const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const ebit=+v.ebit||1500000,fa=+v.fixed_assets||3000000;
  const ca=+v.current_assets||5000000,cl=+v.current_liabilities||2000000;
  const rev=+v.annual_revenue||15000000;
  const nwc=ca-cl;
  const ce=fa+nwc;
  const roce=ce>0?Math.round(ebit/ce*1000)/10:0;
  const assetTurnover=Math.round(rev/ce*100)/100;
  const ebitMargin=Math.round(ebit/rev*1000)/10;
  return{
    rows:[
      ['Fixed Assets','',inr(fa)],
      ['Net Working Capital','CA '+inr(ca)+' − CL '+inr(cl),inr(nwc)],
      ['Capital Employed','FA + NWC',inr(ce)],
      ['EBIT','Operating Profit',inr(ebit)],
      ['EBIT Margin',ebit+' / '+rev,ebitMargin+'%'],
      ['ROCE','EBIT / Capital Employed',roce+'%'],
      ['Asset Turnover','Revenue / CE',assetTurnover+'x']],
    k1:roce+'%',k2:assetTurnover+'x',k3:inr(ce)};
}
