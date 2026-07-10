const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const mode=v.mode||'sea',cbm=+v.cargo_cbm||10,wt=+v.cargo_weight||500;
  const rate=+v.base_rate||8000,fuelPct=+v.fuel_surcharge_pct||15;
  const thc=+v.thc||6500,bl=+v.bl_fee||2500,dest=+v.destination_charges||8000;
  let chargeable,baseFreight,unitLabel;
  if(mode==='air'){
    const volWt=Math.round(cbm*167);
    chargeable=Math.max(wt,volWt);
    baseFreight=Math.round(chargeable*rate);
    unitLabel=chargeable+' kg (chargeable)';
  } else {
    chargeable=cbm;
    baseFreight=Math.round(cbm*rate);
    unitLabel=cbm+' CBM';
  }
  const fuelSurcharge=Math.round(baseFreight*fuelPct/100);
  const total=baseFreight+fuelSurcharge+thc+bl+dest;
  const perUnit=mode==='air'?Math.round(total/wt):Math.round(total/cbm);
  return{
    rows:[
      ['Base Freight',unitLabel,inr(baseFreight)],
      ['Fuel Surcharge',fuelPct+'%',inr(fuelSurcharge)],
      ['THC / Handling','',inr(thc)],
      ['BL / AWB Fee','',inr(bl)],
      ['Destination Charges','',inr(dest)],
      ['Total Freight','',inr(total)]],
    k1:inr(total),k2:inr(perUnit)+'/'+(mode==='air'?'kg':'CBM'),k3:unitLabel};
}
