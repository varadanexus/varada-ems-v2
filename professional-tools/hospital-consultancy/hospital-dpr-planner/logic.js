const inr=n=>'₹'+n;
const FEES={small:{basic:'2–4L',full:'5–10L',premium:'12–20L',dur:'4–6 weeks'},multi:{basic:'4–8L',full:'10–20L',premium:'22–40L',dur:'6–10 weeks'},large:{basic:'8–15L',full:'18–35L',premium:'40–70L',dur:'10–16 weeks'}};
export function compute(v){
  const t=v.type||'multi',s=v.scope||'full';
  const F=FEES[t]||FEES.multi;
  const fee=F[s];
  const rows=[
   ['Market & demand study','30%','Included'],
   ['Clinical programme design','20%','Included'],
   ['Space planning / block layout','15%','Included'],
   ['Equipment list (indicative)','10%','Included'],
   ['Financial model (5-10 yr)','15%','Included'],
   ['Regulatory & licensing plan','10%','Included']];
  return{rows,k1:inr(fee),k2:F.dur,k3:'6 chapters + executive summary'};}
