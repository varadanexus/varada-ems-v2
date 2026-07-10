const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const amt=+v.foreign_amount||10000,rate=+v.exchange_rate||83.5,spread=+v.bank_spread||0.25;
  const ttChg=+v.tt_charges||500,dir=v.direction||'import';
  const grossInr=amt*rate;
  const spreadAmt=Math.round(grossInr*spread/100);
  const gstOnSpread=Math.round(spreadAmt*0.18);
  const bankCharges=spreadAmt+gstOnSpread+ttChg;
  const netInr=dir==='export'?Math.round(grossInr-bankCharges):Math.round(grossInr+bankCharges);
  const effRate=Math.round(netInr/amt*100)/100;
  return{
    rows:[
      ['Foreign Amount',v.currency||'USD',Math.round(amt).toLocaleString('en-IN')],
      ['Gross INR',rate+' × '+Math.round(amt),inr(grossInr)],
      ['Bank Spread',spread+'%',inr(spreadAmt)],
      ['GST on Commission','18%',inr(gstOnSpread)],
      ['TT / Wire Charges','',inr(ttChg)],
      ['Net INR '+(dir==='export'?'Received':'Paid'),'',inr(netInr)]],
    k1:inr(netInr),k2:'₹'+effRate+'/'+v.currency,k3:inr(bankCharges)};
}
