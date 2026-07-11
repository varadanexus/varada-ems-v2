export function compute(v){const o=+v.opd||0,c=+v.conv||0,e=+v.er||0,ea=+v.erAdm||0,l=+v.alos||1;
 const adm=o*c/100+e*ea/100,beds=adm*l;
 const rows=[['From OPD','@ '+c+'%',Math.round(o*c/100)],['From ER','@ '+ea+'%',Math.round(e*ea/100)],['Admissions/day','',Math.round(adm)],['Beds required','x ALOS '+l,Math.ceil(beds)]];
 return{rows,k1:Math.round(adm)+'/day',k2:Math.ceil(beds)+' beds',k3:Math.round(adm*30).toLocaleString('en-IN')};}
