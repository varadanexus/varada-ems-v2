export function compute(v){
  const s=+v.sourcing_days||0,p=+v.production_days||0,q=+v.quality_days||0,t=+v.transit_days||0,c=+v.customs_days||0,l=+v.last_mile_days||0,ss=+v.safety_stock_days||0;
  const stages=[['Sourcing / supplier response',s],['Manufacturing / production',p],['Quality inspection',q],['Transit / shipping',t],['Customs clearance',c],['Last-mile delivery',l]];
  let cum=0;
  const rows=stages.map(([n,d])=>{cum+=d;return[n,d+' days',cum+' days'];});
  const total=cum;
  rows.push(['Safety stock buffer',ss+' days','']);
  const reorder=total+ss;
  return{rows,k1:total+' days',k2:(total+ss)+' days',k3:reorder+' days before stockout'};}
