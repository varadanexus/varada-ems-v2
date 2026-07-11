const c=n=>Math.round(n);
export function compute(v){const r=+v.rooms||0,m=+v.consult||1,h=+v.hours||1,u=+v.util||80;const perRoom=c(h*60/m*u/100),day=perRoom*r,month=day*26;
 const rows=[['Per room/day','@ '+u+'% util',perRoom],['Rooms','',r],['Total per day','',day.toLocaleString('en-IN')],['Per month','26 days',month.toLocaleString('en-IN')]];
 return{rows,k1:day.toLocaleString('en-IN'),k2:perRoom,k3:month.toLocaleString('en-IN')};}
