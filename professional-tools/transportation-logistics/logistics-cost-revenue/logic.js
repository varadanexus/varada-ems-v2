const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const rev=+v.revenue||50000000,fr=+v.freight_cost||0,wh=+v.warehouse_cost||0,inv=+v.inventory_cost||0,adm=+v.admin_cost||0;
  const total=fr+wh+inv+adm;
  const pct=Math.round(total/rev*100*10)/10;
  const benchmark=rev*0.08;
  const savings=Math.round(total-benchmark);
  const p=n=>Math.round(n/rev*100*10)/10;
  const rows=[['Freight cost',inr(fr),p(fr)+'%'],['Warehousing',inr(wh),p(wh)+'%'],['Inventory carrying',inr(inv),p(inv)+'%'],['Admin / technology',inr(adm),p(adm)+'%'],['TOTAL',inr(total),pct+'%'],['Industry benchmark (8%)','',inr(Math.round(benchmark))],['Gap to benchmark','',inr(savings)+(savings>0?' (potential saving)':'')]];
  return{rows,k1:pct+'%',k2:inr(total)+'/yr',k3:savings>0?inr(savings):'Below benchmark ✅'};}
