const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const cif=+v.cif_inr||500000,bcdR=+v.bcd_rate||10,igstR=+v.igst_rate||18,qty=+v.quantity||1;
  const bcd=Math.round(cif*bcdR/100);
  const sws=Math.round(bcd*0.10);
  const igstBase=cif+bcd+sws;
  const igst=Math.round(igstBase*igstR/100);
  const total=bcd+sws+igst;
  const effPct=Math.round(total/cif*1000)/10;
  const perUnit=Math.round(total/qty);
  return{
    rows:[
      ['Basic Customs Duty (BCD)',bcdR+'% of CIF',inr(bcd)],
      ['Social Welfare Surcharge (SWS)','10% of BCD',inr(sws)],
      ['IGST',igstR+'% of (CIF+BCD+SWS)',inr(igst)],
      ['Total Duty','',inr(total)]],
    k1:inr(total),k2:effPct+'%',k3:inr(perUnit)+'/unit'};
}
