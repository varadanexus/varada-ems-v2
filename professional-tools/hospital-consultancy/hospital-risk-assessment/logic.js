const AREAS=['Financial','Regulatory','Doctor availability','Operations','Competition'];
const KEYS=[['r_finance','i_finance'],['r_regulatory','i_regulatory'],['r_doctor','i_doctor'],['r_ops','i_ops'],['r_competition','i_competition']];
export function compute(v){
  const scores=KEYS.map(([l,i])=>(+v[l]||1)*(+v[i]||1));
  const total=scores.reduce((a,b)=>a+b,0);
  const maxIdx=scores.indexOf(Math.max(...scores));
  const rows=scores.map((s,i)=>{
    const p=s>=15?'🔴 High':s>=8?'🟡 Medium':'🟢 Low';
    return[AREAS[i],s+' / 25',p];
  });
  const band=total>=60?'High':total>=35?'Moderate':'Low';
  return{rows,k1:total+' / 125',k2:AREAS[maxIdx],k3:band};}
