const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const gross=+v.gross_monthly||40000,wd=+v.working_days||26,present=+v.present_days||22,al=+v.approved_leave||0,ph=+v.holidays||0;
  const paidDays=present+al+ph;
  const lopDays=Math.max(0,wd-paidDays);
  const dailyRate=gross/wd;
  const lopDeduct=Math.round(lopDays*dailyRate);
  const salaryPayable=gross-lopDeduct;
  const rows=[
   ['Working days in month',wd,''],
   ['Days present',present,''],
   ['Approved paid leave',al,''],
   ['Public holidays',ph,''],
   ['Paid days',paidDays,''],
   ['LOP days',lopDays,'-'+inr(lopDeduct)],
   ['Monthly gross',wd,inr(gross)],
   ['Salary payable',paidDays,inr(salaryPayable)]];
  return{rows,k1:inr(salaryPayable),k2:inr(lopDeduct),k3:lopDays+' days'};}
