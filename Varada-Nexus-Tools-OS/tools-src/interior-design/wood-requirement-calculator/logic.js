const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const n=+v.pieces||10,L=+v.length||7,W=+v.width||4,T=+v.thickness||2,price=+v.price||4000;
  const volPer=L*(W/12)*(T/12);
  const netVol=volPer*n;
  const orderVol=netVol*1.15;
  const cost=orderVol*price;
  const rows=[['Volume per piece','',Math.round(volPer*1000)/1000+' CFT'],['Net volume ('+n+' pcs)','',Math.round(netVol*100)/100+' CFT'],['Order qty (15% waste)','',Math.round(orderVol*100)/100+' CFT'],['Unit price','',inr(price)+'/CFT'],['Total wood cost','',inr(Math.round(cost))]];
  return{rows,k1:Math.round(orderVol*10)/10+' CFT',k2:inr(Math.round(cost)),k3:inr(Math.round(cost/n))};}
