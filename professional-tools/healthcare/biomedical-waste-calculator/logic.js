const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');const kg=n=>(Math.round(n*100)/100)+' kg';
export function compute(v){const b=+v.beds||0,o=+v.occ||0,r=+v.rate||0,c=+v.cost||0,ob=b*o/100,tot=ob*r;
 const rows=[['Yellow (anatomical/soiled)','45%',kg(tot*.45)],['Red (contaminated plastic)','30%',kg(tot*.30)],['White (sharps)','10%',kg(tot*.10)],['Blue (glass/metal)','15%',kg(tot*.15)],['Total BMW','',kg(tot)]];
 return{rows,k1:kg(tot),k2:inr(tot*c*30),k3:Math.round(ob)+' beds'};}
