const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const area=+v.mine_area_ha||100,dump=+v.waste_dump_area||30;
  const wtYrs=+v.water_treatment_years||5,wtPA=+v.water_treatment_cost_pa||2000000;
  const tsCost=+v.topsoil_cost_per_ha||500000,afCost=+v.afforestation_cost_per_ha||300000;
  const demo=+v.demolition_cost||5000000,contPct=+v.contingency_pct||20;
  const totalArea=area+dump;
  const waterTotal=Math.round(wtYrs*wtPA);
  const topsoil=Math.round(totalArea*tsCost);
  const afforestation=Math.round(totalArea*afCost);
  const directCosts=waterTotal+topsoil+afforestation+demo;
  const contingency=Math.round(directCosts*contPct/100);
  const total=directCosts+contingency;
  const annualBG=Math.round(total/5);
  const perHa=Math.round(total/area);
  return{
    rows:[
      ['Water Treatment',wtYrs+' years × '+inr(wtPA),inr(waterTotal)],
      ['Topsoil Replacement',totalArea+' ha × '+inr(tsCost),inr(topsoil)],
      ['Afforestation',totalArea+' ha × '+inr(afCost),inr(afforestation)],
      ['Demolition & Decommissioning','',inr(demo)],
      ['Contingency',contPct+'%',inr(contingency)],
      ['Total Closure Cost','',inr(total)]],
    k1:inr(total),k2:inr(annualBG)+'/year',k3:inr(perHa)+'/ha'};
}
