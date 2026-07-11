const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){const b=+v.beds||1,F=+v.fixed||0,a=+v.arpob||0,vc=+v.varcost||0,cm=a-vc;
 const bd=cm>0?F/cm:0,occ=cm>0?bd/(b*30)*100:0;
 const rows=[['Contribution/bed-day','ARPOB - variable',inr(cm)],['Break-even bed-days/mo','',cm>0?Math.round(bd).toLocaleString('en-IN'):'—'],['Break-even occupancy','',cm>0?(Math.round(occ*10)/10)+'%':'—']];
 return{rows,k1:cm>0?(Math.round(occ*10)/10)+'%':'not achievable',k2:cm>0?Math.round(bd).toLocaleString('en-IN'):'—',k3:inr(cm)};}
