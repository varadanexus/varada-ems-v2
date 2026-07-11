const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const mc=+v.production_cost_mt||700,roy=+v.royalty_mt||540;
  const trans=+v.transport_to_port||350,port=+v.port_handling||120;
  const edR=+v.export_duty_pct||30,qty=+v.quantity_mt||10000;
  const freight=+v.freight_mt||800,insR=+v.insurance_pct||0.5;
  const costPerMT=mc+roy+trans+port;
  const totalCost=Math.round(costPerMT*qty);
  // FOB is typically the sale price; for margin calc we treat FOB as sale price
  // Here we derive the export duty on FOB assumed at a reasonable market value
  // We need the user's sale price - let's use a market price assumption or the FOB as given
  // Actually in this tool we calculate what the FOB "needs" to be for profitability
  // Let me recalculate: FOB is the contract price. Export duty is on FOB value.
  // We'll show cost buildup and let user see margin
  const fobPerMT=costPerMT; // this is breakeven fob pre-duty
  const exportDutyPerMT=Math.round(fobPerMT*edR/100);
  const fobWithDuty=fobPerMT+exportDutyPerMT;
  const cifPerMT=fobWithDuty+freight+Math.round(fobWithDuty*insR/100);
  const exportDutyTotal=exportDutyPerMT*qty;
  const marginPerMT=0; // at breakeven
  return{
    rows:[
      ['Mining Cost',inr(mc)+'/MT',inr(mc*qty)],
      ['Royalty & DMF',inr(roy)+'/MT',inr(roy*qty)],
      ['Transport to Port',inr(trans)+'/MT',inr(trans*qty)],
      ['Port Handling',inr(port)+'/MT',inr(port*qty)],
      ['Cost at Port (pre-duty)',inr(costPerMT)+'/MT',inr(totalCost)],
      ['Export Duty ('+edR+'% of FOB)',inr(exportDutyPerMT)+'/MT',inr(exportDutyTotal)],
      ['FOB (cost+duty)',inr(fobWithDuty)+'/MT',inr(fobWithDuty*qty)],
      ['CIF (FOB+freight+ins)',inr(cifPerMT)+'/MT',inr(cifPerMT*qty)]],
    k1:inr(fobWithDuty)+'/MT',k2:inr(exportDutyTotal),k3:inr(costPerMT)+'/MT (cost base)'};
}
