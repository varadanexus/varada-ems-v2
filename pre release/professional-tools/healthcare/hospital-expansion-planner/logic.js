const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){const c=+v.current||0,t=+v.target||0,cb=+v.costBed||0,sb=+v.staffBed||0,add=Math.max(0,t-c);
 const rows=[['Additional beds','',add],['Expansion capex','@ '+inr(cb)+'/bed',inr(add*cb)],['Additional staff','@ '+sb+'/bed',Math.ceil(add*sb)]];
 return{rows,k1:add+' beds',k2:inr(add*cb),k3:Math.ceil(add*sb)+' staff'};}
