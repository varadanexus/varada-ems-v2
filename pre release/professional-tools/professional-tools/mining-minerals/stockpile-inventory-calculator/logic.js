const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const shape=v.stockpile_shape||'cone',l=+v.length||60,w=+v.width||40,h=+v.height||8;
  const bd=+v.bulk_density||2.0,price=+v.sale_price_mt||4500,moist=+v.moisture_pct||5;
  let vol,shapeLabel;
  if(shape==='cone'){
    const r=Math.min(l,w)/2;
    vol=Math.round(Math.PI*r*r*h/3);
    shapeLabel='Cone (r='+r+'m, h='+h+'m)';
  } else {
    const A1=l*w,A2=(l-2*h)*(w-2*h),safeA2=Math.max(0,A2);
    vol=Math.round(h/3*(A1+safeA2+Math.sqrt(A1*safeA2)));
    shapeLabel='Trapezoidal '+l+'×'+w+'×'+h+'m';
  }
  const wetTonnes=Math.round(vol*bd);
  const dryTonnes=Math.round(wetTonnes*(1-moist/100));
  const value=Math.round(dryTonnes*price);
  return{
    rows:[
      ['Shape',shapeLabel,''],
      ['Volume',Math.round(vol).toLocaleString('en-IN')+' m³',''],
      ['Bulk Density',bd+' MT/m³',''],
      ['Wet Tonnes',wetTonnes.toLocaleString('en-IN')+' MT',''],
      ['Moisture',moist+'%',''],
      ['Dry (Billing) Tonnes',wetTonnes+' × '+(1-moist/100),dryTonnes.toLocaleString('en-IN')+' MT'],
      ['Stockpile Value',dryTonnes.toLocaleString('en-IN')+' MT × ₹'+price,inr(value)]],
    k1:dryTonnes.toLocaleString('en-IN')+' MT',k2:inr(value),k3:vol.toLocaleString('en-IN')+' m³'};
}
