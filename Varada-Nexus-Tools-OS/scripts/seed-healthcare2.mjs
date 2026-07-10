import { writeTools, CHECKLIST_LOGIC, CHECKLIST_RESULTS } from './_seedlib.mjs';
const REL=[{label:'Hospital Consultancy',url:'/consultancy.html'},{label:'Hospital Infrastructure',url:'/hospital.html'}];
const T=[]; const push=o=>{o.cat='healthcare';o.related=o.related||REL;T.push(o);};

push({id:'patient-flow-estimator',name:'Patient Flow Estimator',
 short:'Daily admissions and bed demand from OPD and ER load.',
 intro:'Estimate daily inpatient admissions and the beds required from OPD footfall, IPD conversion rate, emergency visits and average length of stay.',
 seo:{title:'Patient Flow Estimator — Admissions & Bed Demand | Varada Nexus',description:'Free patient flow estimator. Project daily admissions and beds required from OPD footfall, conversion rate and length of stay.',keywords:['patient flow calculator','hospital admissions estimator','bed demand calculator']},
 inputs:[{id:'opd',label:'OPD patients per day',type:'number',default:400,min:0},{id:'conv',label:'OPD-to-IPD conversion (%)',type:'number',default:8,min:0,max:100},{id:'er',label:'Emergency visits per day',type:'number',default:60,min:0},{id:'erAdm',label:'ER admission rate (%)',type:'number',default:20,min:0,max:100},{id:'alos',label:'Average length of stay (days)',type:'number',default:4,min:0.1}],
 results:{rowFmt:'raw',columns:['Metric','','Value'],kpis:[{key:'k1',label:'Admissions/day',format:'text'},{key:'k2',label:'Beds required',format:'text'},{key:'k3',label:'Admissions/month',format:'text'}]},
 assumptions:'Admissions/day = OPD × conversion% + ER × ER-admission%. Beds required ≈ admissions/day × ALOS. Monthly assumes 30 days.',
 faq:[{q:'How do I estimate hospital admissions?',a:'Admissions per day = OPD footfall × IPD conversion rate plus emergency visits × ER admission rate.'},
   {q:'How many beds does my patient flow need?',a:'Beds ≈ daily admissions × average length of stay, since each admission occupies a bed for its stay.'},
   {q:'What is a typical OPD-to-IPD conversion?',a:'It varies widely by specialty and setting, commonly around 5–12% of OPD visits leading to admission.'}],
 logic:`export function compute(v){const o=+v.opd||0,c=+v.conv||0,e=+v.er||0,ea=+v.erAdm||0,l=+v.alos||1;
 const adm=o*c/100+e*ea/100,beds=adm*l;
 const rows=[['From OPD','@ '+c+'%',Math.round(o*c/100)],['From ER','@ '+ea+'%',Math.round(e*ea/100)],['Admissions/day','',Math.round(adm)],['Beds required','x ALOS '+l,Math.ceil(beds)]];
 return{rows,k1:Math.round(adm)+'/day',k2:Math.ceil(beds)+' beds',k3:Math.round(adm*30).toLocaleString('en-IN')};}`});

push({id:'hospital-revenue-calculator',name:'Hospital Revenue Calculator',
 short:'Daily, monthly and annual revenue from occupancy and ARPOB.',
 intro:'Project hospital inpatient revenue from bed count, occupancy rate and average revenue per occupied bed-day (ARPOB).',
 seo:{title:'Hospital Revenue Calculator — Daily, Monthly & Annual Revenue | Varada Nexus',description:'Free hospital revenue calculator. Project daily, monthly and annual inpatient revenue from beds, occupancy and ARPOB.',keywords:['hospital revenue calculator','arpob calculator','hospital income projection']},
 inputs:[{id:'beds',label:'Number of beds',type:'number',default:150,min:0},{id:'occ',label:'Occupancy (%)',type:'number',default:75,min:0,max:100},{id:'arpob',label:'ARPOB — revenue per occupied bed-day (₹)',type:'number',default:12000,min:0}],
 results:{rowFmt:'raw',columns:['Period','','Revenue'],kpis:[{key:'k1',label:'Monthly revenue',format:'text'},{key:'k2',label:'Annual revenue',format:'text'},{key:'k3',label:'Daily revenue',format:'text'}]},
 assumptions:'Occupied beds = beds × occupancy%. Daily revenue = occupied beds × ARPOB. Monthly = ×30, annual = ×365. Inpatient revenue only; OPD and diagnostics are additional.',
 faq:[{q:'How is hospital revenue estimated?',a:'Daily revenue = beds × occupancy% × ARPOB (average revenue per occupied bed-day). Scale by 30 or 365 for monthly/annual.'},
   {q:'Does this include OPD and diagnostics?',a:'No, this projects inpatient bed revenue; outpatient, pharmacy and diagnostic income should be added separately.'},
   {q:'What ARPOB should I use?',a:'ARPOB varies by city, specialty and payer mix — use your own realised figure or a comparable hospital’s benchmark.'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){const b=+v.beds||0,o=+v.occ||0,a=+v.arpob||0,ob=b*o/100,day=ob*a;
 const rows=[['Occupied beds','@ '+o+'%',Math.round(ob)],['Daily revenue','',inr(day)],['Monthly revenue','x 30',inr(day*30)],['Annual revenue','x 365',inr(day*365)]];
 return{rows,k1:inr(day*30),k2:inr(day*365),k3:inr(day)};}`});

push({id:'healthcare-roi-calculator',name:'Healthcare ROI Calculator',
 short:'ROI % and payback period for a healthcare investment.',
 intro:'Calculate return on investment and payback period for a healthcare project from the total investment and expected annual net profit.',
 seo:{title:'Healthcare ROI Calculator — Return & Payback for Hospital Projects | Varada Nexus',description:'Free healthcare ROI calculator. Get ROI percentage and payback period from investment and annual net profit for a hospital project.',keywords:['healthcare roi calculator','hospital roi','payback period calculator hospital']},
 inputs:[{id:'investment',label:'Total investment (₹)',type:'number',default:500000000,min:0},{id:'profit',label:'Annual net profit (₹)',type:'number',default:75000000,min:0}],
 results:{rowFmt:'raw',columns:['Metric','','Value'],kpis:[{key:'k1',label:'Annual ROI',format:'text'},{key:'k2',label:'Payback period',format:'text'},{key:'k3',label:'5-year return',format:'text'}]},
 assumptions:'ROI% = annual net profit ÷ investment × 100. Payback = investment ÷ annual net profit. Assumes steady profit and ignores financing cost and the time value of money.',
 faq:[{q:'How is healthcare ROI calculated?',a:'ROI% = annual net profit ÷ total investment × 100. It shows the annual return relative to capital deployed.'},
   {q:'What is payback period?',a:'Payback = total investment ÷ annual net profit — the number of years to recover the initial outlay.'},
   {q:'Does this account for interest and inflation?',a:'No. For financed projects, use a discounted cash-flow (NPV/IRR) analysis for a fuller picture.'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){const i=+v.investment||1,p=+v.profit||0,roi=i>0?p/i*100:0,pb=p>0?i/p:0;
 const rows=[['Annual ROI','',(Math.round(roi*10)/10)+'%'],['Payback period','',p>0?(Math.round(pb*10)/10)+' years':'—'],['5-year net return','',inr(p*5-i)]];
 return{rows,k1:(Math.round(roi*10)/10)+'%',k2:p>0?(Math.round(pb*10)/10)+' yr':'—',k3:inr(p*5)};}`});

push({id:'infection-control-checklist',name:'Hospital Infection Control Checklist',
 kind:'checklist', buttonLabel:'Calculate Infection Control Score',
 short:'Self-assess hospital infection prevention & control readiness.',
 intro:'Assess your hospital’s infection prevention and control (IPC) readiness across hand hygiene, PPE, sterilisation, isolation, surveillance, biomedical waste and antibiotic stewardship.',
 seo:{title:'Hospital Infection Control Checklist — IPC Readiness Self-Assessment | Varada Nexus',description:'Free hospital infection control checklist. Self-assess IPC readiness across hand hygiene, sterilisation, isolation, BMW and stewardship.',keywords:['infection control checklist','ipc checklist hospital','hospital infection prevention']},
 checklist:[
  {name:'1. Hand Hygiene',items:[{id:'h1',text:'Hand-hygiene policy and WHO 5-moments displayed at point of care',critical:true},{id:'h2',text:'Alcohol hand-rub available at every bed/entry',critical:true},{id:'h3',text:'Periodic hand-hygiene compliance audits conducted'}]},
  {name:'2. PPE & Standard Precautions',items:[{id:'p1',text:'Adequate PPE stock and donning/doffing SOPs',critical:true},{id:'p2',text:'Staff trained on standard and transmission-based precautions'}]},
  {name:'3. Sterilisation & CSSD',items:[{id:'s1',text:'Central sterile supply with validated sterilisation cycles',critical:true},{id:'s2',text:'Biological/chemical indicators logged for each load'}]},
  {name:'4. Isolation & Cohorting',items:[{id:'i1',text:'Isolation rooms/protocols for infectious cases',critical:false},{id:'i2',text:'Defined process for MDRO cohorting'}]},
  {name:'5. Surveillance',items:[{id:'v1',text:'HAI surveillance with monthly infection rates',critical:true},{id:'v2',text:'Outbreak detection and reporting mechanism'}]},
  {name:'6. Biomedical Waste',items:[{id:'b1',text:'Colour-coded segregation as per BMW Rules 2016',critical:true},{id:'b2',text:'Authorised BMW disposal vendor with manifests'}]},
  {name:'7. Antibiotic Stewardship',items:[{id:'a1',text:'Antibiotic policy and stewardship programme in place'},{id:'a2',text:'Culture-based prescribing and antibiogram reviewed'}]}
 ],
 results:CHECKLIST_RESULTS,
 assumptions:'A simplified IPC self-assessment covering representative requirements — not a substitute for a full NABH/ICMR infection-control audit. Yes=1, Partial=0.5, No=0; critical items not fully met are flagged as gaps.',
 faq:[{q:'What is hospital infection control?',a:'Infection Prevention and Control (IPC) is the set of practices — hand hygiene, PPE, sterilisation, isolation, surveillance and waste management — that reduce healthcare-associated infections.'},
   {q:'Why is hand hygiene critical?',a:'Hand hygiene is the single most effective measure to prevent cross-transmission of infections in hospitals.'},
   {q:'Does this replace a formal IPC audit?',a:'No. It is a quick readiness indicator; formal accreditation requires assessment against the full NABH/ICMR standards.'}],
 related:REL, logic:CHECKLIST_LOGIC});

push({id:'pharmacy-inventory-calculator',name:'Pharmacy Inventory Calculator',
 short:'Reorder level, order quantity and safety stock for pharmacy.',
 intro:'Calculate reorder level, average inventory and safety stock value for a hospital or retail pharmacy from monthly consumption, lead time and a safety buffer.',
 seo:{title:'Pharmacy Inventory Calculator — Reorder Level & Safety Stock | Varada Nexus',description:'Free pharmacy inventory calculator. Get reorder level, safety stock and average inventory value from consumption and lead time.',keywords:['pharmacy inventory calculator','reorder level calculator','safety stock calculator']},
 inputs:[{id:'monthly',label:'Monthly consumption value (₹)',type:'number',default:2000000,min:0},{id:'lead',label:'Supplier lead time (days)',type:'number',default:7,min:0},{id:'safety',label:'Safety stock (days)',type:'number',default:10,min:0},{id:'review',label:'Review/order cycle (days)',type:'number',default:15,min:1}],
 results:{rowFmt:'raw',columns:['Metric','','Value'],kpis:[{key:'k1',label:'Reorder level',format:'text'},{key:'k2',label:'Safety stock',format:'text'},{key:'k3',label:'Suggested order value',format:'text'}]},
 assumptions:'Daily consumption = monthly ÷ 30. Reorder level = daily × (lead time + safety days). Safety stock = daily × safety days. Suggested order = daily × review cycle. Values, not units.',
 faq:[{q:'What is a reorder level?',a:'The stock level at which you place a new order so replenishment arrives before you run out: daily use × (lead time + safety days).'},
   {q:'How much safety stock should a pharmacy hold?',a:'Enough to cover demand variability and delays — commonly 7–15 days of consumption for fast-moving drugs.'},
   {q:'Does this work in value or units?',a:'This version works in rupee value across the basket; for critical single items, compute in units with the same logic.'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){const m=+v.monthly||0,l=+v.lead||0,s=+v.safety||0,r=+v.review||1,d=m/30;
 const rol=d*(l+s),ss=d*s,order=d*r;
 const rows=[['Daily consumption','',inr(d)],['Safety stock',''+s+' days',inr(ss)],['Reorder level','lead+safety',inr(rol)],['Suggested order',''+r+'-day cycle',inr(order)]];
 return{rows,k1:inr(rol),k2:inr(ss),k3:inr(order)};}`});

push({id:'biomedical-waste-calculator',name:'Biomedical Waste Calculator',
 short:'Daily biomedical waste by category and disposal cost.',
 intro:'Estimate a hospital’s daily biomedical waste generation, its colour-coded category split under BMW Rules 2016, and the monthly disposal cost.',
 seo:{title:'Biomedical Waste Calculator — Daily BMW by Category & Cost | Varada Nexus',description:'Free biomedical waste calculator. Estimate daily hospital BMW, yellow/red/white/blue category split and disposal cost.',keywords:['biomedical waste calculator','bmw calculator hospital','hospital waste generation']},
 inputs:[{id:'beds',label:'Number of beds',type:'number',default:150,min:0},{id:'occ',label:'Occupancy (%)',type:'number',default:80,min:0,max:100},{id:'rate',label:'Waste per occupied bed (kg/day)',type:'number',default:0.5,min:0},{id:'cost',label:'Disposal cost (₹/kg)',type:'number',default:25,min:0}],
 results:{rowFmt:'raw',columns:['Category','share','kg/day'],kpis:[{key:'k1',label:'Total BMW/day',format:'text'},{key:'k2',label:'Monthly disposal cost',format:'text'},{key:'k3',label:'Occupied beds',format:'text'}]},
 assumptions:'Total BMW/day = occupied beds × waste per bed (typically 0.4–0.6 kg of BMW per occupied bed/day). Indicative colour split: yellow 45%, red 30%, white 10%, blue 15%. Disposal cost is monthly (×30).',
 faq:[{q:'How much biomedical waste does a hospital generate?',a:'Roughly 0.4–0.6 kg of segregated biomedical waste per occupied bed per day, over and above general waste.'},
   {q:'What are the BMW colour codes?',a:'Under BMW Rules 2016: yellow (anatomical/soiled), red (contaminated plastics), white (sharps) and blue (glass/metal).'},
   {q:'How is disposal cost estimated?',a:'Multiply total BMW by the per-kg charge from your authorised Common Bio-medical Waste Treatment Facility (CBWTF).'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');const kg=n=>(Math.round(n*100)/100)+' kg';
export function compute(v){const b=+v.beds||0,o=+v.occ||0,r=+v.rate||0,c=+v.cost||0,ob=b*o/100,tot=ob*r;
 const rows=[['Yellow (anatomical/soiled)','45%',kg(tot*.45)],['Red (contaminated plastic)','30%',kg(tot*.30)],['White (sharps)','10%',kg(tot*.10)],['Blue (glass/metal)','15%',kg(tot*.15)],['Total BMW','',kg(tot)]];
 return{rows,k1:kg(tot),k2:inr(tot*c*30),k3:Math.round(ob)+' beds'};}`});

push({id:'hospital-utility-cost-calculator',name:'Hospital Utility Cost Calculator',
 short:'Monthly electricity and water cost for a hospital.',
 intro:'Estimate a hospital’s monthly electricity and water running cost from bed count, per-bed consumption and utility tariffs.',
 seo:{title:'Hospital Utility Cost Calculator — Electricity & Water Running Cost | Varada Nexus',description:'Free hospital utility cost calculator. Estimate monthly electricity and water cost from beds, per-bed usage and tariffs.',keywords:['hospital utility cost','hospital electricity cost','hospital running cost calculator']},
 inputs:[{id:'beds',label:'Number of beds',type:'number',default:150,min:0},{id:'kwh',label:'Power use (kWh/bed/day)',type:'number',default:30,min:0},{id:'tariff',label:'Electricity tariff (₹/kWh)',type:'number',default:9,min:0},{id:'water',label:'Water use (litres/bed/day)',type:'number',default:500,min:0},{id:'waterRate',label:'Water cost (₹/1000 L)',type:'number',default:60,min:0}],
 results:{rowFmt:'raw',columns:['Utility','','Monthly cost'],kpis:[{key:'k1',label:'Total monthly utilities',format:'text'},{key:'k2',label:'Electricity',format:'text'},{key:'k3',label:'Water',format:'text'}]},
 assumptions:'Electricity/month = beds × kWh/bed/day × tariff × 30. Water/month = beds × litres/bed/day ÷ 1000 × water rate × 30. Hospitals typically use 20–40 kWh and 400–600 L per bed per day.',
 faq:[{q:'How much electricity does a hospital use per bed?',a:'Typically 20–40 kWh per bed per day depending on HVAC load, imaging and climate.'},
   {q:'How is monthly utility cost estimated?',a:'Multiply per-bed daily usage by beds, the tariff and 30 days for each utility, then add them.'},
   {q:'What drives hospital energy cost?',a:'HVAC/air-conditioning, sterilisation, imaging equipment and 24×7 operation are the largest contributors.'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){const b=+v.beds||0,k=+v.kwh||0,t=+v.tariff||0,w=+v.water||0,wr=+v.waterRate||0;
 const elec=b*k*t*30,wat=b*w/1000*wr*30;
 const rows=[['Electricity','@ ₹'+t+'/kWh',inr(elec)],['Water','@ ₹'+wr+'/1000L',inr(wat)],['Total monthly utilities','',inr(elec+wat)]];
 return{rows,k1:inr(elec+wat),k2:inr(elec),k3:inr(wat)};}`});

push({id:'clinical-department-planner',name:'Clinical Department Bed Planner',
 short:'Distribute total beds across clinical departments.',
 intro:'Plan a balanced bed distribution across clinical departments for a multispecialty hospital from total bed strength, using standard specialty ratios.',
 seo:{title:'Clinical Department Bed Planner — Bed Split by Specialty | Varada Nexus',description:'Free clinical department planner. Distribute total hospital beds across medicine, surgery, ortho, OB-GYN, paediatrics, cardiology and ICU.',keywords:['clinical department planner','hospital bed distribution','department bed split']},
 inputs:[{id:'beds',label:'Total beds',type:'number',default:200,min:1}],
 results:{rowFmt:'raw',columns:['Department','share','Beds'],kpis:[{key:'k1',label:'General Medicine',format:'text'},{key:'k2',label:'Surgery',format:'text'},{key:'k3',label:'ICU',format:'text'}]},
 assumptions:'Indicative multispecialty split: General Medicine 25%, Surgery 20%, Orthopaedics 10%, OB-GYN 15%, Paediatrics 10%, Cardiology 8%, ICU/critical 12%. Tune to your case mix and specialty focus.',
 faq:[{q:'How are hospital beds distributed across departments?',a:'A typical multispecialty split allocates the most beds to general medicine and surgery, with ICU around 10–12% and the rest across specialties.'},
   {q:'Can I change the ratios?',a:'Yes — the split should reflect your case mix; a cardiac or maternity focus would shift beds accordingly.'},
   {q:'Does this include day-care and OT?',a:'No, it distributes inpatient beds only; day-care, OT tables and diagnostics are planned separately.'}],
 logic:`const S=[['General Medicine',.25],['Surgery',.20],['OB-GYN',.15],['ICU / Critical',.12],['Orthopaedics',.10],['Paediatrics',.10],['Cardiology',.08]];
export function compute(v){const b=+v.beds||0;const rows=S.map(([n,p])=>[n,(p*100)+'%',Math.round(b*p)]);
 return{rows,k1:Math.round(b*.25)+' beds',k2:Math.round(b*.20)+' beds',k3:Math.round(b*.12)+' beds'};}`});

push({id:'hospital-expansion-planner',name:'Hospital Expansion Planner',
 short:'Capex and staff for adding beds to a hospital.',
 intro:'Plan a hospital expansion: additional beds, capital cost (construction plus equipment) and the extra clinical staff needed to scale from current to target capacity.',
 seo:{title:'Hospital Expansion Planner — Capex & Staffing for Added Beds | Varada Nexus',description:'Free hospital expansion planner. Estimate additional beds, capital cost and staff needed to scale from current to target capacity.',keywords:['hospital expansion planner','hospital scale up cost','bed addition capex']},
 inputs:[{id:'current',label:'Current beds',type:'number',default:100,min:0},{id:'target',label:'Target beds',type:'number',default:200,min:0},{id:'costBed',label:'All-in cost per bed — civil+equipment (₹)',type:'number',default:4000000,min:0},{id:'staffBed',label:'Staff per bed',type:'number',default:2.5,min:0}],
 results:{rowFmt:'raw',columns:['Metric','','Value'],kpis:[{key:'k1',label:'Additional beds',format:'text'},{key:'k2',label:'Expansion capex',format:'text'},{key:'k3',label:'Additional staff',format:'text'}]},
 assumptions:'Additional beds = target − current. Capex = additional beds × all-in cost per bed. Additional staff = additional beds × staff per bed (doctors, nurses and support; India norms are ~2–3 per bed for multispecialty).',
 faq:[{q:'How much does it cost to add hospital beds?',a:'Multiply additional beds by an all-in per-bed cost (civil plus equipment), commonly ₹30–60 lakh per bed for multispecialty.'},
   {q:'How many staff per bed does a hospital need?',a:'Roughly 2–3 staff per bed across doctors, nurses and support for a multispecialty hospital running 24×7.'},
   {q:'What else should an expansion plan cover?',a:'Utilities, medical gas, licences, working capital and a ramp-up period before the new beds reach target occupancy.'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){const c=+v.current||0,t=+v.target||0,cb=+v.costBed||0,sb=+v.staffBed||0,add=Math.max(0,t-c);
 const rows=[['Additional beds','',add],['Expansion capex','@ '+inr(cb)+'/bed',inr(add*cb)],['Additional staff','@ '+sb+'/bed',Math.ceil(add*sb)]];
 return{rows,k1:add+' beds',k2:inr(add*cb),k3:Math.ceil(add*sb)+' staff'};}`});

const n=writeTools(T); console.log('healthcare part-2 seeded '+n+' tools');
