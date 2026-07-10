const RATES={pop:70,gypsum:95,grid:80,wood:150};
const MULT={plain:1.0,simple:1.2,complex:1.5};
const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const L=+v.length||18,W=+v.width||14,t=v.type||'gypsum',d=v.design||'simple';
  const area=L*W;
  const rate=(RATES[t]||95)*(MULT[d]||1.2);
  const mat=area*rate*0.55,labour=area*rate*0.45,total=area*rate;
  const rows=[['Ceiling area','',area+' sq ft'],['Material cost','55%',inr(mat)],['Labour & framing','45%',inr(labour)],['Total ceiling cost','',inr(total)]];
  return{rows,k1:inr(total),k2:inr(Math.round(rate))+'/sq ft',k3:area+' sq ft'};}
