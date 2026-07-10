const num=n=>Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const D=+v.demand||0,S=+v.orderCost||0,H=+v.holding||0;
  const eoq=H>0?Math.sqrt(2*D*S/H):0, orders=eoq>0?D/eoq:0, days=orders>0?365/orders:0;
  const rows=[['EOQ','optimal order size',num(eoq)+' units'],['Orders per year','',(Math.round(orders*10)/10)],['Days between orders','',Math.round(days)+' days']];
  return {rows,k1:num(eoq)+' units',k2:(Math.round(orders*10)/10),k3:Math.round(days)+' days'};
}
