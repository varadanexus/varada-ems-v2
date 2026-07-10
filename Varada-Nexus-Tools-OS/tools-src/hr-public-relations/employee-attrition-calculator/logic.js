const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const ctc=+v.annual_ctc||700000,buyout=+v.notice_buyout||0,rec=+v.recruitment_cost||70000,ramp=+v.onboarding_months||3,prod=+v.productivity_pct||50,kl=+v.knowledge_loss||15000;
  const monthlyCTC=ctc/12;
  const prodLoss=Math.round(monthlyCTC*ramp*(1-prod/100));
  const total=buyout+rec+prodLoss+kl;
  const pctCTC=Math.round(total/ctc*100);
  const rows=[
   ['Notice buy-out','',inr(buyout)],
   ['Recruitment cost','',inr(rec)],
   ['Productivity loss ('+ramp+' months × '+(100-prod)+'% loss)','',inr(prodLoss)],
   ['Knowledge transfer','',inr(kl)],
   ['Total attrition cost','',inr(total)],
   ['As % of annual CTC','',pctCTC+'%']];
  return{rows,k1:inr(total),k2:pctCTC+'%',k3:inr(prodLoss)};}
