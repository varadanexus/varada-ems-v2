const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const ctc=+v.ctc||600000,ofc=+v.office_cost||8000,eqp=+v.equipment||50000,hr=+v.hr_admin||3000,trn=+v.training||20000,bpct=+v.bonus_pct||10,basicPct=+v.basic_pct||40;
  const basic=ctc*basicPct/100;
  const emplrPF=basic*0.12;
  const bonus=basic*bpct/100;
  const overhead=(ofc+hr)*12+eqp+trn;
  const trueCost=Math.round(ctc+emplrPF+overhead);
  const premium=Math.round(trueCost-ctc);
  const multiplier=Math.round(trueCost/ctc*100)/100;
  const rows=[
   ['CTC',inr(Math.round(ctc/12)),inr(ctc)],
   ['Employer PF (12% basic)',inr(Math.round(emplrPF/12)),inr(Math.round(emplrPF))],
   ['Office space',inr(ofc),inr(ofc*12)],
   ['Equipment & IT','',inr(eqp)],
   ['HR & admin',inr(hr),inr(hr*12)],
   ['Training','',inr(trn)],
   ['True total cost',inr(Math.round(trueCost/12)),inr(trueCost)]];
  return{rows,k1:inr(trueCost)+'/yr',k2:inr(premium),k3:multiplier+'×'};}
