const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){const a=+v.area||0,r=+v.rate||3500,cp=+v.cont||0;const civil=a*r,mep=civil*.25,hvac=civil*.15,mg=civil*.08,sub=civil+mep+hvac+mg,cont=sub*cp/100,tot=sub+cont;
 const rows=[['Civil',a.toLocaleString('en-IN')+' sq ft',inr(civil)],['MEP','25%',inr(mep)],['HVAC','15%',inr(hvac)],['Medical gas & fire','8%',inr(mg)],['Contingency',cp+'%',inr(cont)],['Total','',inr(tot)]];
 return{rows,k1:inr(tot),k2:inr(tot/(a||1)),k3:inr(civil)};}
