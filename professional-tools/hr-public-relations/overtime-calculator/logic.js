const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const basic=+v.monthly_basic||20000,wd=+v.working_days||26,wh=+v.working_hours||8,oth=+v.ot_hours||10,rate=+v.ot_rate||2;
  const hourlyRate=basic/(wd*wh);
  const otPay=Math.round(oth*hourlyRate*rate);
  const totalPay=basic+otPay;
  const rows=[
   ['Basic + DA',inr(basic),''],
   ['Working days/month',wd,''],
   ['Hours/day',wh,''],
   ['Hourly rate (basic/DA)',inr(Math.round(hourlyRate*100)/100),''],
   ['OT hours',oth+'h',''],
   ['OT rate','×'+rate,''],
   ['Overtime pay','',inr(otPay)],
   ['Total pay this month','',inr(totalPay)]];
  return{rows,k1:inr(otPay),k2:inr(totalPay),k3:'₹'+Math.round(hourlyRate*100)/100+'/hr'};}
