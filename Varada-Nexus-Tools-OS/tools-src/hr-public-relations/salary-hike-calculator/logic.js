const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const c=+v.current||0, h=+v.hike||0, inc=c*h/100, nw=c+inc;
  const rows=[['Current salary','',inr(c)],['Increase','@ '+h+'%',inr(inc)],['New salary','',inr(nw)]];
  return {rows,k1:inr(nw),k2:inr(inc),k3:h+'%'};
}
