export function compute(v){
  const cogs=+v.cogs||0, inv=+v.inventory||0, turn=inv>0?cogs/inv:0, days=turn>0?365/turn:0;
  const rows=[['Inventory turnover','COGS ÷ avg inventory',(Math.round(turn*100)/100)+'x'],['Days inventory on hand','365 ÷ turnover',Math.round(days)+' days']];
  return {rows,k1:(Math.round(turn*100)/100)+'x',k2:Math.round(days)+' days',k3:(Math.round(turn*10)/10)+' turns/yr'};
}
