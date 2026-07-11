const PHASES={home:{partial:[['Design & concept',1,3],['Procurement',4,2],['Civil & carpentry',6,6],['Painting & finishing',12,2],['Handover & styling',14,1]],full:[['Design & concept',1,4],['Procurement & material selection',5,3],['Civil & flooring',8,5],['Carpentry & joinery',8,6],['MEP & false ceiling',10,3],['Painting',14,2],['Furnishing & handover',16,2]],turnkey:[['Design & 3D visualisation',1,6],['Material finalisation',7,2],['Civil & structural',9,5],['Carpentry (custom)',9,8],['MEP & false ceiling',12,4],['Tile / flooring',14,3],['Painting',17,2],['Furniture & soft furnishings',19,3],['Snag fixing & handover',22,1]]},
reno:{partial:[['Survey & design',1,2],['Demolition',3,1],['Civil repairs',4,3],['Flooring & painting',7,3],['Handover',10,1]],full:[['Survey & design',1,3],['Demolition & civil',4,3],['Flooring & carpentry',7,5],['MEP upgrades',9,3],['Painting & finishing',12,2],['Handover',14,1]],turnkey:[['Condition survey & design',1,4],['Demolition',5,2],['Civil & waterproofing',7,4],['MEP & false ceiling',9,4],['Flooring & carpentry',11,5],['Painting',16,2],['Furnishing & handover',18,2]]},
office:{partial:[['Space planning',1,2],['Procurement',3,2],['Partitions & MEP',5,4],['Flooring & ceiling',7,3],['Handover',10,1]],full:[['Space planning & design',1,3],['Procurement',4,2],['Civil & MEP',6,5],['Partitions & false ceiling',8,4],['Furniture & IT',12,3],['Commissioning',15,1]],turnkey:[['Concept & design',1,4],['BOQ & procurement',5,3],['Civil & MEP',8,5],['Partitions, ceiling, flooring',10,5],['Furniture, IT, AV',15,3],['Punch list & handover',18,1]]},
hospital:{full:[['Design & compliance review',1,5],['Procurement (long-lead)',6,4],['Civil & MEP',10,8],['Modular OT / flooring',14,6],['Medical gas & HVAC fit-out',16,5],['Infection control validation',21,2],['Handover',23,1]],turnkey:[['Design & regulatory brief',1,6],['Material & vendor selection',7,4],['Civil & MEP',11,10],['OT / clean room installation',15,8],['Commissioning & validation',23,3],['NABH compliance check',26,2],['Handover',28,1]]}};
export function compute(v){
  const t=v.type||'home',sc=v.scope||'full',a=+v.area||1500;
  const cat=PHASES[t]||PHASES.home;
  const phases=cat[sc]||cat.full;
  const extraWks=Math.floor((a-1000)/500);
  const rows=phases.map(([ph,st,dur])=>[ph,'Week '+st,dur+' week(s)']);
  const lastPhase=phases[phases.length-1];
  const total=lastPhase[1]+lastPhase[2]-1+Math.max(0,extraWks);
  const onsite=phases.filter(p=>p[0].match(/civil|carpentry|flooring|construction|install|demolition|MEP/i)).reduce((s,p)=>s+p[2],0);
  const design=phases[0][2];
  return{rows,k1:total+' weeks (~'+Math.round(total/4)+' months)',k2:onsite+' weeks',k3:design+' weeks'};}
