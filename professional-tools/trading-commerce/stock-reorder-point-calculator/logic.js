const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const daily=+v.daily_demand||50,lt=+v.lead_time_days||7;
  const maxDaily=+v.max_daily_demand||80,annDem=+v.annual_demand||18000;
  const orderCost=+v.ordering_cost||500,uc=+v.unit_cost||400,holdR=+v.holding_rate||25;
  const safetyStock=Math.round((maxDaily-daily)*lt);
  const rop=Math.round(daily*lt+safetyStock);
  const holdCostUnit=Math.round(uc*holdR/100);
  const eoq=Math.round(Math.sqrt(2*annDem*orderCost/holdCostUnit));
  const ordersPerYear=Math.round(annDem/eoq*10)/10;
  const totalHoldCost=Math.round(eoq/2*holdCostUnit);
  const totalOrderCost=Math.round(ordersPerYear*orderCost);
  return{
    rows:[
      ['Safety Stock','('+maxDaily+'−'+daily+') × '+lt+' days',safetyStock+' units'],
      ['Reorder Point (ROP)',daily+' × '+lt+' + '+safetyStock,rop+' units'],
      ['EOQ','√(2 × '+annDem+' × ₹'+orderCost+' / ₹'+holdCostUnit+')',eoq+' units'],
      ['Orders per Year',annDem+' / '+eoq,ordersPerYear],
      ['Annual Holding Cost (EOQ)','',inr(totalHoldCost)],
      ['Annual Ordering Cost','',inr(totalOrderCost)]],
    k1:rop+' units',k2:safetyStock+' units',k3:eoq+' units'};
}
