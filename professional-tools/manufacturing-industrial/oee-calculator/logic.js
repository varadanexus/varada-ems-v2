const pc=n=>(Math.round(n*10)/10)+'%';
export function compute(v){
  const a=+v.availability||0,p=+v.performance||0,q=+v.quality||0, oee=a*p*q/10000;
  const rating = oee>=85?'World-class':oee>=60?'Typical':oee>=40?'Low':'Very low';
  const gap=85-oee;
  const rows=[['Availability','',pc(a)],['Performance','',pc(p)],['Quality','',pc(q)],['OEE','A x P x Q',pc(oee)]];
  return {rows,k1:pc(oee),k2:rating,k3:(gap>0?pc(gap):'0%')};
}
