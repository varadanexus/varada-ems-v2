const num=n=>Math.ceil(n).toLocaleString('en-IN');
export function compute(v){
  const beds=+v.beds||0,occ=+v.occupancy||0,ratio=+v.ratio||6,sh=+v.shifts||3,lf=+v.leave||1.3;
  const patients=beds*occ/100, perShift=Math.ceil(patients/ratio), perDay=Math.ceil(perShift*sh*lf);
  const rows=[['Occupied beds','@ '+occ+'% occupancy',Math.round(patients)],['Nurses per shift','1:'+ratio+' ratio',num(perShift)],['Shifts per day','',sh],['Nurses per day','x relief '+lf,num(perDay)]];
  return {rows,k1:num(perShift),k2:num(perDay),k3:Math.round(patients)+' patients'};
}
