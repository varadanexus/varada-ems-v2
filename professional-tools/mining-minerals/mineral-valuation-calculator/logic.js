const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const res=+v.resource_mt||1000000,grade=+v.head_grade||58,rec=+v.recovery_pct||85;
  const price=+v.commodity_price||4500,minCost=+v.mining_cost_per_mt||700,procCost=+v.processing_cost_per_mt||200;
  const productMT=Math.round(res*grade/100*rec/100);
  const grossValue=Math.round(productMT*price);
  const totalCost=Math.round(res*(minCost+procCost));
  const netValue=grossValue-totalCost;
  const perMTOre=Math.round(netValue/res);
  return{
    rows:[
      ['Resource / Reserve',res.toLocaleString('en-IN')+' MT ore',''],
      ['Head Grade',grade+'%',''],
      ['Metallurgical Recovery',rec+'%',''],
      ['Product Output',productMT.toLocaleString('en-IN')+' MT',''],
      ['Gross Revenue',productMT.toLocaleString('en-IN')+' × ₹'+price,inr(grossValue)],
      ['Total Mining + Processing Cost',inr(minCost+procCost)+'/MT ore',inr(totalCost)],
      ['Net Realisable Value','',inr(netValue)]],
    k1:inr(grossValue),k2:inr(netValue),k3:inr(perMTOre)+'/MT ore'};
}
