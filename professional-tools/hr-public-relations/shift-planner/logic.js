const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const dw=+v.day_shifts||0,dr=+v.day_rate||0,ew=+v.eve_shifts||0,er=+v.eve_rate||0,nw=+v.night_shifts||0,nr=+v.night_rate||0,dpw=+v.days_per_week||6;
  const dayWeekly=dw*dr*dpw,eveWeekly=ew*er*dpw,nightWeekly=nw*nr*dpw;
  const total=dayWeekly+eveWeekly+nightWeekly;
  const monthly=Math.round(total*4.33);
  const workers=dw+ew+nw;
  const rows=[['Day shift',dw+' workers',inr(dayWeekly)],['Evening / afternoon shift',ew+' workers',inr(eveWeekly)],['Night shift',nw+' workers',inr(nightWeekly)],['TOTAL',workers+' workers',inr(total)+'/week']];
  return{rows,k1:inr(total)+'/week',k2:inr(monthly)+'/month',k3:workers+' workers'};}
