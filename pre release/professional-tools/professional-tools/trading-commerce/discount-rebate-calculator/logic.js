const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const lp=+v.list_price||1000,qty=+v.quantity||200;
  const tdR=+v.trade_discount||10,cdR=+v.cash_discount||2;
  const rebR=+v.annual_rebate||1.5,annPurch=+v.annual_purchase_value||2000000;
  const listTotal=lp*qty;
  const tradeDisc=Math.round(listTotal*tdR/100);
  const afterTrade=listTotal-tradeDisc;
  const cashDisc=Math.round(afterTrade*cdR/100);
  const netTotal=afterTrade-cashDisc;
  const netUnit=Math.round(netTotal/qty);
  const annRebate=Math.round(annPurch*rebR/100);
  const effDisc=Math.round((listTotal-netTotal)/listTotal*1000)/10;
  return{
    rows:[
      ['List Price',qty+' × ₹'+lp,inr(listTotal)],
      ['Trade Discount',tdR+'%','-'+inr(tradeDisc)],
      ['After Trade Discount','',inr(afterTrade)],
      ['Cash Discount (if taken)',cdR+'%','-'+inr(cashDisc)],
      ['Net Invoice Value','',inr(netTotal)],
      ['Annual Rebate (year-end)',rebR+'% on '+inr(annPurch),inr(annRebate)]],
    k1:inr(netUnit)+'/unit',k2:effDisc+'%',k3:inr(annRebate)};
}
