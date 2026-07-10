const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN'); const pc=n=>(Math.round(n*10)/10)+'%';
export function compute(v){
  const c=+v.cost||0, s=+v.sell||0, p=s-c;
  const margin = s>0 ? p/s*100 : 0, markup = c>0 ? p/c*100 : 0;
  const rows=[['Cost price','',inr(c)],['Selling price','',inr(s)],['Profit','',inr(p)],['Margin','of selling price',pc(margin)],['Markup','over cost',pc(markup)]];
  return {rows,k1:inr(p),k2:pc(margin),k3:pc(markup)};
}
