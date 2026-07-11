const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const cogs=+v.cogs_annual||5000000;
  const open=+v.opening_inventory||800000,close=+v.closing_inventory||600000;
  const holdR=+v.holding_cost_pct||20;
  const avgInv=(open+close)/2;
  const turnover=Math.round(cogs/avgInv*100)/100;
  const dsi=Math.round(365/turnover);
  const holdCost=Math.round(avgInv*holdR/100);
  const costPerDay=Math.round(holdCost/365);
  return{
    rows:[
      ['COGS (Annual)','',inr(cogs)],
      ['Average Inventory','('+inr(open)+'+'+inr(close)+')/2',inr(avgInv)],
      ['Turnover Ratio','COGS / Avg Inv',turnover+'x'],
      ['Days Sales in Inventory','365 / Turnover',dsi+' days'],
      ['Annual Holding Cost',holdR+'% of Avg Inv',inr(holdCost)],
      ['Daily Holding Cost','',inr(costPerDay)+'/day']],
    k1:turnover+'x',k2:dsi+' days',k3:inr(holdCost)};
}
