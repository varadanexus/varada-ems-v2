export function compute(v){
  const tr=+v.transit_days||0,cu=+v.customs_days||0,lm=+v.last_mile_days||0,buf=+v.buffer_days||1,wdo=v.working_days_only==='yes';
  const calDays=tr+cu+lm;
  const etaDays=wdo?Math.ceil(calDays/6*7):calDays;
  const promiseDays=etaDays+buf;
  const stages=[['Transit / shipping',tr,tr],['Customs clearance',cu,tr+cu],['Last-mile delivery',lm,calDays]];
  const rows=stages.map(([n,d,c])=>[n,d+' days',c+' days']);
  rows.push(['Buffer','',buf+' days']);
  const note=wdo?' (working days, Mon–Sat)':' (calendar days)';
  return{rows,k1:calDays+' days'+note,k2:etaDays+' days from dispatch',k3:promiseDays+' days from dispatch'};}
