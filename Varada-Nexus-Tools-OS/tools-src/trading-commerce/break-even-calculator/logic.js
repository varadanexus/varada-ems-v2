const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN'); const num=n=>Math.ceil(n).toLocaleString('en-IN');
export function compute(v){
  const F=+v.fixed||0, P=+v.price||0, VC=+v.variable||0, cm=P-VC;
  const units = cm>0 ? F/cm : 0, rev=units*P;
  const rows=[['Fixed costs','',inr(F)],['Contribution per unit','price - variable',inr(cm)],['Break-even units','',cm>0?num(units):'—'],['Break-even revenue','',cm>0?inr(rev):'—']];
  return {rows,k1:cm>0?num(units)+' units':'—',k2:cm>0?inr(rev):'—',k3:inr(cm)};
}
