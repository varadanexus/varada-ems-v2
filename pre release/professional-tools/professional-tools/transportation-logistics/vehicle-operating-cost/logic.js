const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const vc=+v.vehicle_cost||2500000,mkm=+v.monthly_km||8000,fe=+v.fuel_eff||5,fp=+v.fuel_price||90,ds=+v.driver_salary||25000,ty=+v.tyre_cost||8000,mn=+v.maintenance||10000,ins=+v.insurance||80000;
  const fuelMonthly=Math.round(mkm/fe*fp);
  const depMonthly=Math.round(vc*0.15/12);
  const insMonthly=Math.round(ins/12);
  const totalMonthly=fuelMonthly+ds+ty+mn+depMonthly+insMonthly;
  const perKm=Math.round(totalMonthly/mkm*100)/100;
  const fuelPerKm=Math.round(fp/fe*100)/100;
  const rows=[['Fuel',inr(fuelMonthly),'₹'+fuelPerKm],['Driver salary',inr(ds),'₹'+Math.round(ds/mkm*100)/100],['Tyres',inr(ty),'₹'+Math.round(ty/mkm*100)/100],['Maintenance',inr(mn),'₹'+Math.round(mn/mkm*100)/100],['Depreciation (15% p.a.)',inr(depMonthly),'₹'+Math.round(depMonthly/mkm*100)/100],['Insurance',inr(insMonthly),'₹'+Math.round(insMonthly/mkm*100)/100],['TOTAL',inr(totalMonthly),'₹'+perKm]];
  return{rows,k1:'₹'+perKm+'/km',k2:inr(totalMonthly)+'/mo',k3:'₹'+fuelPerKm+'/km'};}
