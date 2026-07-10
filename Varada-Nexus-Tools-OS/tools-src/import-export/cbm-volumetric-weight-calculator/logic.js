const num=(n,u)=>(Math.round(n*100)/100).toLocaleString('en-IN')+' '+u;
export function compute(v){
  const l=+v.l||0,w=+v.w||0,h=+v.h||0,q=+v.qty||1,act=(+v.actual||0)*q,div=+v.divisor||5000;
  const cbm=(l*w*h)/1e6*q, vol=(l*w*h)/div*q, charge=Math.max(act,vol);
  const rows=[['Total CBM','',num(cbm,'m³')],['Actual weight','',num(act,'kg')],['Volumetric weight','÷'+div,num(vol,'kg')],['Chargeable weight','greater of the two',num(charge,'kg')]];
  return {rows,k1:num(cbm,'m³'),k2:num(vol,'kg'),k3:num(charge,'kg')};
}
