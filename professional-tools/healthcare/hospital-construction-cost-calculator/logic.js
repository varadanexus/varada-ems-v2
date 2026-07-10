// Per-tool math only. Platform supplies form, layout, formatting, links, SEO.
export const CONFIG = { MEP_PCT:0.25, HVAC_PCT:0.15, MEDGAS_FIRE_PCT:0.08 };
export function compute(v){
  const beds = Math.max(1, +v.beds||0);
  const area = (+v.areaOverride>0) ? +v.areaOverride : beds*(+v.type);
  const civil = area*(+v.quality)*(+v.city);
  const mep = civil*CONFIG.MEP_PCT, hvac = civil*CONFIG.HVAC_PCT, medgas = civil*CONFIG.MEDGAS_FIRE_PCT;
  const building = civil+mep+hvac+medgas;
  const equip = building*((+v.equip||0)/100);
  const cont = (building+equip)*((+v.contingency||0)/100);
  const land = +v.land||0;
  const total = building+equip+cont+land;
  const rows = [
    ["Civil construction", area.toLocaleString('en-IN')+" sq ft", civil],
    ["MEP (electrical, plumbing, IT)","25% of civil", mep],
    ["HVAC (incl. OT/ICU zoning)","15% of civil", hvac],
    ["Medical gas + fire fighting","8% of civil", medgas],
    ["Medical equipment",(+v.equip||0)+"% of building", equip],
    ["Contingency",(+v.contingency||0)+"%", cont]
  ];
  if(land>0) rows.push(["Land","as entered", land]);
  return { area, total, perBed: total/beds, rows };
}
