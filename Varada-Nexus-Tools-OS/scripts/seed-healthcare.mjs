import { writeTools, CHECKLIST_LOGIC, CHECKLIST_RESULTS } from './_seedlib.mjs';
const REL=[{label:'Hospital Consultancy',url:'/consultancy.html'},{label:'Hospital Infrastructure',url:'/hospital.html'}];
const T=[];
const push=o=>{o.cat='healthcare';o.related=o.related||REL;T.push(o);};

push({id:'icu-bed-requirement-calculator',name:'ICU Bed Requirement Calculator',
 short:'ICU/HDU beds and ventilators needed for a hospital.',
 intro:'Estimate the number of ICU and HDU beds and ventilators a hospital needs, based on total bed strength and the recommended critical-care share.',
 seo:{title:'ICU Bed Requirement Calculator — Critical Care Beds & Ventilators | Varada Nexus',description:'Free ICU bed requirement calculator. Estimate ICU/HDU beds and ventilators from total hospital beds and critical-care percentage.',keywords:['icu bed calculator','critical care bed requirement','ventilator requirement calculator']},
 inputs:[{id:'beds',label:'Total hospital beds',type:'number',default:200,min:1},{id:'pct',label:'Critical-care share (%)',type:'select',default:'10',options:[{v:'5',t:'5% (basic)'},{v:'8',t:'8%'},{v:'10',t:'10% (typical multispecialty)'},{v:'15',t:'15% (tertiary)'}]},{id:'vent',label:'Ventilators per ICU bed (%)',type:'number',default:60,min:0,max:100}],
 results:{rowFmt:'raw',columns:['Item','','Value'],kpis:[{key:'k1',label:'ICU beds',format:'text'},{key:'k2',label:'HDU beds',format:'text'},{key:'k3',label:'Ventilators',format:'text'}]},
 assumptions:'ICU beds ≈ total beds × critical-care %. HDU beds are taken as half the ICU count. Ventilators ≈ ICU beds × ventilator ratio. Actual needs depend on case mix and specialty.',
 faq:[{q:'How many ICU beds does a hospital need?',a:'A common planning norm is 8–12% of total beds as ICU for a multispecialty hospital, rising to 15%+ for tertiary/critical-care hospitals.'},
   {q:'How many ventilators per ICU bed?',a:'Roughly 50–70% of ICU beds should have ventilator support, though dedicated respiratory units may need one per bed.'},
   {q:'What is HDU?',a:'A High Dependency Unit provides a step-down level of care between ICU and general wards, typically sized at about half the ICU capacity.'}],
 logic:`const c=n=>Math.ceil(n);
export function compute(v){const b=+v.beds||0,p=+v.pct||10,vr=+v.vent||60;const icu=c(b*p/100),hdu=c(icu/2),vent=c(icu*vr/100);
 const rows=[['Total beds','',b],['ICU beds','@ '+p+'%',icu],['HDU beds','~50% of ICU',hdu],['Ventilators','@ '+vr+'% of ICU',vent]];
 return{rows,k1:icu+' beds',k2:hdu+' beds',k3:vent};}`});

push({id:'opd-capacity-calculator',name:'OPD Capacity Calculator',
 short:'Daily OPD patient capacity from rooms and consult time.',
 intro:'Estimate how many outpatients your OPD can see per day from the number of consulting rooms, average consultation time and OPD working hours.',
 seo:{title:'OPD Capacity Calculator — Daily Outpatient Capacity | Varada Nexus',description:'Free OPD capacity calculator. Estimate daily outpatient capacity from consulting rooms, consultation time and OPD hours.',keywords:['opd capacity calculator','outpatient capacity','consulting room capacity']},
 inputs:[{id:'rooms',label:'Consulting rooms',type:'number',default:10,min:1},{id:'consult',label:'Average consultation (minutes)',type:'number',default:12,min:1},{id:'hours',label:'OPD hours per day',type:'number',default:8,min:1},{id:'util',label:'Utilisation (%)',type:'number',default:80,min:1,max:100}],
 results:{rowFmt:'raw',columns:['Metric','','Value'],kpis:[{key:'k1',label:'Patients/day',format:'text'},{key:'k2',label:'Patients/room/day',format:'text'},{key:'k3',label:'Patients/month',format:'text'}]},
 assumptions:'Patients per room/day = OPD hours × 60 ÷ consult minutes × utilisation%. Total = rooms × per-room. Monthly assumes 26 working days.',
 faq:[{q:'How is OPD capacity calculated?',a:'Per room = (OPD hours × 60 ÷ average consultation minutes) × utilisation. Multiply by the number of rooms for total daily capacity.'},
   {q:'Why apply a utilisation factor?',a:'Real clinics lose time to gaps, documentation and no-shows, so 75–85% utilisation is more realistic than 100%.'},
   {q:'How do I increase OPD capacity?',a:'Add rooms or sessions, reduce average consultation time where clinically appropriate, or improve scheduling to cut idle time.'}],
 logic:`const c=n=>Math.round(n);
export function compute(v){const r=+v.rooms||0,m=+v.consult||1,h=+v.hours||1,u=+v.util||80;const perRoom=c(h*60/m*u/100),day=perRoom*r,month=day*26;
 const rows=[['Per room/day','@ '+u+'% util',perRoom],['Rooms','',r],['Total per day','',day.toLocaleString('en-IN')],['Per month','26 days',month.toLocaleString('en-IN')]];
 return{rows,k1:day.toLocaleString('en-IN'),k2:perRoom,k3:month.toLocaleString('en-IN')};}`});

push({id:'ipd-occupancy-calculator',name:'IPD Occupancy Calculator',
 short:'Bed occupancy rate from admissions and length of stay.',
 intro:'Calculate inpatient bed occupancy rate and occupied bed-days from bed strength, monthly admissions and average length of stay (ALOS).',
 seo:{title:'IPD Bed Occupancy Calculator — Occupancy Rate & Bed Days | Varada Nexus',description:'Free hospital bed occupancy calculator. Compute occupancy rate and occupied bed-days from beds, admissions and average length of stay.',keywords:['bed occupancy calculator','ipd occupancy rate','hospital occupancy calculator']},
 inputs:[{id:'beds',label:'Total beds',type:'number',default:150,min:1},{id:'admissions',label:'Admissions per month',type:'number',default:900,min:0},{id:'alos',label:'Average length of stay (days)',type:'number',default:4,min:0.1},{id:'days',label:'Days in period',type:'number',default:30,min:1}],
 results:{rowFmt:'raw',columns:['Metric','','Value'],kpis:[{key:'k1',label:'Occupancy rate',format:'text'},{key:'k2',label:'Occupied bed-days',format:'text'},{key:'k3',label:'Available bed-days',format:'text'}]},
 assumptions:'Occupied bed-days = admissions × ALOS. Occupancy rate = occupied bed-days ÷ (beds × days) × 100. Ignores same-day transfers.',
 faq:[{q:'How is bed occupancy rate calculated?',a:'Occupancy % = (admissions × average length of stay) ÷ (beds × days in period) × 100.'},
   {q:'What is a healthy occupancy rate?',a:'Around 80–85% is often considered efficient; consistently above 90% can strain resources, while very low occupancy hurts viability.'},
   {q:'What is ALOS?',a:'Average Length of Stay is the mean number of days a patient stays admitted, a key driver of bed demand.'}],
 logic:`export function compute(v){const b=+v.beds||1,a=+v.admissions||0,l=+v.alos||0,d=+v.days||30;const occ=a*l,avail=b*d,rate=avail>0?occ/avail*100:0;
 const rows=[['Occupied bed-days','admissions x ALOS',Math.round(occ).toLocaleString('en-IN')],['Available bed-days','beds x days',avail.toLocaleString('en-IN')],['Occupancy rate','',(Math.round(rate*10)/10)+'%']];
 return{rows,k1:(Math.round(rate*10)/10)+'%',k2:Math.round(occ).toLocaleString('en-IN'),k3:avail.toLocaleString('en-IN')};}`});

push({id:'hospital-space-planning-calculator',name:'Hospital Space Planning Calculator',
 short:'Built-up area and departmental space split by bed count.',
 intro:'Estimate the total built-up area a hospital needs and how it splits across clinical, diagnostic, support and administrative zones, based on bed count and hospital type.',
 seo:{title:'Hospital Space Planning Calculator — Area Per Bed & Zone Split | Varada Nexus',description:'Free hospital space planning calculator. Estimate total built-up area and departmental space split by bed count and hospital type.',keywords:['hospital space planning','area per bed hospital','hospital built up area calculator']},
 inputs:[{id:'beds',label:'Number of beds',type:'number',default:150,min:1},{id:'type',label:'Hospital type',type:'select',default:'1100',options:[{v:'900',t:'General (~900 sq ft/bed)'},{v:'1100',t:'Multispecialty (~1,100)'},{v:'1400',t:'Super-specialty (~1,400)'}]}],
 results:{rowFmt:'raw',columns:['Zone','share','Area'],kpis:[{key:'k1',label:'Total built-up',format:'text'},{key:'k2',label:'Clinical area',format:'text'},{key:'k3',label:'Support area',format:'text'}]},
 assumptions:'Total area = beds × area per bed. Indicative zone split: clinical/wards 40%, diagnostics & OT 20%, support & services 25%, administration & circulation 15%.',
 faq:[{q:'How much area does a hospital need per bed?',a:'Roughly 900 sq ft/bed for a general hospital, 1,000–1,200 for multispecialty and 1,200–1,600 for super-specialty, including support areas.'},
   {q:'How is hospital space divided between departments?',a:'A typical split is ~40% clinical/wards, 20% diagnostics and OT, 25% support services and 15% administration and circulation.'},
   {q:'Does this include parking and expansion?',a:'No, external parking, services yards and future expansion should be planned separately over and above this built-up area.'}],
 logic:`const sf=n=>Math.round(n).toLocaleString('en-IN')+' sq ft';
export function compute(v){const b=+v.beds||0,pb=+v.type||1100,tot=b*pb;
 const clin=tot*0.4,diag=tot*0.2,sup=tot*0.25,adm=tot*0.15;
 const rows=[['Clinical & wards','40%',sf(clin)],['Diagnostics & OT','20%',sf(diag)],['Support & services','25%',sf(sup)],['Administration & circulation','15%',sf(adm)],['Total built-up','',sf(tot)]];
 return{rows,k1:sf(tot),k2:sf(clin),k3:sf(sup)};}`});

push({id:'medical-equipment-budget-planner',name:'Medical Equipment Budget Planner',
 short:'Equipment capex by bed count with category split.',
 intro:'Plan a hospital medical equipment budget from bed strength and hospital tier, with an indicative split across imaging, OT, ICU, laboratory and general equipment.',
 seo:{title:'Medical Equipment Budget Planner — Hospital Equipment Capex | Varada Nexus',description:'Free medical equipment budget planner. Estimate hospital equipment capex per bed with category split for imaging, OT, ICU and lab.',keywords:['medical equipment budget','hospital equipment cost','equipment planning hospital']},
 inputs:[{id:'beds',label:'Number of beds',type:'number',default:150,min:1},{id:'tier',label:'Hospital tier',type:'select',default:'800000',options:[{v:'500000',t:'Basic (₹5.0L/bed)'},{v:'800000',t:'Multispecialty (₹8.0L/bed)'},{v:'1500000',t:'Super-specialty (₹15.0L/bed)'}]}],
 results:{rowFmt:'raw',columns:['Category','share','Budget'],kpis:[{key:'k1',label:'Total equipment budget',format:'text'},{key:'k2',label:'Per bed',format:'text'},{key:'k3',label:'Imaging share',format:'text'}]},
 assumptions:'Budget = beds × per-bed equipment cost for the chosen tier. Indicative split: imaging 25%, OT & CSSD 20%, ICU & emergency 20%, laboratory 10%, general & ward 25%.',
 faq:[{q:'How much should I budget for hospital equipment?',a:'As a planning guide, roughly ₹5–15 lakh per bed depending on the specialty tier, on top of civil construction cost.'},
   {q:'How is the equipment budget split?',a:'Imaging (~25%) and OT/ICU (~40% combined) usually dominate, with lab and ward equipment making up the rest.'},
   {q:'Should I include AMC and consumables?',a:'This is capex only. Annual maintenance contracts and consumables are recurring costs to be budgeted separately.'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){const b=+v.beds||0,pb=+v.tier||800000,tot=b*pb;
 const rows=[['Imaging & radiology','25%',inr(tot*.25)],['OT & CSSD','20%',inr(tot*.2)],['ICU & emergency','20%',inr(tot*.2)],['Laboratory','10%',inr(tot*.1)],['General & ward','25%',inr(tot*.25)],['Total','',inr(tot)]];
 return{rows,k1:inr(tot),k2:inr(pb),k3:inr(tot*.25)};}`});

push({id:'oxygen-consumption-calculator',name:'Hospital Oxygen Consumption Calculator',
 short:'Daily medical oxygen demand and cylinder/LMO sizing.',
 intro:'Estimate a hospital’s daily medical oxygen demand in litres and cubic metres from ICU and ward bed usage, and convert it into jumbo cylinders or LMO tank sizing.',
 seo:{title:'Hospital Oxygen Consumption Calculator — Daily O2 Demand & Cylinders | Varada Nexus',description:'Free medical oxygen consumption calculator. Estimate daily hospital oxygen demand and cylinder/LMO requirement from ICU and ward beds.',keywords:['medical oxygen calculator','hospital oxygen demand','oxygen cylinder requirement']},
 inputs:[{id:'icu',label:'ICU/critical beds',type:'number',default:20,min:0},{id:'ward',label:'Ward/oxygen beds',type:'number',default:80,min:0},{id:'icuLpm',label:'ICU flow (LPM/bed)',type:'number',default:10,min:0},{id:'wardLpm',label:'Ward flow (LPM/bed)',type:'number',default:5,min:0},{id:'hours',label:'Hours of use/day',type:'number',default:24,min:1}],
 results:{rowFmt:'raw',columns:['Metric','','Value'],kpis:[{key:'k1',label:'O2 per day',format:'text'},{key:'k2',label:'Cubic metres/day',format:'text'},{key:'k3',label:'Jumbo cylinders/day',format:'text'}]},
 assumptions:'Litres/day = (ICU beds × ICU LPM + ward beds × ward LPM) × 60 × hours. 1 cubic metre = 1,000 L. A jumbo D-type cylinder holds ~7,000 L. Peak/surge demand can be much higher.',
 faq:[{q:'How do I calculate hospital oxygen demand?',a:'Total litres/day = (ICU beds × flow + ward beds × flow) × 60 minutes × hours of use. Divide by 1,000 for cubic metres.'},
   {q:'How many cylinders is that?',a:'A jumbo (D-type) cylinder holds about 7,000 litres, so divide daily litres by 7,000 for cylinders per day.'},
   {q:'When should I consider an LMO tank or PSA plant?',a:'High or continuous demand (large ICUs) is usually cheaper and safer served by a liquid medical oxygen tank or an on-site PSA plant.'}],
 logic:`const n=x=>Math.round(x).toLocaleString('en-IN');
export function compute(v){const i=+v.icu||0,w=+v.ward||0,il=+v.icuLpm||0,wl=+v.wardLpm||0,h=+v.hours||24;
 const lpm=i*il+w*wl,lit=lpm*60*h,cbm=lit/1000,cyl=lit/7000;
 const rows=[['Total flow','peak',lpm.toLocaleString('en-IN')+' LPM'],['Oxygen per day','',n(lit)+' L'],['Cubic metres/day','',n(cbm)+' m³'],['Jumbo cylinders/day','7000 L each',(Math.round(cyl*10)/10)]];
 return{rows,k1:n(lit)+' L',k2:n(cbm)+' m³',k3:(Math.round(cyl*10)/10)+' cyl'};}`});

push({id:'medical-gas-pipeline-estimator',name:'Medical Gas Pipeline (MGPS) Estimator',
 short:'Outlets and indicative cost for a medical gas pipeline system.',
 intro:'Estimate the number of medical gas outlets and indicative MGPS cost for a hospital from bed count and outlets per bed (oxygen, vacuum, air).',
 seo:{title:'Medical Gas Pipeline Estimator — MGPS Outlets & Cost | Varada Nexus',description:'Free medical gas pipeline (MGPS) estimator. Estimate outlets and indicative cost from beds and outlets per bed for a hospital.',keywords:['medical gas pipeline cost','mgps estimator','medical gas outlets calculator']},
 inputs:[{id:'beds',label:'Number of beds',type:'number',default:150,min:1},{id:'outlets',label:'Outlets per bed',type:'number',default:3,min:1},{id:'costOutlet',label:'Cost per outlet incl. piping (₹)',type:'number',default:18000,min:0}],
 results:{rowFmt:'raw',columns:['Metric','','Value'],kpis:[{key:'k1',label:'Total outlets',format:'text'},{key:'k2',label:'Indicative MGPS cost',format:'text'},{key:'k3',label:'Cost per bed',format:'text'}]},
 assumptions:'Outlets = beds × outlets per bed (typically 3: oxygen, vacuum, medical air; ICU/OT need more). Cost = outlets × per-outlet cost including copper piping, and excludes source plant (manifold/PSA/LMO).',
 faq:[{q:'How many medical gas outlets per bed?',a:'General wards need about 3 (oxygen, vacuum, air); ICU and OT beds need more, often 6–12 including nitrous oxide and AGSS.'},
   {q:'What does MGPS cost depend on?',a:'Outlet count, copper piping runs, alarms and the source plant (manifold, PSA generator or LMO tank) drive the cost.'},
   {q:'Is the source plant included?',a:'No, this estimate covers outlets and piping only; the gas source plant should be costed separately.'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){const b=+v.beds||0,o=+v.outlets||3,c=+v.costOutlet||18000,out=b*o,cost=out*c;
 const rows=[['Beds','',b],['Outlets per bed','',o],['Total outlets','',out.toLocaleString('en-IN')],['Indicative cost','@ ₹'+c+'/outlet',inr(cost)]];
 return{rows,k1:out.toLocaleString('en-IN')+' outlets',k2:inr(cost),k3:inr(cost/(b||1))};}`});

push({id:'ambulance-requirement-calculator',name:'Ambulance Requirement Calculator',
 short:'Number of BLS/ALS ambulances a hospital fleet needs.',
 intro:'Estimate the ambulance fleet a hospital needs from bed strength and service norms, split into Basic (BLS) and Advanced (ALS) life-support vehicles.',
 seo:{title:'Ambulance Requirement Calculator — Hospital Fleet Sizing | Varada Nexus',description:'Free ambulance requirement calculator. Estimate BLS and ALS ambulances a hospital needs from bed count and service norms.',keywords:['ambulance requirement calculator','hospital ambulance fleet','bls als ambulance planning']},
 inputs:[{id:'beds',label:'Number of beds',type:'number',default:200,min:1},{id:'perBeds',label:'Beds per ambulance',type:'number',default:100,min:1},{id:'alsShare',label:'ALS share (%)',type:'number',default:40,min:0,max:100}],
 results:{rowFmt:'raw',columns:['Type','','Value'],kpis:[{key:'k1',label:'Total ambulances',format:'text'},{key:'k2',label:'ALS',format:'text'},{key:'k3',label:'BLS',format:'text'}]},
 assumptions:'Total = ceil(beds ÷ beds-per-ambulance), minimum 1. ALS = round(total × ALS share%); the remainder are BLS. Adjust for trauma load, catchment and 24×7 shifts.',
 faq:[{q:'How many ambulances does a hospital need?',a:'A common planning norm is roughly one ambulance per 100–150 beds, with a minimum of one, scaled up for trauma and emergency load.'},
   {q:'What is the difference between BLS and ALS ambulances?',a:'BLS (Basic Life Support) handles stable transport; ALS (Advanced Life Support) carries a ventilator, monitor and critical-care equipment.'},
   {q:'Should shifts be considered?',a:'Yes, 24×7 cover needs multiple crews per vehicle and a buffer for maintenance and simultaneous calls.'}],
 logic:`export function compute(v){const b=+v.beds||0,pb=+v.perBeds||100,as=+v.alsShare||40;const tot=Math.max(1,Math.ceil(b/pb)),als=Math.round(tot*as/100),bls=tot-als;
 const rows=[['Total ambulances','1 per '+pb+' beds',tot],['ALS (advanced)','@ '+as+'%',als],['BLS (basic)','',bls]];
 return{rows,k1:tot+' vehicles',k2:als,k3:bls};}`});

push({id:'hospital-break-even-calculator',name:'Hospital Break-even Calculator',
 short:'Break-even occupancy for a hospital from costs and ARPOB.',
 intro:'Find the bed occupancy a hospital needs to break even, from monthly fixed costs, revenue per occupied bed-day (ARPOB) and variable cost per bed-day.',
 seo:{title:'Hospital Break-even Calculator — Break-even Occupancy | Varada Nexus',description:'Free hospital break-even calculator. Compute the occupancy needed to break even from fixed costs, ARPOB and variable cost per bed-day.',keywords:['hospital break even calculator','break even occupancy','hospital financial planning']},
 inputs:[{id:'beds',label:'Number of beds',type:'number',default:150,min:1},{id:'fixed',label:'Monthly fixed cost (₹)',type:'number',default:15000000,min:0},{id:'arpob',label:'Revenue per occupied bed-day — ARPOB (₹)',type:'number',default:12000,min:0},{id:'varcost',label:'Variable cost per bed-day (₹)',type:'number',default:5000,min:0}],
 results:{rowFmt:'raw',columns:['Metric','','Value'],kpis:[{key:'k1',label:'Break-even occupancy',format:'text'},{key:'k2',label:'Break-even bed-days/mo',format:'text'},{key:'k3',label:'Contribution/bed-day',format:'text'}]},
 assumptions:'Contribution per bed-day = ARPOB − variable cost. Break-even bed-days = fixed cost ÷ contribution. Occupancy% = break-even bed-days ÷ (beds × 30) × 100.',
 faq:[{q:'What is ARPOB?',a:'Average Revenue Per Occupied Bed-day — the average revenue a hospital earns for each occupied bed each day.'},
   {q:'How is hospital break-even occupancy calculated?',a:'Break-even bed-days = monthly fixed cost ÷ (ARPOB − variable cost per bed-day). Occupancy% = that ÷ (beds × 30) × 100.'},
   {q:'What if break-even occupancy exceeds 100%?',a:'It means the current pricing and cost structure cannot break even at full occupancy — ARPOB must rise or costs must fall.'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){const b=+v.beds||1,F=+v.fixed||0,a=+v.arpob||0,vc=+v.varcost||0,cm=a-vc;
 const bd=cm>0?F/cm:0,occ=cm>0?bd/(b*30)*100:0;
 const rows=[['Contribution/bed-day','ARPOB - variable',inr(cm)],['Break-even bed-days/mo','',cm>0?Math.round(bd).toLocaleString('en-IN'):'—'],['Break-even occupancy','',cm>0?(Math.round(occ*10)/10)+'%':'—']];
 return{rows,k1:cm>0?(Math.round(occ*10)/10)+'%':'not achievable',k2:cm>0?Math.round(bd).toLocaleString('en-IN'):'—',k3:inr(cm)};}`});

const n=writeTools(T); console.log('healthcare part-1 seeded '+n+' tools');
export default T;
