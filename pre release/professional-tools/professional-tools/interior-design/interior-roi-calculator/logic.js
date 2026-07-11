const inr=n=>'₹'+Math.round(n*100)/100+' L';
export function compute(v){
  const inv=+v.investment||15,t=v.type||'rental',vb=+v.value_before||80,va=+v.value_after||95;
  const gain=va-vb;
  let roi,payback,annualGain,rows;
  if(t==='rental'){
    annualGain=gain*12;
    roi=annualGain*15/inv*100;
    payback=inv/annualGain;
    rows=[['Monthly rent before','',inr(vb/100)+'L/mo'],['Monthly rent after','',inr(va/100)+'L/mo'],['Monthly rent increase','',inr(gain/100)+'L/mo'],['Annual rent increase','',inr(annualGain/100)],['Capitalised value gain (15× rent)','',inr(annualGain*15/100)],['Net ROI','',Math.round(roi)+'%']];
  }else if(t==='resale'){
    roi=(gain-inv)/inv*100;
    payback=inv/gain;
    rows=[['Value before','',inr(vb)],['Value after','',inr(va)],['Gross uplift','',inr(gain)],['Interior investment','',inr(inv)],['Net gain','',inr(gain-inv)],['ROI','',Math.round(roi)+'%']];
  }else{
    const productivity=inv*0.10*5;
    roi=productivity/inv*100;
    payback=inv/productivity*5;
    rows=[['Investment','',inr(inv)],['Productivity gain (10% × 5yr)','',inr(productivity)],['Net ROI over 5 years','',Math.round(roi)+'%']];
  }
  return{rows,k1:inr(gain),k2:Math.round(roi)+'%',k3:Math.round(payback*10)/10+' yrs'};}
