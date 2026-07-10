const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const sv=+v.sales_value||1000000,baseR=+v.base_commission||3;
  const target=+v.target_value||1000000,bonusR=+v.bonus_rate||1,gstR=+v.gst_on_commission||18;
  const baseComm=Math.round(sv*baseR/100);
  const aboveTarget=Math.max(0,sv-target);
  const bonusComm=Math.round(aboveTarget*bonusR/100);
  const totalPreGst=baseComm+bonusComm;
  const gst=Math.round(totalPreGst*gstR/100);
  const totalComm=totalPreGst+gst;
  const effRate=Math.round(totalPreGst/sv*1000)/10;
  const netRevenue=sv-totalComm;
  return{
    rows:[
      ['Base Commission',baseR+'% of ₹'+sv.toLocaleString('en-IN'),inr(baseComm)],
      ['Bonus Commission',bonusR+'% of ₹'+aboveTarget.toLocaleString('en-IN'),inr(bonusComm)],
      ['Total Commission (pre-GST)','',inr(totalPreGst)],
      ['GST on Commission',gstR+'%',inr(gst)],
      ['Total Commission (incl GST)','',inr(totalComm)],
      ['Net Revenue after Commission','',inr(netRevenue)]],
    k1:inr(totalComm),k2:effRate+'%',k3:inr(netRevenue)};
}
