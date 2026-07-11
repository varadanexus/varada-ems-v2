const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const up=+v.unit_price||450,qty=+v.quantity||1000;
  const freight=+v.freight||8000,ins=+v.insurance||1500;
  const gstR=+v.gst_rate||18,handling=+v.handling_charges||2000,qc=+v.inspection_cost||1000;
  const base=up*qty;
  const gst=Math.round(base*gstR/100);
  const total=base+gst+freight+ins+handling+qc;
  const perUnit=Math.round(total/qty);
  return{
    rows:[
      ['Supplier Base Price',qty+' × ₹'+up,inr(base)],
      ['GST',gstR+'%',inr(gst)],
      ['Freight','',inr(freight)],
      ['Insurance','',inr(ins)],
      ['Handling / Unloading','',inr(handling)],
      ['Inspection / QC','',inr(qc)],
      ['Total PO Cost','',inr(total)]],
    k1:inr(total),k2:inr(perUnit)+'/unit',k3:inr(gst)};
}
