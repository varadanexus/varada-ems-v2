export function compute(v){const b=+v.beds||0,pb=+v.perBeds||100,as=+v.alsShare||40;const tot=Math.max(1,Math.ceil(b/pb)),als=Math.round(tot*as/100),bls=tot-als;
 const rows=[['Total ambulances','1 per '+pb+' beds',tot],['ALS (advanced)','@ '+as+'%',als],['BLS (basic)','',bls]];
 return{rows,k1:tot+' vehicles',k2:als,k3:bls};}
