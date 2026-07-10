const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const mSales=+v.buyer_monthly_sales||1000000;
  const phMap={excellent:1.5,good:1.0,average:0.6,poor:0.3};
  const secMap={none:1.0,partial:1.3,full:1.8};
  const indMap={low:1.2,medium:1.0,high:0.7};
  const yearMult=+v.years_in_business>=10?1.3:+v.years_in_business>=5?1.1:+v.years_in_business>=2?0.9:0.6;
  const ph=phMap[v.payment_history]||1.0;
  const sec=secMap[v.secured]||1.0;
  const ind=indMap[v.industry_risk]||1.0;
  const baseLimit=mSales*0.20;
  const limit=Math.round(baseLimit*ph*sec*ind*yearMult/10000)*10000;
  const riskScore=ph*ind;
  const band=riskScore>=1.1?'Low Risk':riskScore>=0.7?'Medium Risk':'High Risk';
  const period=riskScore>=1.1?'45 days':riskScore>=0.7?'30 days':'Cash / 15 days';
  return{
    rows:[
      ['Base Limit (20% monthly sales)','₹'+mSales.toLocaleString('en-IN')+' × 20%',inr(baseLimit)],
      ['Payment History Multiplier',v.payment_history||'good','× '+ph],
      ['Security Multiplier',v.secured||'none','× '+sec],
      ['Industry Risk Multiplier',v.industry_risk||'medium','× '+ind],
      ['Tenure Multiplier',v.years_in_business+' years','× '+yearMult],
      ['Recommended Credit Limit','',inr(limit)]],
    k1:inr(limit),k2:period,k3:band};
}
