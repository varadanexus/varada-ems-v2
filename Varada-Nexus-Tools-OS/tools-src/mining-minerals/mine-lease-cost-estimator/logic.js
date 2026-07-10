const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const area=+v.lease_area_ha||50;
  const appFee=+v.application_fee||50000;
  const surfRent=+v.surface_rent_per_ha||10000;
  const deadRent=+v.dead_rent_per_ha||5000;
  const prod=+v.annual_production_mt||100000;
  const royPerMT=+v.royalty_per_mt||525;
  const surfTotal=Math.round(area*surfRent);
  const deadTotal=Math.round(area*deadRent);
  const royaltyTotal=Math.round(prod*royPerMT);
  const dmc=Math.round(royaltyTotal*0.30);
  const ibmFee=25000;
  const oneTime=appFee+50000; // appFee + legal estimate
  const annual=surfTotal+Math.max(0,royaltyTotal-deadTotal)+deadTotal+dmc+ibmFee;
  const perMT=prod>0?Math.round(annual/prod*100)/100:0;
  return{
    rows:[
      ['Surface Rent',area+' ha × ₹'+surfRent,inr(surfTotal)+'/year'],
      ['Dead Rent',area+' ha × ₹'+deadRent,inr(deadTotal)+'/year'],
      ['Royalty',prod.toLocaleString('en-IN')+' MT × ₹'+royPerMT,inr(royaltyTotal)+'/year'],
      ['DMF + NMET','~32% of royalty',inr(dmc)+'/year'],
      ['IBM / DGMS Fees','Indicative',inr(ibmFee)+'/year'],
      ['Total Annual Lease Cost','',inr(annual)],
      ['One-Time Costs (appln+legal)','',inr(oneTime)]],
    k1:inr(annual),k2:'₹'+perMT+'/MT',k3:inr(oneTime)};
}
