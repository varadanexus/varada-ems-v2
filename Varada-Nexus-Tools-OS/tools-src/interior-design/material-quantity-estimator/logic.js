const TILE_AREA={'1x1':1,'2x2':4,'2x4':8};
export function compute(v){
  const L=+v.length||14,W=+v.width||12,H=+v.height||10,d=+v.doors||1,w=+v.windows||2;
  const ts=v.tile_size||'2x2';
  const floor=L*W;
  const wallGross=2*(L+W)*H;
  const openings=d*21+w*12;
  const netWall=Math.max(0,wallGross-openings);
  const paintLitres=Math.ceil(netWall/120);
  const ceilPaint=Math.ceil(floor/120);
  const tileArea=TILE_AREA[ts]||4;
  const tilesNeeded=Math.ceil(floor*1.10/tileArea);
  const cementFloor=Math.ceil(floor/10);
  const cementWall=Math.ceil(netWall/8);
  const totalCement=cementFloor+cementWall;
  const sand=Math.round(floor*0.5);
  const putty=Math.ceil(netWall/80);
  const rows=[['Net wall area','',Math.round(netWall)+' sq ft'],['Floor area','',floor+' sq ft'],['Wall paint (2 coats)','@120 sq ft/L',paintLitres+' litres'],['Ceiling paint','@120 sq ft/L',ceilPaint+' litres'],['Wall putty','@80 sq ft/kg',putty+' kg'],['Floor tiles ('+ts+' ft)','10% waste',tilesNeeded+' tiles'],['Cement (floor+wall tile)','',totalCement+' bags'],['Sand','',sand+' cft']];
  return{rows,k1:paintLitres+' L',k2:tilesNeeded+' tiles',k3:totalCement+' bags'};}
