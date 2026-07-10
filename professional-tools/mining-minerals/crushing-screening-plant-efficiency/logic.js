const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const design=+v.design_capacity_tph||200,actual=+v.actual_throughput_tph||160;
  const hrsDay=+v.operating_hours_day||16,dtHrs=+v.downtime_hours_month||40;
  const power=+v.power_consumption_kw||500,elec=+v.electricity_rate||7;
  const maint=+v.maintenance_monthly||300000;
  const availHrs=hrsDay*30-dtHrs;
  const monthlyOut=Math.round(actual*availHrs);
  const efficiency=Math.round(actual/design*1000)/10;
  const powerCostM=Math.round(power*availHrs*elec);
  const totalCost=powerCostM+maint;
  const costPerMT=monthlyOut>0?Math.round(totalCost/monthlyOut*100)/100:0;
  return{
    rows:[
      ['Design Capacity',design+' TPH',''],
      ['Actual Throughput',actual+' TPH',''],
      ['Plant Efficiency',actual+'/'+design+' TPH',efficiency+'%'],
      ['Available Hours',hrsDay*30+' - '+dtHrs+' downtime',availHrs+' hrs/month'],
      ['Monthly Output',actual+' TPH × '+availHrs+' hrs',monthlyOut.toLocaleString('en-IN')+' MT'],
      ['Power Cost',power+' kW × '+availHrs+' hrs × ₹'+elec,inr(powerCostM)],
      ['Maintenance','',inr(maint)],
      ['Processing Cost / MT',inr(totalCost)+' / '+monthlyOut,inr(costPerMT)+'/MT']],
    k1:monthlyOut.toLocaleString('en-IN')+' MT',k2:inr(costPerMT)+'/MT',k3:efficiency+'%'};
}
