export function compute(v){
  const nd=+v.notice_days||30,db=+v.daily_basic||1000,la=+v.leaves_availed||0,ww=+v.weekends||0;
  const weekendDays=Math.round(nd/7)*2;
  const workingDays=Math.max(0,nd-weekendDays+ww-la);
  const buyout=Math.round(workingDays*db);
  const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
  const rows=[
   ['Notice period',nd+' calendar days',''],
   ['Weekend days (approx)',weekendDays+' days','Non-working'],
   ['Working weekends added',ww+' days',''],
   ['Leaves adjusted',la+' days',''],
   ['Effective working days','',workingDays+' days'],
   ['Buy-out cost ('+workingDays+' days × daily basic)','',inr(buyout)]];
  return{rows,k1:nd+' days',k2:inr(buyout),k3:workingDays+' days'};}
