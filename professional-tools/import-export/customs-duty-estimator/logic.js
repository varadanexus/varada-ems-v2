const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const cif=+v.cif_inr||800000,bcdR=+v.bcd||10,addR=+v.add_rate||0,cessR=+v.cess_rate||0,igstR=+v.igst_rate||18;
  const bcd=Math.round(cif*bcdR/100);
  const sws=Math.round(bcd*0.10);
  const add=Math.round(cif*addR/100);
  const cessBase=cif+bcd+sws;
  const cess=Math.round(cessBase*cessR/100);
  const igstBase=cif+bcd+sws+add+cess;
  const igst=Math.round(igstBase*igstR/100);
  const total=bcd+sws+add+cess+igst;
  const eff=Math.round(total/cif*1000)/10;
  return{
    rows:[
      ['BCD',bcdR+'%',inr(bcd)],
      ['SWS','10% of BCD',inr(sws)],
      ['Anti-Dumping Duty',addR+'%',inr(add)],
      ['Compensation Cess',cessR+'%',inr(cess)],
      ['IGST',igstR+'%',inr(igst)],
      ['Total Duty','',inr(total)]],
    k1:inr(total),k2:eff+'%',k3:inr(cif+total)};
}
