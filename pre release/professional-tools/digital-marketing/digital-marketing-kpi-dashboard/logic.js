const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const spend=+v.total_spend||100000,rev=+v.revenue||400000,leads=+v.leads||200;
  const custs=+v.customers||20,arc=+v.avg_revenue_customer||25000,ls=+v.customer_lifespan||3;
  const roas=rev/spend;
  const cpl=spend/leads;
  const cac=spend/custs;
  const ltv=arc*ls*0.7;
  const ltvCac=ltv/cac;
  const payback=cac/(arc/12);
  const rows=[
   ['ROAS','revenue ÷ spend',Math.round(roas*10)/10+'×'],
   ['CPL','spend ÷ leads',inr(Math.round(cpl))],
   ['CAC','spend ÷ customers',inr(Math.round(cac))],
   ['LTV','rev × lifespan × 0.7',inr(Math.round(ltv))],
   ['LTV:CAC ratio','',Math.round(ltvCac*10)/10+':1'],
   ['Payback period','months',Math.round(payback*10)/10+' months']];
  return{rows,k1:Math.round(roas*10)/10+'×',k2:inr(Math.round(cac)),k3:Math.round(ltvCac*10)/10+':1'};}
