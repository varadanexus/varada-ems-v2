const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){const vol=+v.vol||0,kg=+v.member||100,r=+v.rate||65,w=vol*kg;
 const rows=[['Concrete volume','',vol+' m³'],['Steel weight','@ '+kg+' kg/m³',Math.round(w).toLocaleString('en-IN')+' kg'],['In tonnes','',(Math.round(w/100)/10)+' t'],['Steel cost','@ ₹'+r+'/kg',inr(w*r)]];
 return{rows,k1:Math.round(w).toLocaleString('en-IN')+' kg',k2:(Math.round(w/100)/10)+' t',k3:inr(w*r)};}
