const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){const b=+v.base||0,o=+v.oh||0,g=+v.gst||0,oh=b*o/100,pre=b+oh,gst=pre*g/100,tot=pre+gst;
 const rows=[['Base cost','',inr(b)],['Overhead & profit','@ '+o+'%',inr(oh)],['Sub-total','',inr(pre)],['GST','@ '+g+'%',inr(gst)],['Contract price','',inr(tot)]];
 return{rows,k1:inr(tot),k2:inr(oh),k3:inr(gst)};}
