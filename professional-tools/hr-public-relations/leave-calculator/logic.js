const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const ael=+v.annual_el||21,cl=+v.cl||12,sl=+v.sl||6,availed=+v.el_availed||0,bf=+v.el_bf||0,basic=+v.basic_monthly||25000,maxCF=+v.max_cf||30;
  const elBalance=bf+ael-availed;
  const carryFwd=Math.min(elBalance,maxCF);
  const encashable=Math.max(0,elBalance-availed);
  const encashValue=Math.round(elBalance*(basic/26));
  const total=elBalance+cl+sl;
  const rows=[
   ['Earned leave (EL)',ael+' days','Balance: '+elBalance+' days'],
   ['— Brought forward',bf+' days',''],
   ['— Availed this year',availed+' days',''],
   ['— Carry-forward (next yr)','',carryFwd+' days (max '+maxCF+')'],
   ['Casual leave (CL)',cl+' days',cl+' days (not encashable)'],
   ['Sick leave (SL)',sl+' days',sl+' days (not encashable)'],
   ['EL encashment value','',inr(encashValue)],
   ['Total leave balance','',total+' days']];
  return{rows,k1:elBalance+' days',k2:inr(encashValue),k3:total+' days'};}
