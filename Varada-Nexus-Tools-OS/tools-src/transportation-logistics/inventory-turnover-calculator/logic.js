const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const cogs=+v.cogs||10000000,oi=+v.opening_inv||2000000,ci=+v.closing_inv||1800000,cr=+v.carrying_rate||25;
  const avgInv=(oi+ci)/2;
  const turnover=Math.round(cogs/avgInv*10)/10;
  const dio=Math.round(365/turnover);
  const carryingCost=Math.round(avgInv*cr/100);
  const rows=[
   ['COGS',inr(cogs),''],
   ['Opening inventory',inr(oi),''],
   ['Closing inventory',inr(ci),''],
   ['Average inventory',inr(Math.round(avgInv)),''],
   ['Inventory turnover ratio',turnover+'× per year',''],
   ['Days inventory outstanding (DIO)',dio+' days',''],
   ['Inventory carrying cost ('+cr+'%/yr)',inr(carryingCost),'']];
  return{rows,k1:turnover+'×',k2:dio+' days',k3:inr(carryingCost)+'/yr'};}
