const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const vol=+v.rock_volume_bcm||50000,pf=+v.powder_factor||0.35;
  const expCost=+v.explosive_cost||55,detPerHole=+v.detonator_per_hole||2;
  const holes=+v.holes_per_blast||200,detCost=+v.detonator_cost||350,accPct=+v.accessories_pct||15;
  const expKg=Math.round(vol*pf);
  const expCostTotal=Math.round(expKg*expCost);
  const detQty=holes*detPerHole;
  const detTotal=detQty*detCost;
  const accessories=Math.round(expCostTotal*accPct/100);
  const total=expCostTotal+detTotal+accessories;
  const perBCM=Math.round(total/vol*100)/100;
  return{
    rows:[
      ['Explosive Quantity',vol.toLocaleString('en-IN')+' BCM × '+pf+' kg/BCM',expKg.toLocaleString('en-IN')+' kg'],
      ['Explosive Cost',inr(expCost)+'/kg',inr(expCostTotal)],
      ['Detonators',detQty+' units × ₹'+detCost,inr(detTotal)],
      ['Accessories & Accessories',accPct+'%',inr(accessories)],
      ['Total Blast Cost','',inr(total)]],
    k1:inr(total),k2:inr(perBCM)+'/BCM',k3:expKg.toLocaleString('en-IN')+' kg'};
}
