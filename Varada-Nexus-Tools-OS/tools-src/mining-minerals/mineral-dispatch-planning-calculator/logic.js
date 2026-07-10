const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const annTarget=+v.annual_target_mt||600000;
  const stockpile=+v.current_stockpile||50000;
  const monthProd=+v.monthly_production||55000;
  const shutdown=+v.plant_shutdown_days||2;
  const months=+v.months_remaining||12;
  const minStock=+v.min_stockpile||10000;
  const transport=+v.transport_capacity_monthly||60000;
  const effectiveProd=Math.round(monthProd*(1-shutdown/30));
  const availableToDispatch=stockpile-minStock;
  const totalAvail=effectiveProd*months+Math.max(0,availableToDispatch);
  const monthlyRequired=Math.round(annTarget/months);
  const achievable=Math.min(totalAvail,transport*months);
  const transportOK=monthlyRequired<=transport?'Sufficient':'CONSTRAINED';
  return{
    rows:[
      ['Annual Target',annTarget.toLocaleString('en-IN')+' MT',''],
      ['Months Remaining',months,''],
      ['Required Monthly Dispatch','Target / months',monthlyRequired.toLocaleString('en-IN')+' MT'],
      ['Effective Monthly Prod','',effectiveProd.toLocaleString('en-IN')+' MT'],
      ['Usable Stockpile',stockpile+' − '+minStock+' buffer',Math.max(0,availableToDispatch).toLocaleString('en-IN')+' MT'],
      ['Total Available in Period','Prod × months + stock',totalAvail.toLocaleString('en-IN')+' MT'],
      ['Transport Capacity',transport.toLocaleString('en-IN')+' MT/month',transportOK],
      ['Achievable Dispatch','Min(available, transport)',achievable.toLocaleString('en-IN')+' MT']],
    k1:monthlyRequired.toLocaleString('en-IN')+' MT/month',k2:achievable.toLocaleString('en-IN')+' MT',k3:transportOK};
}
