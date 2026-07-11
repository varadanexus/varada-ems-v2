const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const mArea=+v.mine_area_ha||100,fArea=+v.forest_area_ha||20;
  const npvPerHa=+v.npv_per_ha||1000000,caRatio=+v.ca_ratio||2;
  const afCost=+v.afforestation_cost_per_ha||300000;
  const dustM=+v.dust_suppression_monthly||100000;
  const wtM=+v.water_treatment_monthly||150000,monA=+v.monitoring_annual||500000;
  const npvTotal=Math.round(fArea*npvPerHa);
  const caArea=Math.round(fArea*caRatio);
  const caTotal=Math.round(caArea*afCost);
  const oneTime=npvTotal+caTotal;
  const annualRecurring=Math.round((dustM+wtM)*12+monA);
  const fiveYear=oneTime+annualRecurring*5;
  return{
    rows:[
      ['NPV Levy',fArea+' ha × '+inr(npvPerHa),inr(npvTotal)],
      ['Compensatory Afforestation',caArea+' ha × '+inr(afCost),inr(caTotal)],
      ['Dust Suppression',inr(dustM)+'/month × 12',inr(dustM*12)],
      ['Mine Water Treatment',inr(wtM)+'/month × 12',inr(wtM*12)],
      ['Env. Monitoring & Audit','Annual',inr(monA)],
      ['Annual Recurring Total','',inr(annualRecurring)],
      ['5-Year Total Cost','',inr(fiveYear)]],
    k1:inr(oneTime),k2:inr(annualRecurring),k3:inr(fiveYear)};
}
