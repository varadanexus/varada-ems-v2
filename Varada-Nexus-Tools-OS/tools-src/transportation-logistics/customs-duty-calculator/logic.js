const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const cif=+v.cif_value||500000,bd=+v.basic_duty||10,igstR=+v.igst||18,swsR=+v.sws||10,handling=+v.handling||15000;
  const basicDuty=Math.round(cif*bd/100);
  const sws=Math.round(basicDuty*swsR/100);
  const igstBase=cif+basicDuty+sws;
  const igst=Math.round(igstBase*igstR/100);
  const totalDuty=basicDuty+sws+igst;
  const landed=cif+totalDuty+handling;
  const effectivePct=Math.round(totalDuty/cif*100*10)/10;
  const rows=[
   ['CIF / Assessable value','',inr(cif)],
   ['Basic customs duty',bd+'%',inr(basicDuty)],
   ['Social Welfare Surcharge',swsR+'% of basic',inr(sws)],
   ['IGST',igstR+'% of (CIF+duty+SWS)',inr(igst)],
   ['Port handling & CHA','',inr(handling)],
   ['Total landed cost','',inr(landed)]];
  return{rows,k1:inr(landed),k2:inr(totalDuty),k3:effectivePct+'%'};}
