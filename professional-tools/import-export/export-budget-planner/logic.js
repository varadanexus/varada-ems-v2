const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const ev=+v.annual_export_value||10000000;
  const cogs=Math.round(ev*(+v.cogs_pct||55)/100);
  const freight=Math.round(ev*(+v.freight_pct||6)/100);
  const commission=Math.round(ev*(+v.agent_commission_pct||5)/100);
  const cert=+v.certification_cost||150000;
  const fair=+v.trade_fair_cost||200000;
  const finance=Math.round(ev*(+v.finance_cost_pct||2)/100);
  const overhead=Math.round(ev*(+v.overhead_pct||5)/100);
  const totalCost=cogs+freight+commission+cert+fair+finance+overhead;
  const profit=ev-totalCost;
  const margin=Math.round(profit/ev*1000)/10;
  return{
    rows:[
      ['Production / COGS',(+v.cogs_pct||55)+'%',inr(cogs)],
      ['Freight & Insurance',(+v.freight_pct||6)+'%',inr(freight)],
      ['Agent Commission',(+v.agent_commission_pct||5)+'%',inr(commission)],
      ['Certifications & Compliance','Fixed',inr(cert)],
      ['Trade Fair & Marketing','Fixed',inr(fair)],
      ['Export Finance',(+v.finance_cost_pct||2)+'%',inr(finance)],
      ['Overheads',(+v.overhead_pct||5)+'%',inr(overhead)],
      ['Total Export Budget','',inr(totalCost)]],
    k1:inr(totalCost),k2:inr(profit),k3:margin+'%'};
}
