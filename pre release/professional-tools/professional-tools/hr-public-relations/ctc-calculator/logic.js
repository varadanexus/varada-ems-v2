const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const basic=+v.basic||25000,hra=+v.hra||12500,tr=+v.transport||1600,med=+v.medical||1250,sp=+v.special||5000;
  const bonusPct=+v.bonus_pct||10,grat=v.gratuity_flag==='yes';
  const monthlyFixed=basic+hra+tr+med+sp;
  const empPF=Math.round(basic*0.12);
  const emplrPF=Math.round(basic*0.12);
  const gratuity=grat?Math.round(basic*0.0481):0;
  const annualBonus=Math.round(basic*12*bonusPct/100);
  const annualCTC=(monthlyFixed+emplrPF+gratuity)*12+annualBonus;
  const rows=[
   ['Basic',inr(basic),inr(basic*12)],
   ['HRA',inr(hra),inr(hra*12)],
   ['Transport allowance',inr(tr),inr(tr*12)],
   ['Medical allowance',inr(med),inr(med*12)],
   ['Special allowance',inr(sp),inr(sp*12)],
   ['Monthly gross',inr(monthlyFixed),inr(monthlyFixed*12)],
   ['Annual bonus','',inr(annualBonus)],
   ['Employer PF (12%)',inr(emplrPF),inr(emplrPF*12)],
   ['Gratuity (4.81%)',grat?inr(gratuity):'—',grat?inr(gratuity*12):'—'],
   ['TOTAL CTC','',inr(annualCTC)]];
  return{rows,k1:inr(annualCTC)+'/yr',k2:inr(monthlyFixed)+'/mo',k3:inr(empPF)+'/mo'};}
