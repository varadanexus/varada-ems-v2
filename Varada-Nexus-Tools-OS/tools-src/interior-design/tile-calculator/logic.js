const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN'); const num=n=>Math.ceil(n).toLocaleString('en-IN');
export function compute(v){
  const a=+v.area||0,ts=+v.size||1,wst=+v.wastage||0,pb=+v.perBox||1,bp=+v.boxPrice||0;
  const tiles=Math.ceil(a/ts*(1+wst/100)), boxes=Math.ceil(tiles/pb), cost=boxes*bp;
  const rows=[['Area','tile '+ts+' sq ft',a.toLocaleString('en-IN')+' sq ft'],['Tiles needed','incl. '+wst+'% wastage',num(tiles)],['Boxes needed','@ '+pb+'/box',num(boxes)],['Estimated cost','@ ₹'+bp+'/box',inr(cost)]];
  return {rows,k1:num(tiles),k2:num(boxes)+' boxes',k3:inr(cost)};
}
