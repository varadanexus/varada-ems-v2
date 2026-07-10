const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const amt=+v.finance_amount||2000000,rate=+v.interest_rate||10.5;
  const days=+v.utilization_days||90,proc=+v.processing_fee||5000,other=+v.other_charges||2000;
  const ft=v.finance_type||'cc';
  const interest=Math.round(amt*rate/100*days/365);
  const gstOnInt=Math.round(interest*0.18);
  const totalCost=interest+gstOnInt+proc+other;
  const annCost=Math.round(totalCost/amt*(365/days)*1000)/10;
  const per1L=Math.round(totalCost/amt*100000);
  const typeLabel={'cc':'Cash Credit / OD','bill':'Bill Discounting','lc':'Letter of Credit','term':'Short-Term Loan'};
  return{
    rows:[
      ['Finance Type',typeLabel[ft]||ft,''],
      ['Finance Amount','',inr(amt)],
      ['Interest',rate+'% × '+days+' days / 365',inr(interest)],
      ['GST on Interest','18%',inr(gstOnInt)],
      ['Processing / LC Fee','',inr(proc)],
      ['Other Bank Charges','',inr(other)],
      ['Total Finance Cost','',inr(totalCost)]],
    k1:inr(totalCost),k2:annCost+'%',k3:inr(per1L)+'/₹1 lakh'};
}
