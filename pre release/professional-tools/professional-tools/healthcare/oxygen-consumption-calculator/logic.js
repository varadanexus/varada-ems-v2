const n=x=>Math.round(x).toLocaleString('en-IN');
export function compute(v){const i=+v.icu||0,w=+v.ward||0,il=+v.icuLpm||0,wl=+v.wardLpm||0,h=+v.hours||24;
 const lpm=i*il+w*wl,lit=lpm*60*h,cbm=lit/1000,cyl=lit/7000;
 const rows=[['Total flow','peak',lpm.toLocaleString('en-IN')+' LPM'],['Oxygen per day','',n(lit)+' L'],['Cubic metres/day','',n(cbm)+' m³'],['Jumbo cylinders/day','7000 L each',(Math.round(cyl*10)/10)]];
 return{rows,k1:n(lit)+' L',k2:n(cbm)+' m³',k3:(Math.round(cyl*10)/10)+' cyl'};}
