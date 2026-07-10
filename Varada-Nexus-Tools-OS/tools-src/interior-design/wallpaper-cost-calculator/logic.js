export function compute(v){
  const L=+v.length||15,W=+v.width||12,H=+v.height||10,doors=+v.doors||2;
  const rw=(+v.roll_width||21)/12,rl=+v.roll_length||33,rep=(+v.pattern||0)/12,price=+v.price||1800;
  const wallArea=(2*(L+W)*H)-(doors*20);
  const stripsPerRoll=Math.floor(rl/(H+rep));
  const totalStrips=Math.ceil(wallArea/(H*(rw)));
  const rolls=Math.ceil(totalStrips/stripsPerRoll*1.10);
  const cost=rolls*price;
  const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
  const rows=[['Wall area (net)','',Math.round(wallArea)+' sq ft'],['Strips needed','',totalStrips],['Strips per roll','',stripsPerRoll],['Rolls (incl. 10% waste)','',rolls],['Price per roll','',inr(price)],['Total cost','',inr(cost)]];
  return{rows,k1:rolls+' rolls',k2:inr(cost),k3:Math.round(wallArea)+' sq ft'};}
