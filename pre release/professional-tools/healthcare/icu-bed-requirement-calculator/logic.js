const c=n=>Math.ceil(n);
export function compute(v){const b=+v.beds||0,p=+v.pct||10,vr=+v.vent||60;const icu=c(b*p/100),hdu=c(icu/2),vent=c(icu*vr/100);
 const rows=[['Total beds','',b],['ICU beds','@ '+p+'%',icu],['HDU beds','~50% of ICU',hdu],['Ventilators','@ '+vr+'% of ICU',vent]];
 return{rows,k1:icu+' beds',k2:hdu+' beds',k3:vent};}
