const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const prod=+v.product||0, fr=+v.freight||0, ins=+v.insurance||0, dR=+v.duty||0, gR=+v.igst||0, cl=+v.clearing||0, q=+v.qty||1;
  const cif=prod+fr+ins, duty=cif*dR/100, igst=(cif+duty)*gR/100;
  const landedExclIgst=cif+duty+cl, totalOutflow=landedExclIgst+igst;
  const rows=[['CIF value','product+freight+insurance',inr(cif)],['Customs duty','@ '+dR+'%',inr(duty)],['Clearing & handling','',inr(cl)],['Landed cost (excl. IGST)','',inr(landedExclIgst)],['IGST (creditable)','@ '+gR+'%',inr(igst)],['Total cash outflow','',inr(totalOutflow)]];
  return {rows,k1:inr(landedExclIgst/q),k2:inr(landedExclIgst),k3:inr(igst)};
}
