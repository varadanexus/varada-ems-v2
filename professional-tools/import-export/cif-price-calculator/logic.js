const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const fob=+v.fob_total||500000,freight=+v.sea_freight||35000;
  const insR=+v.insurance_rate||0.5,qty=+v.quantity||500;
  const cfr=fob+freight;
  const cif=Math.round(cfr/(1-insR/100));
  const ins=cif-cfr;
  const cifUnit=Math.round(cif/qty);
  return{
    rows:[
      ['FOB Value','',inr(fob)],
      ['Ocean Freight','',inr(freight)],
      ['CFR Value','FOB + Freight',inr(cfr)],
      ['Marine Insurance',insR+'% of CIF',inr(ins)],
      ['CIF Value','CFR + Insurance',inr(cif)]],
    k1:inr(cif),k2:inr(cifUnit)+'/unit',k3:inr(ins)};
}
