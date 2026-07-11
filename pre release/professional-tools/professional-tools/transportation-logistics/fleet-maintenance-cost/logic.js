const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const fs=+v.fleet_size||10,mkm=+v.monthly_km||8000,pm=+v.pm_cost_km||1.5,tyreLf=+v.tyre_km||60000,tyreCost=+v.tyre_set_cost||80000,annSvc=+v.annual_service||30000,brkdn=+v.breakdown_cost||5000;
  const pmPerVeh=Math.round(mkm*pm);
  const tyrePerVeh=Math.round(mkm/tyreLf*tyreCost);
  const svcPerVeh=Math.round(annSvc/12);
  const totalPerVeh=pmPerVeh+tyrePerVeh+svcPerVeh+brkdn;
  const fleetTotal=totalPerVeh*fs;
  const perKm=Math.round(totalPerVeh/mkm*100)/100;
  const rows=[['Preventive maintenance',inr(pmPerVeh),inr(pmPerVeh*fs)],['Tyre cost',inr(tyrePerVeh),inr(tyrePerVeh*fs)],['Annual service (monthly)',inr(svcPerVeh),inr(svcPerVeh*fs)],['Breakdown / repairs',inr(brkdn),inr(brkdn*fs)],['TOTAL',inr(totalPerVeh),inr(fleetTotal)]];
  return{rows,k1:inr(fleetTotal)+'/mo',k2:inr(totalPerVeh)+'/vehicle',k3:'₹'+perKm+'/km'};}
