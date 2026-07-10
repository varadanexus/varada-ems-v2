const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const pr=+v.press_releases||0,prc=+v.pr_release_cost||0,mo=+v.media_outreach||0,moc=+v.outreach_cost_per||0,ev=+v.event_cost||0,inf=+v.influencer_cost||0,agency=+v.pr_agency||0,months=+v.months||3;
  const pressCost=pr*prc,outreachCost=mo*moc,agencyTotal=agency*months;
  const total=pressCost+outreachCost+ev+inf+agencyTotal;
  const monthly=Math.round(total/months);
  const rows=[['Press releases ('+pr+')',inr(pressCost),''],['Media outreach ('+mo+' contacts)',inr(outreachCost),''],['PR event / press conference',inr(ev),''],['Influencer / blogger outreach',inr(inf),''],['PR agency retainer ('+months+' months)',inr(agencyTotal),''],['TOTAL CAMPAIGN BUDGET',inr(total),'']];
  return{rows,k1:inr(total),k2:inr(monthly)+'/mo',k3:inr(agencyTotal)};}
