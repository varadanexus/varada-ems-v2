import { writeTools, CHECKLIST_LOGIC, CHECKLIST_RESULTS, D } from './_seedlib.mjs';
const REL=[{label:'Hospital Consultancy',url:'/consultancy.html'},{label:'Hospital Infrastructure',url:'/hospital.html'}];
const T=[];
const push=o=>{o.cat='hospital-consultancy';o.related=o.related||REL;T.push(o);};
const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');

/* 1. NABL Readiness Checklist */
push({id:'nabl-readiness-checklist',name:'NABL Readiness Checklist',kind:'checklist',
 short:'Assess lab readiness for NABL accreditation.',
 intro:'Evaluate your hospital laboratory\'s preparedness for NABL (National Accreditation Board for Testing and Calibration Laboratories) accreditation across documentation, equipment, personnel and quality management.',
 seo:{title:'NABL Readiness Checklist — Lab Accreditation Assessment | Varada Nexus',description:'Free NABL readiness checklist. Assess your hospital laboratory across documentation, equipment, QMS and personnel requirements for accreditation.',keywords:['nabl readiness checklist','nabl accreditation laboratory','lab quality checklist india']},
 buttonLabel:'Assess NABL Readiness',
 checklist:[
  {name:'1. Documentation & QMS',items:[
   {id:'c1i1',text:'Quality Manual (QM) drafted and approved',critical:true},
   {id:'c1i2',text:'Standard Operating Procedures (SOPs) for all test processes',critical:true},
   {id:'c1i3',text:'Document control system in place (version, review, distribution)',critical:true},
   {id:'c1i4',text:'Internal audit programme established'},
   {id:'c1i5',text:'Corrective & Preventive Action (CAPA) system active'}]},
  {name:'2. Equipment & Calibration',items:[
   {id:'c2i1',text:'All equipment calibrated with valid certificates',critical:true},
   {id:'c2i2',text:'Equipment maintenance logs maintained',critical:true},
   {id:'c2i3',text:'Reference standards traceable to national/international standards'},
   {id:'c2i4',text:'Equipment breakdown and repair records kept'}]},
  {name:'3. Personnel & Training',items:[
   {id:'c3i1',text:'Lab personnel qualifications documented',critical:true},
   {id:'c3i2',text:'Training records and competency assessments maintained'},
   {id:'c3i3',text:'Authorised signatory meeting NABL educational requirements',critical:true}]},
  {name:'4. Sample Handling & Testing',items:[
   {id:'c4i1',text:'Sample collection, handling and storage procedures defined',critical:true},
   {id:'c4i2',text:'Proficiency testing / EQA participation active',critical:true},
   {id:'c4i3',text:'Uncertainty of measurement calculated for key tests'},
   {id:'c4i4',text:'Reference ranges validated for patient population'}]},
  {name:'5. Facility & Safety',items:[
   {id:'c5i1',text:'Dedicated lab space meeting biosafety requirements'},
   {id:'c5i2',text:'Biomedical waste management per BMWM rules'},
   {id:'c5i3',text:'Personnel protective equipment available and used'}]}],
 results:CHECKLIST_RESULTS,
 assumptions:'Checklist maps to ISO 15189:2022 / NABL Doc 112 requirements. Critical items are mandatory for initial assessment.',
 faq:[
  {q:'What is NABL accreditation for hospitals?',a:'NABL (under QCI) accredits medical testing laboratories to ISO 15189, assuring patients and regulators that test results are accurate and reliable.'},
  {q:'How long does NABL accreditation take?',a:'Typically 9–18 months from readiness to certificate, covering application, pre-assessment, assessment and any corrective actions.'},
  {q:'What are the most common NABL audit failures?',a:'Missing or outdated SOPs, gaps in equipment calibration records, absence of EQA participation and incomplete uncertainty of measurement calculations.'}],
 logic:CHECKLIST_LOGIC});

/* 2. Hospital License Checklist */
push({id:'hospital-license-checklist',name:'Hospital License Checklist',kind:'checklist',
 short:'Track all licences required to open a hospital in India.',
 intro:'Ensure your hospital has obtained all statutory licences and registrations required by central and state authorities before commencing operations.',
 seo:{title:'Hospital License Checklist — Regulatory Approvals India | Varada Nexus',description:'Free hospital licence checklist. Track all regulatory approvals needed to open a hospital in India including PCPNDT, Clinical Establishment, fire NOC and more.',keywords:['hospital licence checklist','hospital registration india','clinical establishment act checklist']},
 buttonLabel:'Check Licence Status',
 checklist:[
  {name:'1. Core Registrations',items:[
   {id:'l1i1',text:'Clinical Establishment Registration (CEA / State Act)',critical:true},
   {id:'l1i2',text:'Society / Trust / Company registration as applicable',critical:true},
   {id:'l1i3',text:'GST registration obtained'}]},
  {name:'2. Building & Safety',items:[
   {id:'l2i1',text:'Building plan approval from local authority',critical:true},
   {id:'l2i2',text:'Occupancy / completion certificate obtained',critical:true},
   {id:'l2i3',text:'Fire NOC from Fire Department',critical:true},
   {id:'l2i4',text:'Lift / elevator certificate (if applicable)'},
   {id:'l2i5',text:'Electrical safety certificate from licensed inspector'}]},
  {name:'3. Environment & Waste',items:[
   {id:'l3i1',text:'Consent to Operate from State Pollution Control Board',critical:true},
   {id:'l3i2',text:'Biomedical Waste Treatment & Disposal authorisation (BMWM)',critical:true},
   {id:'l3i3',text:'Sewage/effluent treatment consent obtained'}]},
  {name:'4. Speciality Licences',items:[
   {id:'l4i1',text:'PCPNDT registration (if ultrasound / IVF services)',critical:true},
   {id:'l4i2',text:'Blood bank licence from CDSCO (if blood bank)',critical:true},
   {id:'l4i3',text:'Pharmacy licence from State Drug Authority (if in-house pharmacy)',critical:true},
   {id:'l4i4',text:'Radiation safety licence from AERB (if CT / X-ray)'},
   {id:'l4i5',text:'Narcotic Drugs licence (if applicable)'}]},
  {name:'5. Human Resources',items:[
   {id:'l5i1',text:'Medical Director with valid MCI/NMC registration',critical:true},
   {id:'l5i2',text:'Nursing Home registration / Medical Superintendent appointment'},
   {id:'l5i3',text:'ESI & PF registration for employees'}]}],
 results:CHECKLIST_RESULTS,
 assumptions:'Requirements vary by state; central licences (CDSCO, AERB) apply nationally. Verify current norms with local authorities.',
 faq:[
  {q:'Which licence is needed first to open a hospital?',a:'The Clinical Establishment registration and building/fire approvals are foundational; without these, no other state licences will be issued.'},
  {q:'Is PCPNDT registration mandatory for all hospitals?',a:'Yes, for any facility that performs ultrasound on pregnant women — including OPD ultrasound — PCPNDT registration is mandatory under law.'},
  {q:'How long do hospital licences take in India?',a:'Timelines vary by state: CEA registration can take 30–90 days; pollution consent 60–120 days; AERB and blood bank licences 3–6 months each.'}],
 logic:CHECKLIST_LOGIC});

/* 3. Hospital Project Planner */
push({id:'hospital-project-planner',name:'Hospital Project Planner',
 short:'Timeline and cost milestones for a greenfield hospital project.',
 intro:'Plan key milestones, budget bands and team requirements for a greenfield or expansion hospital project based on bed count and hospital type.',
 seo:{title:'Hospital Project Planner — Greenfield Hospital Timeline & Budget | Varada Nexus',description:'Free hospital project planner. Estimate milestones, construction timeline and budget bands for greenfield hospital projects in India.',keywords:['hospital project planning','hospital timeline calculator','greenfield hospital cost india']},
 inputs:[
  {id:'beds',label:'Planned beds',type:'number',default:150,min:10},
  {id:'type',label:'Hospital type',type:'select',default:'multi',options:[{v:'general',t:'General / Nursing Home'},{v:'multi',t:'Multispecialty'},{v:'super',t:'Super-specialty / Tertiary'}]},
  {id:'land',label:'Land status',type:'select',default:'owned',options:[{v:'owned',t:'Land owned'},{v:'search',t:'Land not yet finalised'}]}],
 results:{rowFmt:'raw',columns:['Phase','Duration','Indicative Cost'],kpis:[{key:'k1',label:'Total project duration',format:'text'},{key:'k2',label:'Estimated project cost',format:'text'},{key:'k3',label:'Construction cost',format:'text'}]},
 assumptions:'Construction cost: general ₹35–45L/bed, multispecialty ₹55–75L/bed, super-specialty ₹90–130L/bed. Equipment adds ~35–45% of civil cost. Timelines include licencing and commissioning.',
 faq:[
  {q:'How long does it take to build a 150-bed hospital?',a:'A typical 150-bed multispecialty hospital takes 36–48 months from DPR to commissioning, including design (6m), licences (6m), construction (18–24m) and fit-out (6m).'},
  {q:'What is the cost per bed for a hospital in India (2024)?',a:'Rough indicative ranges: ₹40–50 lakh/bed for general, ₹60–80 lakh for multispecialty and ₹100–140 lakh for super-specialty, all-in including equipment.'},
  {q:'What are the main phases of a hospital project?',a:'Typically: land & concept → DPR & approvals → detailed design → construction → equipment & IT → commissioning → operations launch.'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
const RATES={general:{civil:4000000,eq:0.38,dur:[6,3,18,4]},multi:{civil:6500000,eq:0.40,dur:[8,4,22,6]},super:{civil:11000000,eq:0.42,dur:[10,6,28,8]}};
export function compute(v){
  const b=+v.beds||100,t=v.type||'multi',land=v.land||'owned';
  const R=RATES[t]||RATES.multi;
  const civil=b*R.civil,eq=civil*R.eq,total=civil+eq;
  const [dpr,lic,const_,comm]=R.dur;
  const landAdj=land==='search'?3:0;
  const totalMo=landAdj+dpr+lic+const_+comm;
  const rows=[
   [land==='search'?'Land finalisation':'(Land owned)','~'+landAdj+' months','—'],
   ['DPR & design','~'+dpr+' months','₹5–8L (fees)'],
   ['Licences & approvals','~'+lic+' months','₹2–5L (fees)'],
   ['Construction & civil','~'+const_+' months',inr(civil)],
   ['Equipment & IT fit-out','~'+comm+' months',inr(eq)],
   ['Total project','~'+totalMo+' months',inr(total)]];
  return{rows,k1:'~'+totalMo+' months',k2:inr(total),k3:inr(civil)};}`});

/* 4. Feasibility Study Calculator */
push({id:'hospital-feasibility-calculator',name:'Hospital Feasibility Study Calculator',
 short:'5-year revenue and IRR projection for a new hospital.',
 intro:'Run a quick financial feasibility study for a new hospital — project revenue, operating costs and indicative IRR over 5 years based on bed count, occupancy ramp and ARPOB.',
 seo:{title:'Hospital Feasibility Study Calculator — IRR & Revenue Projection | Varada Nexus',description:'Free hospital feasibility calculator. Project 5-year revenue, EBITDA and indicative IRR for a new hospital from beds, occupancy and ARPOB.',keywords:['hospital feasibility calculator','hospital irr calculator','hospital revenue projection india']},
 inputs:[
  {id:'beds',label:'Operational beds',type:'number',default:150,min:10},
  {id:'arpob',label:'Average Revenue per Occupied Bed per Day (₹)',type:'number',default:8000,min:1000},
  {id:'capex',label:'Total project cost (₹ lakhs)',type:'number',default:12000,min:100},
  {id:'debt',label:'Debt portion (%)',type:'number',default:65,min:0,max:100},
  {id:'occ3',label:'Occupancy by year 3 (%)',type:'number',default:72,min:10,max:100}],
 results:{rowFmt:'raw',columns:['Year','Occupancy','Revenue'],kpis:[{key:'k1',label:'Y5 annual revenue',format:'text'},{key:'k2',label:'Indicative IRR',format:'text'},{key:'k3',label:'Payback period',format:'text'}]},
 assumptions:'Occupancy ramps: Y1=30%, Y2=50%, Y3=user-set, Y4=Y3+8%, Y5=min(Y3+15%,85%). EBITDA margin assumed 18% Y1, 22% Y2, 26% Y3-5. Debt at 11% pa, 12yr tenor. IRR is indicative equity IRR from EBITDA stream.',
 faq:[
  {q:'What is a good IRR for a hospital project?',a:'Typically 15–22% equity IRR is considered acceptable for Indian private hospitals; super-specialty tertiary hospitals can target higher returns given higher ARPOB.'},
  {q:'What is ARPOB?',a:'Average Revenue Per Occupied Bed per Day — a key hospital performance metric combining bed occupancy and revenue intensity.'},
  {q:'How long to break even for a hospital?',a:'Cash break-even typically 2–4 years; accounting/investment break-even 6–10 years for a greenfield hospital depending on scale and payer mix.'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN')+' L';
export function compute(v){
  const b=+v.beds||100,ar=+v.arpob||8000,capex=+v.capex||10000,dbt=+v.debt||65,occ3=+v.occ3||70;
  const occs=[30,50,occ3,Math.min(occ3+8,85),Math.min(occ3+15,85)];
  const margins=[0.18,0.22,0.26,0.26,0.26];
  const annRev=yr=>b*occs[yr]/100*ar*365/100000;
  const rows=occs.map((o,i)=>[('Year '+(i+1)),o+'%',inr(Math.round(annRev(i)*10)/10)]);
  const y5rev=annRev(4);
  const equity=capex*(1-dbt/100);
  // simple IRR approximation: avg EBITDA / equity
  const avgEBITDA=occs.reduce((s,o,i)=>s+annRev(i)*margins[i],0)/5;
  const irr=Math.round(avgEBITDA/equity*100*10)/10;
  const payback=Math.round(equity/avgEBITDA*10)/10;
  rows.push(['Avg EBITDA/yr','',inr(Math.round(avgEBITDA*10)/10)]);
  return{rows,k1:inr(Math.round(y5rev*10)/10),k2:irr+'%',k3:payback+' yrs'};}`});

/* 5. Hospital DPR Planner */
push({id:'hospital-dpr-planner',name:'Hospital DPR Planner',
 short:'Checklist and budget for a hospital Detailed Project Report.',
 intro:'Plan the components and professional fees for a hospital Detailed Project Report (DPR) including market study, architectural concept, financial projections and regulatory requirements.',
 seo:{title:'Hospital DPR Planner — Detailed Project Report Checklist | Varada Nexus',description:'Free hospital DPR planner. Checklist and cost estimate for a hospital Detailed Project Report including feasibility, design and financial modelling.',keywords:['hospital dpr','hospital detailed project report','hospital project report india']},
 inputs:[
  {id:'beds',label:'Planned beds',type:'number',default:150,min:10},
  {id:'type',label:'Hospital type',type:'select',default:'multi',options:[{v:'small',t:'Small (<50 beds)'},{v:'multi',t:'Multispecialty (50–250 beds)'},{v:'large',t:'Large / Tertiary (>250 beds)'}]},
  {id:'scope',label:'DPR scope',type:'select',default:'full',options:[{v:'basic',t:'Basic (internal use)'},{v:'full',t:'Full (bank / investor)'},{v:'premium',t:'Premium (JCI / detailed)'}]}],
 results:{rowFmt:'raw',columns:['Component','Effort','Fee'],kpis:[{key:'k1',label:'Total DPR fee',format:'text'},{key:'k2',label:'Typical duration',format:'text'},{key:'k3',label:'Key deliverables',format:'text'}]},
 assumptions:'Fee estimates: basic ₹3–6L, full ₹8–18L, premium ₹20–40L. Covers consultancy fees only; statutory fees, surveys and primary research billed separately.',
 faq:[
  {q:'What is a hospital DPR?',a:'A Detailed Project Report is the master planning document covering market analysis, clinical program, space planning, equipment list, regulatory approvals and financial projections.'},
  {q:'Who prepares a hospital DPR?',a:'Hospital management consultants or project management consultants with healthcare expertise, often working alongside architects and financial advisors.'},
  {q:'Is a DPR required for bank loans?',a:'Yes — banks and NBFCs typically require a comprehensive DPR for healthcare project loans, covering financial projections, collateral and regulatory clearances.'}],
 logic:`const inr=n=>'₹'+n;
const FEES={small:{basic:'2–4L',full:'5–10L',premium:'12–20L',dur:'4–6 weeks'},multi:{basic:'4–8L',full:'10–20L',premium:'22–40L',dur:'6–10 weeks'},large:{basic:'8–15L',full:'18–35L',premium:'40–70L',dur:'10–16 weeks'}};
export function compute(v){
  const t=v.type||'multi',s=v.scope||'full';
  const F=FEES[t]||FEES.multi;
  const fee=F[s];
  const rows=[
   ['Market & demand study','30%','Included'],
   ['Clinical programme design','20%','Included'],
   ['Space planning / block layout','15%','Included'],
   ['Equipment list (indicative)','10%','Included'],
   ['Financial model (5-10 yr)','15%','Included'],
   ['Regulatory & licensing plan','10%','Included']];
  return{rows,k1:inr(fee),k2:F.dur,k3:'6 chapters + executive summary'};}`});

/* 6. Department Requirement Planner */
push({id:'department-requirement-planner',name:'Department Requirement Planner',
 short:'Rooms, staff and equipment per clinical department.',
 intro:'Estimate the number of rooms, core staffing and key equipment required for each major clinical department based on planned bed count and specialty mix.',
 seo:{title:'Hospital Department Requirement Planner — Rooms, Staff & Equipment | Varada Nexus',description:'Free hospital department requirement planner. Estimate consulting rooms, staff and key equipment per department from bed count and specialty mix.',keywords:['hospital department planning','clinical department requirement','hospital staffing rooms equipment']},
 inputs:[
  {id:'beds',label:'Total beds',type:'number',default:150,min:10},
  {id:'type',label:'Hospital type',type:'select',default:'multi',options:[{v:'general',t:'General'},{v:'multi',t:'Multispecialty'},{v:'super',t:'Super-specialty'}]},
  {id:'opd_daily',label:'Daily OPD target',type:'number',default:300,min:10}],
 results:{rowFmt:'raw',columns:['Department','OPD Rooms','IPD Beds (est.)'],kpis:[{key:'k1',label:'Total OPD rooms',format:'text'},{key:'k2',label:'OT tables recommended',format:'text'},{key:'k3',label:'ICU beds (10%)',format:'text'}]},
 assumptions:'OPD rooms = daily OPD × consult time (12 min) ÷ 480 min × 1.2 buffer, apportioned by specialty. IPD beds apportioned by typical case-mix. OT: 1 table per 35 surgical beds.',
 faq:[
  {q:'How many OPD rooms does a 150-bed hospital need?',a:'For 300 OPD/day at 12 minutes per consult and 8-hour sessions, roughly 8–10 consulting rooms are needed at 80% utilisation.'},
  {q:'How many OTs are needed per bed?',a:'A common norm is one operating table per 30–40 surgical beds; a 150-bed multispecialty hospital typically needs 4–6 OT tables.'},
  {q:'What departments must a multispecialty hospital have?',a:'Core departments include internal medicine, surgery, orthopaedics, obstetrics & gynaecology, paediatrics, emergency and supporting specialties like anaesthesia and radiology.'}],
 logic:`const c=Math.ceil;
const DEPTS_GEN=[['Internal Medicine',30],['Surgery',25],['Obstetrics & Gynaecology',15],['Paediatrics',12],['Orthopaedics',10],['Emergency / Casualty',8]];
const DEPTS_MULTI=[['Internal Medicine',20],['Surgery',18],['Cardiology',10],['Orthopaedics',12],['Obstetrics & Gynaecology',12],['Neurology',8],['Oncology',8],['Paediatrics',7],['ENT / Ophthalmology',5]];
const DEPTS_SUPER=[['Cardiology / CTVS',20],['Neurology / Neurosurgery',18],['Oncology',15],['Orthopaedics',12],['Nephrology / Urology',10],['Gastroenterology',10],['Internal Medicine',8],['Paediatrics',7]];
export function compute(v){
  const b=+v.beds||150,opd=+v.opd_daily||300,t=v.type||'multi';
  const depts=t==='super'?DEPTS_SUPER:t==='general'?DEPTS_GEN:DEPTS_MULTI;
  const totalPct=depts.reduce((s,d)=>s+d[1],0);
  const opdRoomsTotal=c(opd*12/480/0.8);
  const rows=depts.map(([name,pct])=>{
    const ipd=c(b*pct/totalPct);
    const rooms=c(opdRoomsTotal*pct/totalPct);
    return[name,rooms+' rooms',ipd+' beds'];
  });
  const ot=c(b*0.6/35);
  const icu=c(b*0.10);
  return{rows,k1:opdRoomsTotal+' rooms',k2:ot+' tables',k3:icu+' beds'};}`});

/* 7. Equipment Requirement Planner */
push({id:'equipment-requirement-planner',name:'Equipment Requirement Planner',
 short:'Quantity and budget for key hospital equipment by bed count.',
 intro:'Estimate the quantity and indicative budget for major medical equipment categories required for a hospital, based on bed count and hospital tier.',
 seo:{title:'Hospital Equipment Requirement Planner — Quantity & Budget | Varada Nexus',description:'Free hospital equipment requirement planner. Estimate quantities and budget for major medical equipment by bed count and hospital tier.',keywords:['hospital equipment list','medical equipment planning','hospital equipment budget india']},
 inputs:[
  {id:'beds',label:'Operational beds',type:'number',default:150,min:10},
  {id:'icu_pct',label:'ICU beds (%)',type:'number',default:10,min:5,max:30},
  {id:'tier',label:'Equipment tier',type:'select',default:'mid',options:[{v:'basic',t:'Basic'},{v:'mid',t:'Mid-range'},{v:'premium',t:'Premium / Latest'}]}],
 results:{rowFmt:'raw',columns:['Equipment','Qty','Indicative Cost'],kpis:[{key:'k1',label:'Total equipment budget',format:'text'},{key:'k2',label:'ICU equipment',format:'text'},{key:'k3',label:'Imaging equipment',format:'text'}]},
 assumptions:'Pricing: basic 0.7×, premium 1.5× of mid-range benchmark. CT 64-slice mid ₹2.5Cr, MRI 1.5T ₹5Cr, Ultrasound ₹18L, C-arm ₹25L, Ventilator ₹8L, Monitor ₹2L.',
 faq:[
  {q:'How many ventilators does a hospital need?',a:'Typically 60–70% of ICU beds should have ventilator support; for a 15-bed ICU, plan for 10–12 ventilators.'},
  {q:'Is MRI mandatory for a multispecialty hospital?',a:'Not mandatory, but highly recommended for neurology, oncology and orthopaedics referrals; many hospitals outsource or lease initially to manage capex.'},
  {q:'Can hospital equipment be leased instead of purchased?',a:'Yes — medical equipment leasing and BOOT (Build-Operate-Own-Transfer) models are common in India for high-value imaging equipment.'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
const MF={basic:0.7,mid:1,premium:1.5};
export function compute(v){
  const b=+v.beds||150,ip=+v.icu_pct||10,mf=MF[v.tier||'mid']||1;
  const icu=Math.ceil(b*ip/100);
  const ot=Math.ceil(b*0.6/35);
  const items=[
   ['CT Scanner (64-slice)',1,25000000*mf],
   ['MRI 1.5T',1,50000000*mf],
   ['Ultrasound machines',Math.ceil(b/50),1800000*mf],
   ['C-arm (OT)',ot,2500000*mf],
   ['Ventilators',Math.ceil(icu*0.65),800000*mf],
   ['Patient monitors',b+icu,200000*mf],
   ['OT tables',ot,1500000*mf],
   ['Anaesthesia workstations',ot,2000000*mf],
   ['Defibrillators',Math.ceil(b/50)+2,150000*mf],
   ['Lab analysers (basic set)',1,5000000*mf]];
  const rows=items.map(([name,qty,unit])=>[name,'×'+qty,inr(Math.round(qty*unit))]);
  const total=items.reduce((s,[,q,u])=>s+q*u,0);
  const icuCost=items.slice(4,6).reduce((s,[,q,u])=>s+q*u,0);
  const imgCost=items.slice(0,4).reduce((s,[,q,u])=>s+q*u,0);
  rows.push(['Total','',inr(Math.round(total))]);
  return{rows,k1:inr(Math.round(total)),k2:inr(Math.round(icuCost)),k3:inr(Math.round(imgCost))};}`});

/* 8. Hospital SWOT Assessment */
push({id:'hospital-swot-assessment',name:'Hospital SWOT Assessment Tool',kind:'checklist',
 short:'Structured SWOT checklist for hospital strategic planning.',
 intro:'Rate your hospital\'s strategic position across Strengths, Weaknesses, Opportunities and Threats using this structured checklist. Use results to prioritise strategic initiatives.',
 seo:{title:'Hospital SWOT Assessment Tool — Strategic Planning | Varada Nexus',description:'Free hospital SWOT assessment checklist. Evaluate your hospital\'s strengths, weaknesses, opportunities and threats for strategic planning.',keywords:['hospital swot analysis','hospital strategic planning checklist','healthcare swot tool']},
 buttonLabel:'Run SWOT Assessment',
 checklist:[
  {name:'Strengths',items:[
   {id:'s1',text:'Strong specialist medical team in place'},
   {id:'s2',text:'Good patient satisfaction / NPS scores'},
   {id:'s3',text:'NABH / NABL or other accreditation held',critical:true},
   {id:'s4',text:'Strategic location / catchment area advantage'},
   {id:'s5',text:'Modern infrastructure and equipment'},
   {id:'s6',text:'Established insurance / TPA empanelments'}]},
  {name:'Weaknesses',items:[
   {id:'w1',text:'No critical specialist gaps identified'},
   {id:'w2',text:'Operating costs within benchmark range'},
   {id:'w3',text:'Staff attrition below 15% per year'},
   {id:'w4',text:'Collections cycle under 45 days'}]},
  {name:'Opportunities',items:[
   {id:'o1',text:'Identified unserved specialty in catchment area'},
   {id:'o2',text:'Digital health / telemedicine expansion potential'},
   {id:'o3',text:'Government scheme empanelment (PMJAY / State)'},
   {id:'o4',text:'Medical tourism potential exists'},
   {id:'o5',text:'Adjacent land for capacity expansion available'}]},
  {name:'Threats',items:[
   {id:'t1',text:'No major new competitor entering catchment area'},
   {id:'t2',text:'Tariff regulation risk identified and mitigated'},
   {id:'t3',text:'Regulatory compliance gaps addressed'},
   {id:'t4',text:'Key doctor retention plan in place'}]}],
 results:CHECKLIST_RESULTS,
 assumptions:'Score reflects how many strategic factors are favourable. Critical item is accreditation status, a key market differentiator.',
 faq:[
  {q:'How is a hospital SWOT different from a corporate SWOT?',a:'Healthcare SWOTs must factor in clinical quality metrics, regulatory compliance, doctor dependency risk and payer mix — these are healthcare-specific strategic variables.'},
  {q:'How often should a hospital do a SWOT analysis?',a:'Annually as part of strategic planning, and additionally when considering expansion, entering new specialties or responding to competitive threats.'},
  {q:'What actions should follow a hospital SWOT?',a:'Convert strengths into marketing differentiators, address critical weaknesses in the annual plan, create business cases for opportunities and build contingency plans for key threats.'}],
 logic:CHECKLIST_LOGIC});

/* 9. Compliance Checklist */
push({id:'hospital-compliance-checklist',name:'Hospital Compliance Checklist',kind:'checklist',
 short:'Ongoing statutory compliance for operating hospitals.',
 intro:'Track ongoing statutory and operational compliance obligations for a running hospital across licences, employee law, environment and quality standards.',
 seo:{title:'Hospital Compliance Checklist — Statutory & Regulatory Obligations | Varada Nexus',description:'Free hospital compliance checklist. Track ongoing statutory obligations including licence renewals, labour law, environment and quality standards.',keywords:['hospital compliance checklist','hospital regulatory compliance india','hospital statutory obligations']},
 buttonLabel:'Check Compliance Status',
 checklist:[
  {name:'1. Licence Renewals',items:[
   {id:'cr1',text:'Clinical Establishment registration renewed annually',critical:true},
   {id:'cr2',text:'Blood bank / pharmacy licence renewal current',critical:true},
   {id:'cr3',text:'PCPNDT renewal and Form F records up to date',critical:true},
   {id:'cr4',text:'AERB licence renewal current (if applicable)'}]},
  {name:'2. Labour & HR',items:[
   {id:'lr1',text:'ESI contributions paid and records current',critical:true},
   {id:'lr2',text:'PF contributions up to date',critical:true},
   {id:'lr3',text:'Minimum wage compliance verified'},
   {id:'lr4',text:'Sexual Harassment (POSH) policy and committee in place'},
   {id:'lr5',text:'Contract labour (if any) registered with Labour Commissioner'}]},
  {name:'3. Environment',items:[
   {id:'er1',text:'BMW segregation, collection and handover records maintained',critical:true},
   {id:'er2',text:'Annual returns filed with State Pollution Control Board',critical:true},
   {id:'er3',text:'Effluent treatment plant (ETP) functioning and records kept'}]},
  {name:'4. Patient Safety',items:[
   {id:'pr1',text:'Adverse event / near-miss reporting system active',critical:true},
   {id:'pr2',text:'Fire safety equipment serviced quarterly'},
   {id:'pr3',text:'Patient consent forms in use for all procedures'},
   {id:'pr4',text:'Drug expiry checks done monthly'}]},
  {name:'5. Finance & Tax',items:[
   {id:'fr1',text:'GST returns filed on time'},
   {id:'fr2',text:'TDS deducted and deposited as due'},
   {id:'fr3',text:'Charitable trust / society annual returns filed (if applicable)'}]}],
 results:CHECKLIST_RESULTS,
 assumptions:'Checklist covers central and general state obligations. Specific state laws may add further requirements.',
 faq:[
  {q:'What are the most common hospital compliance failures in India?',a:'PCPNDT record gaps, BMW manifest irregularities, POSH non-compliance and delayed PF/ESI deposits are the most frequently cited violations in government inspections.'},
  {q:'How often should a hospital do a compliance audit?',a:'A full internal compliance audit quarterly and an external audit annually is best practice; high-risk areas like BMW and labour law should be reviewed monthly.'},
  {q:'Can a hospital be penalised for PCPNDT violations?',a:'Yes — penalties include licence suspension, equipment seizure and criminal prosecution under the PCPNDT Act. Regular record-keeping and display compliance are essential.'}],
 logic:CHECKLIST_LOGIC});

/* 10. Risk Assessment Tool */
push({id:'hospital-risk-assessment',name:'Hospital Risk Assessment Tool',
 short:'Score hospital project risks by likelihood and impact.',
 intro:'Quantify and prioritise hospital project or operational risks using a likelihood × impact matrix. Enter scores for each risk category to get a weighted risk score and mitigation priority.',
 seo:{title:'Hospital Risk Assessment Tool — Likelihood × Impact Matrix | Varada Nexus',description:'Free hospital risk assessment calculator. Score project and operational risks by likelihood and impact to prioritise mitigation actions.',keywords:['hospital risk assessment','healthcare risk matrix','hospital project risk calculator']},
 inputs:[
  {id:'r_finance',label:'Financial risk (1–5)',type:'number',default:3,min:1,max:5,hint:'1=very low, 5=very high likelihood'},
  {id:'r_regulatory',label:'Regulatory / licence risk (1–5)',type:'number',default:3,min:1,max:5},
  {id:'r_doctor',label:'Key doctor availability risk (1–5)',type:'number',default:3,min:1,max:5},
  {id:'r_ops',label:'Operational ramp-up risk (1–5)',type:'number',default:3,min:1,max:5},
  {id:'r_competition',label:'Competitive threat risk (1–5)',type:'number',default:2,min:1,max:5},
  {id:'i_finance',label:'Financial impact weight (1–5)',type:'number',default:5,min:1,max:5,hint:'1=low impact, 5=critical'},
  {id:'i_regulatory',label:'Regulatory impact weight (1–5)',type:'number',default:4,min:1,max:5},
  {id:'i_doctor',label:'Doctor dependency impact (1–5)',type:'number',default:4,min:1,max:5},
  {id:'i_ops',label:'Operations impact (1–5)',type:'number',default:3,min:1,max:5},
  {id:'i_competition',label:'Competition impact (1–5)',type:'number',default:3,min:1,max:5}],
 results:{rowFmt:'raw',columns:['Risk Area','Likelihood × Impact','Priority'],kpis:[{key:'k1',label:'Weighted risk score',format:'text'},{key:'k2',label:'Highest risk',format:'text'},{key:'k3',label:'Overall risk band',format:'text'}]},
 assumptions:'Risk score = likelihood (1–5) × impact (1–5) per area. Maximum possible score = 125. Priority: ≥15 = High, 8–14 = Medium, <8 = Low.',
 faq:[
  {q:'What is a risk matrix?',a:'A risk matrix scores each risk by multiplying its likelihood of occurring (1–5) by its potential impact (1–5), giving a score from 1–25 per risk.'},
  {q:'What is a high-risk score in this tool?',a:'A per-risk score of 15 or above (e.g. likelihood 3 × impact 5) is flagged High priority and needs a documented mitigation plan.'},
  {q:'Which risks matter most in a hospital project?',a:'Financial overruns and regulatory delays are typically highest impact; doctor availability and operational ramp-up are often high likelihood for new hospitals.'}],
 logic:`const AREAS=['Financial','Regulatory','Doctor availability','Operations','Competition'];
const KEYS=[['r_finance','i_finance'],['r_regulatory','i_regulatory'],['r_doctor','i_doctor'],['r_ops','i_ops'],['r_competition','i_competition']];
export function compute(v){
  const scores=KEYS.map(([l,i])=>(+v[l]||1)*(+v[i]||1));
  const total=scores.reduce((a,b)=>a+b,0);
  const maxIdx=scores.indexOf(Math.max(...scores));
  const rows=scores.map((s,i)=>{
    const p=s>=15?'🔴 High':s>=8?'🟡 Medium':'🟢 Low';
    return[AREAS[i],s+' / 25',p];
  });
  const band=total>=60?'High':total>=35?'Moderate':'Low';
  return{rows,k1:total+' / 125',k2:AREAS[maxIdx],k3:band};}`});

/* 11. Accreditation Timeline Planner */
push({id:'accreditation-timeline-planner',name:'Accreditation Timeline Planner',
 short:'Month-by-month accreditation roadmap for NABH / NABL / JCI.',
 intro:'Plan a realistic month-by-month timeline to achieve hospital accreditation (NABH, NABL or JCI) from baseline assessment to certificate, with key milestones and resource needs.',
 seo:{title:'Hospital Accreditation Timeline Planner — NABH NABL JCI Roadmap | Varada Nexus',description:'Free hospital accreditation timeline planner. Generate a month-by-month NABH, NABL or JCI accreditation roadmap with milestones.',keywords:['nabh accreditation timeline','nabl timeline planner','hospital accreditation roadmap india']},
 inputs:[
  {id:'type',label:'Accreditation type',type:'select',default:'nabh',options:[{v:'nabh',t:'NABH (Hospital)'},{v:'nabh_entry',t:'NABH Entry Level'},{v:'nabl',t:'NABL (Laboratory)'},{v:'jci',t:'JCI International'}]},
  {id:'readiness',label:'Current readiness (%)',type:'number',default:30,min:0,max:100},
  {id:'start',label:'Planned start month',type:'select',default:'1',options:[{v:'1',t:'Month 1 (now)'},{v:'3',t:'Month 3'},{v:'6',t:'Month 6'}]}],
 results:{rowFmt:'raw',columns:['Phase','Start Month','Duration'],kpis:[{key:'k1',label:'Expected certificate by',format:'text'},{key:'k2',label:'Total duration',format:'text'},{key:'k3',label:'Estimated consultant cost',format:'text'}]},
 assumptions:'Timelines: NABH entry 9–12m, NABH full 15–24m, NABL 12–18m, JCI 24–36m. Readiness <40% adds 3–6 months. Consultant fees: NABH entry ₹5–8L, NABH full ₹12–20L, NABL ₹6–12L, JCI ₹30–60L.',
 faq:[
  {q:'How long does NABH accreditation take?',a:'NABH Entry Level typically takes 9–12 months from a good baseline; full NABH accreditation takes 15–24 months, including a mandatory gap between entry and full assessment.'},
  {q:'Can a hospital skip NABH Entry and apply directly for full accreditation?',a:'Yes — hospitals with >50 beds and strong existing systems can apply directly for full NABH accreditation, though most greenfield hospitals use Entry Level as a stepping stone.'},
  {q:'What does JCI accreditation cost a hospital?',a:'JCI application and survey fees run USD 30,000–60,000 (varies by size), plus consultant preparation costs of ₹30–60 lakhs, making it a significant investment.'}],
 logic:`const inr=n=>'₹'+n;
const PLANS={nabh_entry:{phases:[['Baseline gap assessment',1,1],['Policy & SOP development',2,3],['Staff training',4,2],['Internal audit',6,1],['Pre-assessment',7,1],['Corrective actions',8,2],['NABH assessment',10,1],['Certificate',11,0]],total:12,fee:'5–8L'},
nabh:{phases:[['Baseline gap assessment',1,1],['QMS documentation',2,4],['Staff training & competency',5,2],['Process implementation',6,4],['Internal audit',10,2],['Pre-assessment',12,1],['Corrective actions',13,3],['NABH assessment',16,1],['Certificate',18,0]],total:18,fee:'12–20L'},
nabl:{phases:[['Lab assessment & gap analysis',1,1],['ISO 15189 documentation',2,3],['Equipment calibration',4,2],['EQA enrolment',5,1],['Internal audit',7,2],['Pre-assessment',9,1],['NABL assessment',11,1],['Certificate',12,0]],total:13,fee:'6–12L'},
jci:{phases:[['Baseline & JCI gap analysis',1,2],['Policy harmonisation',3,4],['Infrastructure upgrades',5,6],['Staff training (all chapters)',8,4],['Tracer methodology drills',12,3],['Pre-survey',15,1],['JCI survey',17,1],['Certificate',18,0]],total:30,fee:'30–60L'}};
export function compute(v){
  const t=v.type||'nabh',r=+v.readiness||30,start=+v.start||1;
  const P=PLANS[t]||PLANS.nabh;
  const adj=r<40?4:r<60?2:0;
  const rows=P.phases.map(([ph,mo,dur])=>[ph,'M'+(mo+start-1),(dur?dur+' month(s)':'Certificate')]);
  const total=P.total+adj;
  return{rows,k1:'~Month '+(total+start-1),k2:total+' months',k3:inr(P.fee)};}`});

/* 12. SOP Checklist Generator */
push({id:'sop-checklist-generator',name:'SOP Checklist Generator',kind:'checklist',
 short:'Verify all key hospital SOPs are documented and current.',
 intro:'Check that your hospital has documented, approved and current Standard Operating Procedures (SOPs) for all critical clinical and administrative processes.',
 seo:{title:'Hospital SOP Checklist Generator — SOP Documentation Tracker | Varada Nexus',description:'Free hospital SOP checklist. Verify all critical clinical and administrative SOPs are documented, approved and current for accreditation readiness.',keywords:['hospital sop checklist','standard operating procedure hospital','hospital sop documentation']},
 buttonLabel:'Check SOP Status',
 checklist:[
  {name:'1. Clinical SOPs',items:[
   {id:'s1',text:'Patient admission and registration SOP',critical:true},
   {id:'s2',text:'Medication administration and double-check SOP',critical:true},
   {id:'s3',text:'Surgical safety (WHO checklist) SOP',critical:true},
   {id:'s4',text:'Infection prevention and hand hygiene SOP',critical:true},
   {id:'s5',text:'Code Blue / resuscitation protocol',critical:true},
   {id:'s6',text:'Blood transfusion safety SOP'}]},
  {name:'2. Nursing SOPs',items:[
   {id:'n1',text:'Patient identification (two-identifier) SOP',critical:true},
   {id:'n2',text:'Falls prevention protocol'},
   {id:'n3',text:'Pressure ulcer prevention SOP'},
   {id:'n4',text:'IV cannula care bundle SOP'}]},
  {name:'3. Emergency SOPs',items:[
   {id:'e1',text:'Fire evacuation and mock drill SOP',critical:true},
   {id:'e2',text:'Disaster and mass casualty SOP'},
   {id:'e3',text:'MLC (medico-legal case) reporting SOP',critical:true}]},
  {name:'4. Administrative SOPs',items:[
   {id:'a1',text:'Complaint and grievance handling SOP',critical:true},
   {id:'a2',text:'Patient discharge and billing SOP'},
   {id:'a3',text:'Biomedical waste segregation SOP',critical:true},
   {id:'a4',text:'Housekeeping and terminal cleaning SOP'}]},
  {name:'5. Quality & Records',items:[
   {id:'q1',text:'Medical record completion and storage SOP',critical:true},
   {id:'q2',text:'Incident and near-miss reporting SOP'},
   {id:'q3',text:'CAPA (corrective action) procedure documented'}]}],
 results:CHECKLIST_RESULTS,
 assumptions:'Critical SOPs are those required for patient safety and accreditation; gaps in these must be closed before any assessment.',
 faq:[
  {q:'How many SOPs does a hospital need for NABH?',a:'NABH expects SOPs for all critical patient care and support processes — typically 150–300 SOPs for a full hospital, categorised by department.'},
  {q:'Who should approve hospital SOPs?',a:'Clinical SOPs are approved by the Medical Director or department head; administrative SOPs by the CEO or COO. All SOPs must be version-controlled and review-dated.'},
  {q:'How often should hospital SOPs be reviewed?',a:'At least annually, or whenever there is a significant change in process, equipment, regulation or adverse event related to the procedure.'}],
 logic:CHECKLIST_LOGIC});

/* 13. Clinical Audit Checklist */
push({id:'clinical-audit-checklist',name:'Clinical Audit Checklist',kind:'checklist',
 short:'Structure and completeness check for hospital clinical audits.',
 intro:'Use this checklist to ensure your hospital\'s clinical audit process is properly structured, covers all required domains and meets accreditation expectations.',
 seo:{title:'Clinical Audit Checklist — Hospital Quality Audit Tool | Varada Nexus',description:'Free clinical audit checklist for hospitals. Ensure audit programme covers required domains, sampling, outcomes and feedback loops for accreditation.',keywords:['clinical audit checklist','hospital audit tool','medical audit india']},
 buttonLabel:'Check Audit Readiness',
 checklist:[
  {name:'1. Audit Programme',items:[
   {id:'a1',text:'Annual clinical audit calendar documented and approved',critical:true},
   {id:'a2',text:'Audit topics selected based on high volume / high risk',critical:true},
   {id:'a3',text:'Multidisciplinary audit committee constituted'}]},
  {name:'2. Audit Process',items:[
   {id:'b1',text:'Standard / criterion defined before each audit',critical:true},
   {id:'b2',text:'Sample size and sampling method documented',critical:true},
   {id:'b3',text:'Data collection tool (form/checklist) in place'},
   {id:'b4',text:'Baseline and re-audit cycles planned'}]},
  {name:'3. Key Audit Areas',items:[
   {id:'c1',text:'Medication error audit conducted quarterly',critical:true},
   {id:'c2',text:'Hand hygiene compliance audit monthly',critical:true},
   {id:'c3',text:'Antibiotic stewardship audit active'},
   {id:'c4',text:'Surgical site infection surveillance ongoing'},
   {id:'c5',text:'Re-admission rate monitored and reviewed'}]},
  {name:'4. Feedback & Action',items:[
   {id:'d1',text:'Audit findings presented to clinical team',critical:true},
   {id:'d2',text:'CAPA raised for every significant finding',critical:true},
   {id:'d3',text:'Improvement in subsequent re-audit documented'},
   {id:'d4',text:'CME / in-service training linked to audit gaps'}]}],
 results:CHECKLIST_RESULTS,
 assumptions:'Framework aligned to NABH Standard QPS and Joint Commission audit requirements.',
 faq:[
  {q:'What is a clinical audit in a hospital?',a:'A clinical audit systematically reviews actual practice against defined standards to identify gaps, implement improvements and verify that care quality has improved.'},
  {q:'What must a hospital audit for NABH?',a:'NABH expects audits covering medication safety, infection control, clinical documentation, patient satisfaction and surgical outcomes as minimum.'},
  {q:'How is a clinical audit different from an inspection?',a:'Audits are internally driven quality improvement exercises; inspections are external regulatory checks. Audit results are used internally; inspection findings may have legal consequences.'}],
 logic:CHECKLIST_LOGIC});

/* 14. Hospital KPI Dashboard */
push({id:'hospital-kpi-dashboard',name:'Hospital KPI Dashboard Calculator',
 short:'Calculate ALOS, BOR, BTO, TOI and GDR from admission data.',
 intro:'Compute the four core hospital operational KPIs — Average Length of Stay (ALOS), Bed Occupancy Rate (BOR), Bed Turnover (BTO) and Turn-over Interval (TOI) — from monthly admission and discharge data.',
 seo:{title:'Hospital KPI Dashboard Calculator — ALOS BOR BTO TOI | Varada Nexus',description:'Free hospital KPI calculator. Compute ALOS, BOR, BTO and Turnover Interval from monthly hospital admissions and bed data.',keywords:['hospital kpi calculator','alos bor bto calculator','hospital bed metrics india']},
 inputs:[
  {id:'beds',label:'Available beds',type:'number',default:150,min:1},
  {id:'admissions',label:'Monthly admissions',type:'number',default:900,min:1},
  {id:'days_occupied',label:'Total patient-days (month)',type:'number',default:3200,min:1},
  {id:'period',label:'Days in period',type:'number',default:30,min:1}],
 results:{rowFmt:'raw',columns:['KPI','Formula','Value'],kpis:[{key:'k1',label:'ALOS (days)',format:'text'},{key:'k2',label:'BOR (%)',format:'text'},{key:'k3',label:'BTO (turnovers)',format:'text'}]},
 assumptions:'ALOS = total patient-days ÷ admissions. BOR = patient-days ÷ (beds × days) × 100. BTO = admissions ÷ beds. TOI = (beds × days − patient-days) ÷ admissions.',
 faq:[
  {q:'What is a good ALOS for an Indian hospital?',a:'For a multispecialty hospital, 3–5 days is typical; higher for tertiary/complex cases and lower for surgical day-care. National average is around 4–5 days.'},
  {q:'What is an ideal BOR?',a:'Around 80–85% is widely considered optimal — efficient without creating capacity pressure. Consistently above 90% risks quality and safety.'},
  {q:'What does BTO measure?',a:'Bed Turnover tells you how many patients are admitted per bed per month; higher values indicate more efficient bed utilisation.'}],
 logic:`export function compute(v){
  const b=+v.beds||1,adm=+v.admissions||1,pd=+v.days_occupied||1,days=+v.period||30;
  const alos=pd/adm;
  const bor=pd/(b*days)*100;
  const bto=adm/b;
  const toi=(b*days-pd)/adm;
  const fmt=n=>Math.round(n*10)/10;
  const rows=[
   ['ALOS','patient-days ÷ admissions',fmt(alos)+' days'],
   ['BOR','patient-days ÷ (beds × days)×100',fmt(bor)+'%'],
   ['BTO','admissions ÷ beds',fmt(bto)+' turns/month'],
   ['TOI','(avail. days − patient-days) ÷ admissions',fmt(toi)+' days'],
   ['Patient-days','',pd.toLocaleString('en-IN')],
   ['Admissions','',adm.toLocaleString('en-IN')]];
  return{rows,k1:fmt(alos)+' days',k2:fmt(bor)+'%',k3:fmt(bto)};}`});

/* 15. Operating Budget Planner */
push({id:'hospital-operating-budget',name:'Hospital Operating Budget Planner',
 short:'Annual operating expenditure budget by cost category.',
 intro:'Plan your hospital\'s annual operating budget split across staffing, drugs & consumables, utilities, maintenance, admin and overhead categories, benchmarked to revenue.',
 seo:{title:'Hospital Operating Budget Planner — Annual Opex by Category | Varada Nexus',description:'Free hospital operating budget planner. Estimate annual opex split across staffing, drugs, utilities, maintenance and admin from annual revenue.',keywords:['hospital operating budget','hospital opex calculator','hospital cost planning india']},
 inputs:[
  {id:'revenue',label:'Annual revenue (₹ lakhs)',type:'number',default:2000,min:100},
  {id:'type',label:'Hospital type',type:'select',default:'multi',options:[{v:'general',t:'General (lean cost structure)'},{v:'multi',t:'Multispecialty'},{v:'super',t:'Super-specialty (high cost)'}]},
  {id:'beds',label:'Operational beds',type:'number',default:150,min:10}],
 results:{rowFmt:'raw',columns:['Cost Category','% Revenue','Annual Budget'],kpis:[{key:'k1',label:'Total Opex',format:'text'},{key:'k2',label:'EBITDA',format:'text'},{key:'k3',label:'EBITDA margin',format:'text'}]},
 assumptions:'Benchmarks (% of revenue): staffing 35–45%, drugs/consumables 20–25%, utilities 5–8%, maintenance 3–5%, admin & marketing 5–8%, other 3–5%. Super-specialty has higher staffing and drug costs.',
 faq:[
  {q:'What percentage of revenue goes to staff in a hospital?',a:'Typically 35–45% of revenue; super-specialty hospitals with heavy specialist compensation can see staffing costs at 45–50%.'},
  {q:'What is a typical hospital EBITDA margin?',a:'Mature private hospitals in India typically operate at 18–28% EBITDA margin; new hospitals may be 5–15% for first 2–3 years.'},
  {q:'How do I reduce hospital operating costs?',a:'Vendor consolidation, drug inventory management, energy audits, shared services for non-clinical functions and technology for staff productivity are key levers.'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN')+' L';
const RATES={general:{staff:0.40,drugs:0.22,util:0.06,maint:0.04,admin:0.06,other:0.04},multi:{staff:0.42,drugs:0.23,util:0.065,maint:0.04,admin:0.065,other:0.04},super:{staff:0.45,drugs:0.25,util:0.07,maint:0.045,admin:0.07,other:0.045}};
export function compute(v){
  const rev=+v.revenue||2000,t=v.type||'multi';
  const R=RATES[t]||RATES.multi;
  const cats=[['Staffing & HR',R.staff],['Drugs & consumables',R.drugs],['Utilities',R.util],['Maintenance & AMC',R.maint],['Admin & marketing',R.admin],['Other overheads',R.other]];
  const totalPct=cats.reduce((s,[,p])=>s+p,0);
  const opex=rev*totalPct;
  const ebitda=rev-opex;
  const margin=ebitda/rev*100;
  const rows=cats.map(([n,p])=>[n,Math.round(p*100)+'%',inr(Math.round(rev*p))]);
  rows.push(['Total Opex',Math.round(totalPct*100)+'%',inr(Math.round(opex))]);
  return{rows,k1:inr(Math.round(opex)),k2:inr(Math.round(ebitda)),k3:Math.round(margin*10)/10+'%'};}`});

/* 16. Operational Readiness Checklist */
push({id:'operational-readiness-checklist',name:'Hospital Operational Readiness Checklist',kind:'checklist',
 short:'Pre-launch readiness for a new or expanded hospital.',
 intro:'Verify that all systems, processes, staff and regulatory requirements are in place before launching or expanding hospital operations.',
 seo:{title:'Hospital Operational Readiness Checklist — Pre-Launch Verification | Varada Nexus',description:'Free hospital operational readiness checklist. Verify all clinical, infrastructure, regulatory and HR requirements before hospital launch.',keywords:['hospital operational readiness','hospital pre launch checklist','new hospital opening checklist']},
 buttonLabel:'Check Readiness',
 checklist:[
  {name:'1. Infrastructure',items:[
   {id:'i1',text:'OT, ICU and wards fully fitted and cleaned',critical:true},
   {id:'i2',text:'Medical gas pipelines tested and certified',critical:true},
   {id:'i3',text:'Electrical backup (DG set / UPS) tested',critical:true},
   {id:'i4',text:'Fire suppression and alarm system tested',critical:true},
   {id:'i5',text:'HVAC / air handling units commissioned and validated'}]},
  {name:'2. Clinical Systems',items:[
   {id:'c1',text:'HMS (Hospital Management System) live and tested',critical:true},
   {id:'c2',text:'All equipment calibrated with operator training done',critical:true},
   {id:'c3',text:'Pharmacy stocked with essential drug list',critical:true},
   {id:'c4',text:'Lab set up with QC controls running'},
   {id:'c5',text:'Blood bank / cross-matching capability in place (if applicable)'}]},
  {name:'3. Human Resources',items:[
   {id:'h1',text:'All clinical positions filled or locum arranged',critical:true},
   {id:'h2',text:'Nursing team inducted and duty roster ready',critical:true},
   {id:'h3',text:'Support staff (housekeeping, security, F&B) in place'},
   {id:'h4',text:'Emergency response team trained (BLS/ACLS certified)'}]},
  {name:'4. Regulatory',items:[
   {id:'r1',text:'Clinical Establishment licence received',critical:true},
   {id:'r2',text:'Fire NOC and occupancy certificate obtained',critical:true},
   {id:'r3',text:'BMW authorisation received',critical:true}]},
  {name:'5. Commercial',items:[
   {id:'m1',text:'Insurance / TPA empanelment completed for at least 3 payors'},
   {id:'m2',text:'Tariff list approved by management'},
   {id:'m3',text:'Website, signage and marketing materials ready'},
   {id:'m4',text:'Billing and cash collection process tested'}]}],
 results:CHECKLIST_RESULTS,
 assumptions:'All critical items must be fully complete before patient admission. Partial items may be acceptable for soft launch if risk-assessed.',
 faq:[
  {q:'What is the most common gap at hospital launch?',a:'HMS not fully tested, inadequate nursing staffing and pending BMW authorisation are the three most common gaps that delay launches.'},
  {q:'Can a hospital do a soft launch before all licences are in place?',a:'No — the Clinical Establishment licence and fire NOC are mandatory before any patient can be admitted, with no exceptions.'},
  {q:'How long before opening should the readiness checklist be started?',a:'Start 3–4 months before target opening; critical infrastructure and regulatory items should be tracked 6+ months in advance.'}],
 logic:CHECKLIST_LOGIC});

/* 17. Hospital Workflow Planner */
push({id:'hospital-workflow-planner',name:'Hospital Workflow Planner',
 short:'Estimate process turnaround times across key hospital workflows.',
 intro:'Plan and benchmark turnaround times for key hospital workflows — from patient registration to discharge — to identify bottlenecks and set operational targets.',
 seo:{title:'Hospital Workflow Planner — Process TAT & Bottleneck Planner | Varada Nexus',description:'Free hospital workflow planner. Estimate turnaround times for registration, OPD, lab, OT and discharge workflows to identify bottlenecks.',keywords:['hospital workflow planning','hospital turnaround time','patient flow hospital']},
 inputs:[
  {id:'reg_time',label:'Registration time (minutes)',type:'number',default:5,min:1},
  {id:'wait_opd',label:'OPD waiting time (minutes)',type:'number',default:20,min:1},
  {id:'consult_time',label:'Consultation time (minutes)',type:'number',default:12,min:1},
  {id:'lab_tat',label:'Lab result TAT (minutes)',type:'number',default:60,min:5},
  {id:'pharmacy_time',label:'Pharmacy dispensing time (minutes)',type:'number',default:10,min:1},
  {id:'discharge_time',label:'Discharge process time (minutes)',type:'number',default:45,min:5}],
 results:{rowFmt:'raw',columns:['Process Step','Target (min)','Benchmark'],kpis:[{key:'k1',label:'Total OPD cycle time',format:'text'},{key:'k2',label:'Bottleneck step',format:'text'},{key:'k3',label:'Discharge TAT',format:'text'}]},
 assumptions:'Benchmarks: registration ≤5m, OPD wait ≤15m, consult 10–15m, lab 45–60m, pharmacy ≤10m, discharge ≤45m. Total OPD cycle = registration + wait + consult + pharmacy.',
 faq:[
  {q:'What is a good OPD waiting time?',a:'A patient waiting >30 minutes for a consultation is considered a quality gap; the benchmark target is ≤15 minutes median wait.'},
  {q:'What is the standard discharge TAT in hospitals?',a:'Best practice is ≤2 hours from discharge order to patient exit; >4 hours indicates process gaps in billing, pharmacy or transport.'},
  {q:'How do I reduce lab TAT?',a:'Automated analysers, pneumatic tube systems, dedicated phlebotomists and shift-based lab staffing aligned to peak demand hours are the key levers.'}],
 logic:`const BENCH={reg_time:5,wait_opd:15,consult_time:15,lab_tat:60,pharmacy_time:10,discharge_time:45};
const NAMES={reg_time:'Registration',wait_opd:'OPD wait',consult_time:'Consultation',lab_tat:'Lab TAT',pharmacy_time:'Pharmacy',discharge_time:'Discharge process'};
export function compute(v){
  const keys=Object.keys(NAMES);
  const rows=keys.map(k=>{
    const val=+v[k]||BENCH[k];
    const b=BENCH[k];
    const flag=val>b*1.3?'⚠️ Above target':val<=b?'✅ On target':'🟡 Near limit';
    return[NAMES[k],val+' min',flag];
  });
  const opdTotal=(+v.reg_time||5)+(+v.wait_opd||20)+(+v.consult_time||12)+(+v.pharmacy_time||10);
  const worst=keys.slice(0,5).reduce((a,k)=>((+v[k]||BENCH[k])/BENCH[k]>(+v[a]||BENCH[a])/BENCH[a])?k:a,keys[0]);
  return{rows,k1:opdTotal+' min',k2:NAMES[worst],k3:(+v.discharge_time||45)+' min'};}`});

/* 18. Consultancy Cost Estimator */
push({id:'consultancy-cost-estimator',name:'Hospital Consultancy Cost Estimator',
 short:'Fee estimate for hospital project management consultancy.',
 intro:'Estimate the professional fees for hospital project management and consultancy services across project phases — from DPR to operations handover.',
 seo:{title:'Hospital Consultancy Cost Estimator — PMC Fees India | Varada Nexus',description:'Free hospital consultancy cost estimator. Calculate hospital PMC fees across DPR, design, construction and commissioning phases.',keywords:['hospital consultancy fees','hospital pmc cost','hospital project management consultant india']},
 inputs:[
  {id:'project_cost',label:'Total project cost (₹ crores)',type:'number',default:60,min:1},
  {id:'beds',label:'Beds',type:'number',default:150,min:10},
  {id:'scope',label:'Consultancy scope',type:'select',default:'full',options:[{v:'dpr',t:'DPR only'},{v:'design',t:'DPR + Design support'},{v:'full',t:'Full PMC (DPR to commissioning)'},{v:'ops',t:'Operations advisory only'}]},
  {id:'duration',label:'Project duration (months)',type:'number',default:36,min:6}],
 results:{rowFmt:'raw',columns:['Phase','% of Project Cost','Fee'],kpis:[{key:'k1',label:'Total consultancy fee',format:'text'},{key:'k2',label:'Monthly retainer equiv.',format:'text'},{key:'k3',label:'Fee as % of project',format:'text'}]},
 assumptions:'Hospital PMC typically 2.5–5% of project cost for full scope. DPR-only 0.3–0.8%, design support add 0.5–1%, commissioning & ops add 0.5–1%. Based on Indian market rates 2024.',
 faq:[
  {q:'What does a hospital PMC consultant do?',a:'A Project Management Consultant oversees DPR, architectural briefing, vendor selection, construction monitoring, equipment procurement, licensing and commissioning on behalf of the promoter.'},
  {q:'How much does hospital consultancy cost in India?',a:'Full-scope PMC typically costs 3–5% of project cost; for a ₹60 crore hospital, that is ₹1.8–3 crore in consultancy fees across 3 years.'},
  {q:'When should I hire a hospital consultant?',a:'Ideally at the concept stage — before land purchase — so the consultant can advise on location feasibility, clinical programme and regulatory requirements from the outset.'}],
 logic:`const inr=n=>'₹'+Math.round(n*100)/100+' Cr';
const SCOPES={dpr:{pct:0.006,phases:[['DPR & feasibility study',60],['Report delivery',40]]},
design:{pct:0.015,phases:[['DPR & feasibility',30],['Architectural briefing & design review',40],['Equipment planning',30]]},
full:{pct:0.040,phases:[['DPR & concept',15],['Design & approvals',20],['Construction monitoring',35],['Equipment & IT',15],['Commissioning & handover',15]]},
ops:{pct:0.012,phases:[['Operations setup advisory',50],['Quality & accreditation prep',30],['KPI dashboard & review',20]]}};
export function compute(v){
  const pc=+v.project_cost||60,dur=+v.duration||36,s=v.scope||'full';
  const S=SCOPES[s]||SCOPES.full;
  const fee=pc*S.pct;
  const monthly=fee/dur;
  const rows=S.phases.map(([ph,pct])=>[ph,pct+'%',inr(fee*pct/100)]);
  rows.push(['Total fee',Math.round(S.pct*100*10)/10+'% of project',inr(fee)]);
  return{rows,k1:inr(fee),k2:'₹'+Math.round(monthly*100)/100+' Cr/mo',k3:Math.round(S.pct*100*10)/10+'%'};}`});

const n=writeTools(T);
console.log('Consultancy tools written:',n);
