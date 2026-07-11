const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){const b=+v.beds||0,o=+v.occ||0,a=+v.arpob||0,ob=b*o/100,day=ob*a;
 const rows=[['Occupied beds','@ '+o+'%',Math.round(ob)],['Daily revenue','',inr(day)],['Monthly revenue','x 30',inr(day*30)],['Annual revenue','x 365',inr(day*365)]];
 return{rows,k1:inr(day*30),k2:inr(day*365),k3:inr(day)};}
