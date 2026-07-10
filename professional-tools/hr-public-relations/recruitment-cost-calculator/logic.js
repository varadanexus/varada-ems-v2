const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const ads=+v.job_ads||0,rec=+v.recruiter_fee||0,intHrs=+v.interview_hrs||0,intRate=+v.interviewer_rate||0,bgv=+v.bgv_cost||0,onb=+v.onboarding_cost||0,hires=+v.hires||1;
  const intCost=intHrs*intRate;
  const total=ads+rec+intCost+bgv+onb;
  const cph=total/hires;
  const recPct=total>0?Math.round(rec/total*100):0;
  const rows=[['Job advertising',inr(ads),inr(Math.round(ads/hires))],['Recruiter / agency fee',inr(rec),inr(Math.round(rec/hires))],['Interview time cost',inr(Math.round(intCost)),inr(Math.round(intCost/hires))],['Background verification',inr(bgv),inr(Math.round(bgv/hires))],['Onboarding & training',inr(onb),inr(Math.round(onb/hires))],['Total',inr(total),inr(Math.round(cph))]];
  return{rows,k1:inr(Math.round(cph)),k2:inr(total),k3:recPct+'%'};}
