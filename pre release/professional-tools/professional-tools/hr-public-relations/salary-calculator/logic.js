const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const ctc=+v.ctc||600000,bpct=+v.basic_pct||40,hpct=+v.hra_pct||50,pfp=+v.pf||12,pt=+v.prof_tax||200,od=+v.other_deductions||0;
  const basic=ctc*bpct/100,hra=basic*hpct/100,specialAllow=ctc-basic-hra-(basic*pfp/100*2);
  const monthlyGross=ctc/12;
  const pfEmp=Math.round(basic/12*pfp/100);
  // simplified income tax new regime
  const taxable=Math.max(0,ctc-75000);
  let tax=0;
  if(taxable>1500000)tax=150000+(taxable-1500000)*0.30;
  else if(taxable>1200000)tax=90000+(taxable-1200000)*0.20;
  else if(taxable>1000000)tax=60000+(taxable-1000000)*0.15;
  else if(taxable>700000)tax=15000+(taxable-700000)*0.10;
  else if(taxable>300000)tax=(taxable-300000)*0.05;
  const monthlyTax=Math.round(tax/12);
  const totalDeduct=pfEmp+pt+monthlyTax+od;
  const netMonthly=Math.round(monthlyGross-totalDeduct);
  const rows=[
   ['Basic salary',inr(Math.round(basic)),inr(Math.round(basic/12))],
   ['HRA',inr(Math.round(hra)),inr(Math.round(hra/12))],
   ['Special allowance',inr(Math.round(specialAllow)),inr(Math.round(specialAllow/12))],
   ['Gross salary',inr(ctc),inr(Math.round(monthlyGross))],
   ['— Employee PF ('+pfp+'%)','','-'+inr(pfEmp)],
   ['— Professional tax','','-'+inr(pt)],
   ['— Income tax (est.)','','-'+inr(monthlyTax)],
   ['— Other deductions','','-'+inr(od)],
   ['Net in-hand salary','',inr(netMonthly)]];
  return{rows,k1:inr(netMonthly)+'/mo',k2:inr(netMonthly*12)+'/yr',k3:inr(totalDeduct)+'/mo'};}
