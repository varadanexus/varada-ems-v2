const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const fob=+v.fob_value||500000,prod=+v.production_cost||300000;
  const inlandF=+v.inland_freight||8000,seaF=+v.sea_freight||25000;
  const ins=+v.insurance||2500,clear=+v.clearance_charges||7000,bank=+v.bank_charges||5000;
  const dbkR=+v.drawback_pct||1.5;
  const totalCost=prod+inlandF+seaF+ins+clear+bank;
  const incentive=Math.round(fob*dbkR/100);
  const profit=fob-totalCost+incentive;
  const margin=Math.round(profit/fob*1000)/10;
  return{
    rows:[
      ['FOB Export Value','',inr(fob)],
      ['Production / Purchase Cost','',inr(prod)],
      ['Freight & Logistics','Inland+Sea',inr(inlandF+seaF)],
      ['Insurance & Clearance','',inr(ins+clear)],
      ['Bank Charges','',inr(bank)],
      ['Total Cost','',inr(totalCost)],
      ['Duty Drawback / RoDTEP',dbkR+'% of FOB',inr(incentive)],
      ['Net Profit','',inr(profit)]],
    k1:inr(profit),k2:margin+'%',k3:inr(incentive)};
}
