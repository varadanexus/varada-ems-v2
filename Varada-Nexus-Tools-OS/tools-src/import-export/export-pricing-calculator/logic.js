const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const exw=+v.exw||1000,qty=+v.quantity||1000;
  const inland=+v.inland_freight||15000,clear=+v.export_clearance||8000;
  const freight=+v.sea_freight||35000,insR=+v.insurance_pct||0.5;
  const fobTotal=exw*qty+inland+clear;
  const cfrTotal=fobTotal+freight;
  const cifTotal=cfrTotal/(1-insR/100);
  const ins=cifTotal-cfrTotal;
  return{
    rows:[
      ['EXW (factory)',inr(exw)+'/unit',inr(exw*qty)],
      ['Inland Freight','',inr(inland)],
      ['Export Clearance / CHA','',inr(clear)],
      ['Sea / Air Freight','',inr(freight)],
      ['Insurance',insR+'% of CIF',inr(ins)],
      ['CIF Total','',inr(cifTotal)]],
    k1:inr(fobTotal/qty)+'/unit',k2:inr(cfrTotal/qty)+'/unit',k3:inr(cifTotal/qty)+'/unit'};
}
