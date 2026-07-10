const sf=n=>Math.round(n).toLocaleString('en-IN')+' sq ft';
export function compute(v){const b=+v.beds||0,pb=+v.type||1100,tot=b*pb;
 const clin=tot*0.4,diag=tot*0.2,sup=tot*0.25,adm=tot*0.15;
 const rows=[['Clinical & wards','40%',sf(clin)],['Diagnostics & OT','20%',sf(diag)],['Support & services','25%',sf(sup)],['Administration & circulation','15%',sf(adm)],['Total built-up','',sf(tot)]];
 return{rows,k1:sf(tot),k2:sf(clin),k3:sf(sup)};}
