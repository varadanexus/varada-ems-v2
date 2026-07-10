const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const s5=+v.sales_5||0,s12=+v.sales_12||500000;
  const s18=+v.sales_18||300000,s28=+v.sales_28||0;
  const itc=+v.purchase_itc||80000,rev=+v.itc_reversal||0;
  const out5=Math.round(s5*5/100),out12=Math.round(s12*12/100);
  const out18=Math.round(s18*18/100),out28=Math.round(s28*28/100);
  const totalOut=out5+out12+out18+out28;
  const netItc=Math.max(0,itc-rev);
  const netPayable=Math.max(0,totalOut-netItc);
  const totalSales=s5+s12+s18+s28;
  const effRate=totalSales>0?Math.round(totalOut/totalSales*1000)/10:0;
  return{
    rows:[
      ['Output GST @ 5%',inr(s5)+' sales',inr(out5)],
      ['Output GST @ 12%',inr(s12)+' sales',inr(out12)],
      ['Output GST @ 18%',inr(s18)+' sales',inr(out18)],
      ['Output GST @ 28%',inr(s28)+' sales',inr(out28)],
      ['Total Output GST','',inr(totalOut)],
      ['Less: Net ITC','After reversal of '+inr(rev),inr(netItc)],
      ['Net GST Payable','',inr(netPayable)]],
    k1:inr(totalOut),k2:inr(netPayable),k3:effRate+'%'};
}
