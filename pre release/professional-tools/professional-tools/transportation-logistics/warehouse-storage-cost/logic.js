const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const area=+v.area||5000,rent=+v.rent_per_sqft||25,labour=+v.labour||80000,util=+v.utilities||20000,pallets=+v.pallets||200,uph=+v.units_per_pallet||50,invVal=+v.inventory_value||2000000;
  const spaceCost=area*rent;
  const carryCost=Math.round(invVal*0.02);
  const total=spaceCost+labour+util+carryCost;
  const perPallet=Math.round(total/pallets);
  const perUnit=Math.round(total/(pallets*uph)*100)/100;
  const rows=[['Space / rent',inr(spaceCost),inr(Math.round(spaceCost/pallets))],['Labour',inr(labour),inr(Math.round(labour/pallets))],['Utilities',inr(util),inr(Math.round(util/pallets))],['Inventory carrying cost (2%/mo)',inr(carryCost),inr(Math.round(carryCost/pallets))],['TOTAL',inr(total),inr(perPallet)]];
  return{rows,k1:inr(total)+'/mo',k2:inr(perPallet)+'/pallet',k3:'₹'+perUnit+'/unit'};}
