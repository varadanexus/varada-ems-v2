const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const prod=+v.monthly_production||50000,grade=+v.product_grade||62,rec=+v.recovery_pct||88;
  const price=+v.sale_price||4800,royR=+v.royalty_pct||15,dmcR=+v.dmc_pct||32;
  const productMT=Math.round(prod*rec/100);
  const grossRev=Math.round(productMT*price);
  const royalty=Math.round(grossRev*royR/100);
  const dmc=Math.round(royalty*dmcR/100);
  const netRev=grossRev-royalty-dmc;
  const annualNet=netRev*12;
  return{
    rows:[
      ['Ore Production',prod.toLocaleString('en-IN')+' MT/month',''],
      ['Recovery',rec+'%',''],
      ['Product Output',productMT.toLocaleString('en-IN')+' MT @ ₹'+price+'/MT',''],
      ['Gross Revenue','',inr(grossRev)],
      ['Royalty',royR+'%','-'+inr(royalty)],
      ['DMF / NMET',dmcR+'% of royalty','-'+inr(dmc)],
      ['Net Revenue','',inr(netRev)]],
    k1:inr(grossRev),k2:inr(netRev),k3:inr(annualNet)};
}
