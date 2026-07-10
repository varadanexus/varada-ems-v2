const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const open=+v.opening_stock_value||2000000,purch=+v.purchases||5000000;
  const close=+v.closing_stock_value||1700000,cogs=+v.cogs||5100000,gm=+v.gross_margin_pct||25;
  const expectedClose=open+purch-cogs;
  const shrinkage=Math.max(0,expectedClose-close);
  const totalGoods=open+purch;
  const shrinkRate=Math.round(shrinkage/totalGoods*1000)/10;
  const recoverySales=gm>0?Math.round(shrinkage/(gm/100)):0;
  return{
    rows:[
      ['Opening Stock','',inr(open)],
      ['Purchases','',inr(purch)],
      ['COGS','',inr(cogs)],
      ['Expected Closing Stock','Open + Purch − COGS',inr(expectedClose)],
      ['Actual Closing Stock','',inr(close)],
      ['Shrinkage / Loss','Expected − Actual',inr(shrinkage)],
      ['Recovery Sales Needed','Shrinkage / '+gm+'% margin',inr(recoverySales)]],
    k1:inr(shrinkage),k2:shrinkRate+'%',k3:inr(recoverySales)};
}
