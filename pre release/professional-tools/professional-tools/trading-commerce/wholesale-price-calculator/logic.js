const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const cogs=+v.cogs_unit||300,oh=+v.overheads_unit||40;
  const mfgM=+v.mfg_margin||20,distM=+v.distributor_margin||15;
  const retM=+v.retailer_margin||30,gstR=+v.gst_rate||12;
  const cost=cogs+oh;
  const msp=Math.round(cost/(1-mfgM/100));
  const dp=Math.round(msp/(1-distM/100));
  const rp=Math.round(dp/(1-retM/100));
  const gst=r=>Math.round(r*gstR/100);
  const profit=msp-cost;
  return{
    rows:[
      ['Your Cost (COGS + OH)','',inr(cost)],
      ['Your Selling Price (MSP)',mfgM+'% margin',inr(msp)],
      ['Distributor Price (DP)',distM+'% margin',inr(dp)],
      ['Consumer Price (MRP)',retM+'% retail margin',inr(rp)],
      ['MSP incl GST',gstR+'%',inr(msp+gst(msp))],
      ['MRP incl GST',gstR+'%',inr(rp+gst(rp))]],
    k1:inr(msp)+'/unit',k2:inr(rp+gst(rp))+'/unit',k3:inr(profit)+'/unit'};
}
