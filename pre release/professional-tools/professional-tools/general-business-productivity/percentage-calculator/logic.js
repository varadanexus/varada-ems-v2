const num=n=>(Math.round(n*100)/100).toLocaleString('en-IN');
export function compute(v){
  const val=+v.value||0, p=+v.percent||0, of=val*p/100;
  const rows=[[p+'% of '+num(val),'',num(of)],[num(val)+' increased by '+p+'%','',num(val+of)],[num(val)+' decreased by '+p+'%','',num(val-of)]];
  return {rows,k1:num(of),k2:num(val+of),k3:num(val-of)};
}
