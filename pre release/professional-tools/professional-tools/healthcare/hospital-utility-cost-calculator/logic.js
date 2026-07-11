const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){const b=+v.beds||0,k=+v.kwh||0,t=+v.tariff||0,w=+v.water||0,wr=+v.waterRate||0;
 const elec=b*k*t*30,wat=b*w/1000*wr*30;
 const rows=[['Electricity','@ ₹'+t+'/kWh',inr(elec)],['Water','@ ₹'+wr+'/1000L',inr(wat)],['Total monthly utilities','',inr(elec+wat)]];
 return{rows,k1:inr(elec+wat),k2:inr(elec),k3:inr(wat)};}
