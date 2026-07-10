const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const ctc=+v.ctc||600000,bpct=+v.basic_pct||40,vpct=+v.variable_pct||10,nd=+v.notice_days||30,prob=+v.probation_months||3,jb=+v.joining_bonus||0;
  const variable=Math.round(ctc*vpct/100);
  const fixedCTC=ctc-variable;
  const basic=Math.round(fixedCTC*bpct/100);
  const monthlyGross=Math.round(fixedCTC/12);
  const inHand=Math.round(monthlyGross*0.85);
  const rows=[
   ['Annual CTC','',inr(ctc)],
   ['Fixed CTC','',(100-vpct)+'% → '+inr(fixedCTC)],
   ['Variable / performance pay','',vpct+'% → '+inr(variable)],
   ['Monthly basic','',inr(basic)],
   ['Monthly gross (fixed)','',inr(monthlyGross)],
   ['Monthly in-hand (est.)','',inr(inHand)],
   ['Joining bonus',jb>0?inr(jb):'—',''],
   ['Notice period','',nd+' calendar days'],
   ['Probation period','',prob+' months']];
  return{rows,k1:inr(fixedCTC)+'/yr',k2:inr(inHand)+'/mo',k3:inr(variable)+'/yr'};}
