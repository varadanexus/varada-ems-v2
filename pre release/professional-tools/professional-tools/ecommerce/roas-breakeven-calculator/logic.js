const x=n=>(Math.round(n*100)/100)+'x';
export function compute(v){
  const rev=+v.revenue||0,sp=+v.spend||0,m=+v.margin||0;
  const roas=sp>0?rev/sp:0, be=m>0?100/m:0, ok=roas>=be;
  const rows=[['Actual ROAS','revenue ÷ spend',x(roas)],['Break-even ROAS','100 ÷ margin%',x(be)],['Status','',ok?'Profitable':'Below break-even']];
  return {rows,k1:x(roas),k2:x(be),k3:ok?'Profitable':'Below break-even'};
}
