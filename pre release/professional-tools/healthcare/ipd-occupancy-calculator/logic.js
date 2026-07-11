export function compute(v){const b=+v.beds||1,a=+v.admissions||0,l=+v.alos||0,d=+v.days||30;const occ=a*l,avail=b*d,rate=avail>0?occ/avail*100:0;
 const rows=[['Occupied bed-days','admissions x ALOS',Math.round(occ).toLocaleString('en-IN')],['Available bed-days','beds x days',avail.toLocaleString('en-IN')],['Occupancy rate','',(Math.round(rate*10)/10)+'%']];
 return{rows,k1:(Math.round(rate*10)/10)+'%',k2:Math.round(occ).toLocaleString('en-IN'),k3:avail.toLocaleString('en-IN')};}
