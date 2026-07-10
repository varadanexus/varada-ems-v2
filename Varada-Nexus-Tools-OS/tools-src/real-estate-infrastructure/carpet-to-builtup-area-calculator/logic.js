const num=n=>Math.round(n).toLocaleString('en-IN')+' sq ft';
export function compute(v){
  const c=+v.carpet||0, L=+v.loading||0, bu=c*1.10, sbu=c*(1+L/100);
  const rows=[['Carpet area','',num(c)],['Built-up area','+10% walls',num(bu)],['Super built-up area','+'+L+'% loading',num(sbu)]];
  return {rows,k1:num(sbu),k2:num(bu),k3:num(c)};
}
