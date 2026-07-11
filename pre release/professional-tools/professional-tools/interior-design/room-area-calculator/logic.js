export function compute(v){
  const L=+v.length||15,W=+v.width||12,H=+v.height||10,d=+v.doors||1,w=+v.windows||2;
  const floor=L*W,ceil=L*W;
  const grossWall=2*(L+W)*H;
  const openings=d*21+w*12;
  const netWall=Math.max(0,grossWall-openings);
  const paintLitres=Math.ceil(netWall/120);
  const tilesSqFt=Math.ceil(floor*1.10);
  const rows=[['Floor area','',floor+' sq ft'],['Ceiling area','',ceil+' sq ft'],['Gross wall area','',Math.round(grossWall)+' sq ft'],['Door + window openings','',openings+' sq ft'],['Net wall area','',Math.round(netWall)+' sq ft'],['Paint needed (2 coats)','@120 sq ft/L',paintLitres+' litres'],['Floor tiles to order','10% waste',tilesSqFt+' sq ft']];
  return{rows,k1:floor+' sq ft',k2:Math.round(netWall)+' sq ft',k3:ceil+' sq ft'};}
