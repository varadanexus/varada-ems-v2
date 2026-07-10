const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const prod=+v.production_mt||50000,rd=+v.road_distance||50;
  const rrk=+v.road_rate_per_mt_km||3.5,rail=+v.rail_freight_per_mt||400;
  const port=+v.port_handling||120,load=+v.loading_charges||80;
  const roadPerMT=Math.round(rd*rrk);
  const totalPerMT=roadPerMT+rail+port+load;
  const totalMonthly=Math.round(totalPerMT*prod);
  const pct=Math.round(totalPerMT/4500*1000)/10;
  return{
    rows:[
      ['Road Haulage',rd+' km × ₹'+rrk+'/MT/km',inr(roadPerMT*prod)],
      ['Rail Freight',inr(rail)+'/MT',inr(rail*prod)],
      ['Port Handling / Stacking',inr(port)+'/MT',inr(port*prod)],
      ['Loading / Unloading',inr(load)+'/MT',inr(load*prod)],
      ['Total Logistics',inr(totalPerMT)+'/MT',inr(totalMonthly)]],
    k1:inr(totalPerMT)+'/MT',k2:inr(totalMonthly),k3:pct+'%'};
}
