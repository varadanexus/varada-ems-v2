const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const flow=+v.water_inflow_m3h||200,head=+v.pump_head_m||100;
  const eff=+v.pump_efficiency||70,elecRate=+v.electricity_rate||7;
  const treatCost=+v.treatment_cost_per_m3||8,hrsDay=+v.operating_hours_day||20;
  // Power = (m3/s × head × density × g) / efficiency
  const flowMs=flow/3600;
  const powerKW=Math.round(flowMs*head*1000*9.81/(eff/100*1000)*10)/10;
  const kwhPerDay=Math.round(powerKW*hrsDay);
  const waterM3Day=Math.round(flow*hrsDay);
  const elecCostDay=Math.round(kwhPerDay*elecRate);
  const treatCostDay=Math.round(waterM3Day*treatCost);
  const totalDayCost=elecCostDay+treatCostDay;
  const monthlyTotal=totalDayCost*30;
  const perM3=Math.round(totalDayCost/waterM3Day*100)/100;
  return{
    rows:[
      ['Water Inflow',flow+' m³/hr × '+hrsDay+' hrs',waterM3Day.toLocaleString('en-IN')+' m³/day'],
      ['Pump Power',Math.round(flowMs*head*1000*9.81/1000)+' kW (theoretical) / '+eff+'% eff',powerKW+' kW'],
      ['Energy Consumed',powerKW+' × '+hrsDay+' hrs',kwhPerDay.toLocaleString('en-IN')+' kWh/day'],
      ['Electricity Cost','₹'+elecRate+'/kWh',inr(elecCostDay)+'/day'],
      ['Water Treatment',waterM3Day.toLocaleString('en-IN')+' m³ × ₹'+treatCost,inr(treatCostDay)+'/day'],
      ['Total Daily Cost','',inr(totalDayCost)],
      ['Monthly Total (30 days)','',inr(monthlyTotal)]],
    k1:inr(monthlyTotal),k2:inr(perM3)+'/m³',k3:powerKW+' kW'};
}
