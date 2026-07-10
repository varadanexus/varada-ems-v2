const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
const TRANSPORT_RATES={frozen:4.5,chilled:3.5,ambient_ctrl:2.5};
const STORAGE_RATES={frozen:60,chilled:40,ambient_ctrl:20};
const NORMAL_RATE=2.0;
export function compute(v){
  const wt=+v.weight||5000,dist=+v.distance||800,zone=v.temp_zone||'chilled',days=+v.storage_days||0,area=+v.storage_area||0;
  const transport=Math.round(wt*(TRANSPORT_RATES[zone]||3.5)/100*dist);
  const storage=Math.round(area*STORAGE_RATES[zone]*days);
  const total=transport+storage;
  const normalFreight=Math.round(wt*NORMAL_RATE/100*dist);
  const premium=total-normalFreight;
  const perKg=Math.round(total/wt*100)/100;
  const rows=[
   ['Temperature zone',zone,''],
   ['Reefer transport',wt+'kg × '+dist+'km',''+inr(transport)],
   ['Cold storage ('+days+' days)','',inr(storage)],
   ['Total cold chain cost','',inr(total)],
   ['Normal freight (comparison)','',inr(normalFreight)],
   ['Cold chain premium','',inr(premium)]];
  return{rows,k1:inr(total),k2:inr(premium)+' over normal',k3:'₹'+perKg+'/kg'};}
