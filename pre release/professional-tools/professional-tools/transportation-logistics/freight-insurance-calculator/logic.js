const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
const BASE_RATES={road:0.0010,rail:0.0008,sea:0.0015,air:0.0008};
const COV_MULT={icc_a:1.4,icc_c:1.0,basic:0.7};
export function compute(v){
  const val=+v.cargo_value||500000,mode=v.mode||'road',cov=v.coverage||'icc_a',ded=+v.deductible||0;
  const rate=(BASE_RATES[mode]||0.001)*(COV_MULT[cov]||1);
  const premium=Math.round(val*rate);
  const coverage=val-ded;
  const rows=[
   ['Cargo / shipment value','',inr(val)],
   ['Mode',mode,''],
   ['Coverage type',cov,''],
   ['Insurance rate','',Math.round(rate*1000)/10+'‰ ('+Math.round(rate*10000)/100+'%)'],
   ['Premium','',inr(premium)],
   ['Deductible','',inr(ded)],
   ['Effective coverage (value − deductible)','',inr(coverage)]];
  return{rows,k1:inr(premium),k2:Math.round(rate*10000)/100+'%',k3:inr(coverage)};}
