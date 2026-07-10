const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const amt=+v.amount||0, rate=+v.gstRate||0, add=v.mode!=='remove';
  let base,gst,total;
  if(add){base=amt; gst=amt*rate/100; total=amt+gst;} else {base=amt*100/(100+rate); gst=amt-base; total=amt;}
  const rows=[['Base amount','',inr(base)],['CGST','@ '+(rate/2)+'%',inr(gst/2)],['SGST','@ '+(rate/2)+'%',inr(gst/2)],['Total GST','@ '+rate+'%',inr(gst)]];
  return {rows,total:inr(total),k1:inr(total),k2:inr(gst),k3:inr(base)};
}
