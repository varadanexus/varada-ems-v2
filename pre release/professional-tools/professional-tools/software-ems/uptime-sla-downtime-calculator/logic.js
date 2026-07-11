function fmt(mins){ if(mins>=1440)return (Math.round(mins/1440*100)/100)+' days'; if(mins>=60)return (Math.round(mins/60*100)/100)+' hours'; return (Math.round(mins*100)/100)+' min'; }
export function compute(v){
  const sla=+v.sla||0, down=(1-sla/100);
  const day=down*24*60, week=day*7, month=day*30, year=day*365;
  const rows=[['Per day','',fmt(day)],['Per week','',fmt(week)],['Per month','30 days',fmt(month)],['Per year','365 days',fmt(year)]];
  return {rows,k1:fmt(month),k2:fmt(year),k3:fmt(day)};
}
