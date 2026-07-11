const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
const RATES={
  iron_ore:{type:'advalorem',rate:15},
  coal:{type:'specific',rate:400},
  bauxite:{type:'advalorem',rate:0.5},
  limestone:{type:'specific',rate:0.80},
  sand:{type:'advalorem',rate:2}};
export function compute(v){
  const mineral=v.mineral||'iron_ore',qty=+v.quantity_mt||10000;
  const saleVal=+v.sale_value_per_mt||3500,dmcR=+v.dmc_rate||30;
  let royaltyPerMT,rateLabel;
  if(mineral==='custom'){
    const cr=+v.custom_rate||0;
    if(v.custom_type==='specific'){royaltyPerMT=cr;rateLabel='₹'+cr+'/MT';}
    else{royaltyPerMT=saleVal*cr/100;rateLabel=cr+'% of ₹'+saleVal;}
  } else {
    const r=RATES[mineral];
    if(r.type==='specific'){royaltyPerMT=r.rate;rateLabel='₹'+r.rate+'/MT';}
    else{royaltyPerMT=saleVal*r.rate/100;rateLabel=r.rate+'% of ₹'+saleVal;}
  }
  const royalty=Math.round(qty*royaltyPerMT);
  const dmc=Math.round(royalty*dmcR/100);
  const nmet=Math.round(royalty*0.02);
  const total=royalty+dmc+nmet;
  return{
    rows:[
      ['Production',qty.toLocaleString('en-IN')+' MT',''],
      ['Royalty',rateLabel+' × '+qty.toLocaleString('en-IN')+' MT',inr(royalty)],
      ['DMF Contribution',dmcR+'% of royalty',inr(dmc)],
      ['NMET','2% of royalty',inr(nmet)],
      ['Total Mineral Levy','',inr(total)]],
    k1:inr(royalty),k2:inr(dmc),k3:inr(total)};
}
