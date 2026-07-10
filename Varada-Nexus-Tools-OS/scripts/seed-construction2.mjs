import { writeTools } from './_seedlib.mjs';
const REL=[{label:'Hospital Infrastructure',url:'/hospital.html'},{label:'Hospital Consultancy',url:'/consultancy.html'}];
const T=[]; const push=o=>{o.cat='hospital-construction';o.related=o.related||REL;T.push(o);};
const inr="const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');";

push({id:'hvac-capacity-calculator',name:'HVAC Capacity Calculator',
 short:'Air-conditioning tonnage (TR) and cost by area.',
 intro:'Estimate the air-conditioning capacity in tons of refrigeration (TR) and indicative cost for a space from area and cooling load density.',
 seo:{title:'HVAC Capacity Calculator — AC Tonnage (TR) & Cost by Area | Varada Nexus',description:'Free HVAC capacity calculator. Estimate air-conditioning tonnage (TR) and cost from area and space type.',keywords:['hvac calculator','ac tonnage calculator','tr calculator for area']},
 inputs:[{id:'area',label:'Area (sq ft)',type:'number',default:5000,min:0},{id:'sqftTR',label:'Space type (sq ft per TR)',type:'select',default:'120',options:[{v:'150',t:'General/office (150)'},{v:'120',t:'Hospital ward (120)'},{v:'100',t:'Public/lobby (100)'},{v:'80',t:'OT / ICU (80)'}]},{id:'costTR',label:'Cost per TR (₹)',type:'number',default:45000,min:0}],
 results:{rowFmt:'raw',columns:['Metric','','Value'],kpis:[{key:'k1',label:'Cooling capacity',format:'text'},{key:'k2',label:'Indicative cost',format:'text'},{key:'k3',label:'Area',format:'text'}]},
 assumptions:'TR = area ÷ sq ft per TR (lower for high-heat spaces like OT/ICU). Cost = TR × cost per TR (equipment + basic install). Detailed heat-load calculations override this thumb rule.',
 faq:[{q:'How many square feet per ton of AC?',a:'Roughly 120–150 sq ft per TR for offices/wards, dropping to ~80 for high-load OT/ICU spaces.'},
   {q:'How is HVAC cost estimated?',a:'Multiply the required TR by a per-TR cost; ducting, AHUs and controls can add significantly for central systems.'},
   {q:'Why do OT and ICU need more cooling?',a:'They require tighter temperature, humidity and air-change control, increasing the effective cooling load.'}],
 logic:inr+`
export function compute(v){const a=+v.area||0,s=+v.sqftTR||120,c=+v.costTR||45000,tr=a/s;
 const rows=[['Area','',a.toLocaleString('en-IN')+' sq ft'],['Cooling capacity','@ '+s+' sqft/TR',(Math.ceil(tr))+' TR'],['Indicative cost','@ ₹'+c+'/TR',inr(Math.ceil(tr)*c)]];
 return{rows,k1:Math.ceil(tr)+' TR',k2:inr(Math.ceil(tr)*c),k3:a.toLocaleString('en-IN')+' sq ft'};}`});

push({id:'medical-gas-cost-calculator',name:'Medical Gas System Cost Calculator',
 short:'Cost of a medical gas system incl. outlets and source.',
 intro:'Estimate the cost of a hospital medical gas system — outlets and piping plus the source plant (manifold or PSA) — from bed count and outlets per bed.',
 seo:{title:'Medical Gas System Cost Calculator — MGPS Cost incl. Source | Varada Nexus',description:'Free medical gas system cost calculator. Estimate MGPS cost from outlets, piping and source plant for a hospital.',keywords:['medical gas cost calculator','mgps cost','hospital gas pipeline cost']},
 inputs:[{id:'beds',label:'Number of beds',type:'number',default:150,min:0},{id:'outlets',label:'Outlets per bed',type:'number',default:3,min:1},{id:'rate',label:'Cost per outlet incl. piping (₹)',type:'number',default:18000,min:0},{id:'source',label:'Source plant cost (₹)',type:'number',default:2500000,min:0}],
 results:{rowFmt:'raw',columns:['Component','','Amount'],kpis:[{key:'k1',label:'Total MGPS cost',format:'text'},{key:'k2',label:'Outlets & piping',format:'text'},{key:'k3',label:'Cost per bed',format:'text'}]},
 assumptions:'Outlets = beds × outlets per bed. Outlet+piping cost = outlets × rate. Total = that + source plant (manifold/PSA/LMO). Alarms and validation may be extra.',
 faq:[{q:'What does a medical gas system cost?',a:'It depends on outlet count, piping runs and the source plant; outlets+piping plus a manifold/PSA plant make up most of the cost.'},
   {q:'What is included in the source plant?',a:'The oxygen manifold or PSA generator, medical air compressors and vacuum plant that feed the pipeline.'},
   {q:'Are alarms included?',a:'Area alarms and validation are sometimes separate line items — confirm with your MGPS vendor.'}],
 logic:inr+`
export function compute(v){const b=+v.beds||0,o=+v.outlets||3,r=+v.rate||18000,s=+v.source||0,out=b*o,op=out*r,tot=op+s;
 const rows=[['Outlets','',out.toLocaleString('en-IN')],['Outlets & piping','@ ₹'+r+'/outlet',inr(op)],['Source plant','',inr(s)],['Total','',inr(tot)]];
 return{rows,k1:inr(tot),k2:inr(op),k3:inr(tot/(b||1))};}`});

push({id:'fire-safety-cost-estimator',name:'Fire Safety Cost Estimator',
 short:'Fire protection system cost by building area.',
 intro:'Estimate the cost of a building fire protection system — sprinklers, hydrants, alarms and extinguishers — from built-up area and system level.',
 seo:{title:'Fire Safety Cost Estimator — Fire Fighting System Cost by Area | Varada Nexus',description:'Free fire safety cost estimator. Estimate sprinkler, hydrant, alarm and extinguisher cost from building area.',keywords:['fire safety cost calculator','fire fighting system cost','sprinkler cost estimator']},
 inputs:[{id:'area',label:'Built-up area (sq ft)',type:'number',default:50000,min:0},{id:'rate',label:'System level (₹/sq ft)',type:'select',default:'140',options:[{v:'90',t:'Basic (₹90)'},{v:'140',t:'Standard (₹140)'},{v:'200',t:'Comprehensive/hospital (₹200)'}]}],
 results:{rowFmt:'raw',columns:['System','share','Amount'],kpis:[{key:'k1',label:'Total fire safety cost',format:'text'},{key:'k2',label:'Sprinklers',format:'text'},{key:'k3',label:'Cost per sq ft',format:'text'}]},
 assumptions:'Total = area × rate. Indicative split: sprinklers 40%, hydrants & pumps 30%, detection & alarm 20%, extinguishers & signage 10%. Actual cost depends on NBC compliance and building height.',
 faq:[{q:'How much does a fire fighting system cost?',a:'Roughly ₹90–200 per sq ft depending on the building type and level of protection required.'},
   {q:'What does a hospital fire system include?',a:'Sprinklers, wet risers and hydrants, fire pumps, detection and alarm, extinguishers, signage and often a fire command centre.'},
   {q:'Is this NBC compliant?',a:'This is a budgeting estimate; the actual design must follow the National Building Code and local fire NOC requirements.'}],
 logic:inr+`
export function compute(v){const a=+v.area||0,r=+v.rate||140,t=a*r;const S=[['Sprinklers',.4],['Hydrants & pumps',.3],['Detection & alarm',.2],['Extinguishers & signage',.1]];
 const rows=S.map(([n,p])=>[n,(p*100)+'%',inr(t*p)]);rows.push(['Total','',inr(t)]);
 return{rows,k1:inr(t),k2:inr(t*.4),k3:inr(r)};}`});

push({id:'construction-timeline-planner',name:'Construction Timeline Planner',
 short:'Project duration in months from area and build speed.',
 intro:'Estimate a construction project’s duration from built-up area and monthly build speed, including design/approvals and finishing phases.',
 seo:{title:'Construction Timeline Planner — Project Duration by Area | Varada Nexus',description:'Free construction timeline planner. Estimate project duration in months from built-up area and build speed, with phase split.',keywords:['construction timeline calculator','project duration estimator','construction schedule planner']},
 inputs:[{id:'area',label:'Built-up area (sq ft)',type:'number',default:100000,min:0},{id:'speed',label:'Build speed (sq ft/month)',type:'number',default:8000,min:1},{id:'design',label:'Design & approvals (months)',type:'number',default:3,min:0}],
 results:{rowFmt:'raw',columns:['Phase','','Months'],kpis:[{key:'k1',label:'Total duration',format:'text'},{key:'k2',label:'Construction',format:'text'},{key:'k3',label:'Design & approvals',format:'text'}]},
 assumptions:'Construction months = area ÷ build speed. Finishing & MEP commissioning ≈ 25% of construction. Total = design + construction + finishing. Weather, funding and approvals can extend this.',
 faq:[{q:'How long does construction take?',a:'Structure time ≈ area ÷ build speed; add design/approvals up front and finishing/commissioning at the end.'},
   {q:'What build speed should I use?',a:'It varies with labour, method and site; a few thousand sq ft per month is common for conventional RCC work.'},
   {q:'What can delay a project?',a:'Approvals, funding gaps, monsoon, material shortages and design changes are the usual causes.'}],
 logic:`export function compute(v){const a=+v.area||0,s=+v.speed||1,d=+v.design||0,con=a/s,fin=con*0.25,tot=d+con+fin;
 const r=n=>Math.round(n*10)/10;
 const rows=[['Design & approvals','',r(d)],['Construction','@ '+s+' sqft/mo',r(con)],['Finishing & MEP','~25%',r(fin)],['Total','',r(tot)]];
 return{rows,k1:r(tot)+' months',k2:r(con)+' months',k3:r(d)+' months'};}`});

push({id:'contractor-cost-estimator',name:'Contractor Cost Estimator',
 short:'Contractor price from base cost, overhead and GST.',
 intro:'Estimate a contractor’s quoted price from the base construction cost, contractor overhead & profit margin and applicable GST.',
 seo:{title:'Contractor Cost Estimator — Contractor Price incl. Margin & GST | Varada Nexus',description:'Free contractor cost estimator. Add overhead, profit and GST to a base construction cost to get the contractor price.',keywords:['contractor cost estimator','contractor margin calculator','construction contractor price']},
 inputs:[{id:'base',label:'Base construction cost (₹)',type:'number',default:50000000,min:0},{id:'oh',label:'Overhead & profit (%)',type:'number',default:15,min:0},{id:'gst',label:'GST (%)',type:'number',default:18,min:0}],
 results:{rowFmt:'raw',columns:['Component','','Amount'],kpis:[{key:'k1',label:'Contract price (incl. GST)',format:'text'},{key:'k2',label:'Overhead & profit',format:'text'},{key:'k3',label:'GST',format:'text'}]},
 assumptions:'Contractor price before tax = base × (1 + overhead & profit%). GST is applied on that. Works-contract GST is commonly 18%.',
 faq:[{q:'What overhead and profit do contractors add?',a:'Commonly 10–20% over direct cost to cover site overheads, supervision, risk and profit.'},
   {q:'What GST applies to construction contracts?',a:'Most works contracts attract 18% GST, though certain affordable housing and government works differ.'},
   {q:'Is this the final price?',a:'It is indicative; the actual quote depends on scope, specifications and contract terms.'}],
 logic:inr+`
export function compute(v){const b=+v.base||0,o=+v.oh||0,g=+v.gst||0,oh=b*o/100,pre=b+oh,gst=pre*g/100,tot=pre+gst;
 const rows=[['Base cost','',inr(b)],['Overhead & profit','@ '+o+'%',inr(oh)],['Sub-total','',inr(pre)],['GST','@ '+g+'%',inr(gst)],['Contract price','',inr(tot)]];
 return{rows,k1:inr(tot),k2:inr(oh),k3:inr(gst)};}`});

push({id:'labour-cost-calculator',name:'Construction Labour Cost Calculator',
 short:'Labour cost from crew size, wages and days.',
 intro:'Estimate construction labour cost from the number of skilled and unskilled workers, their daily wages and the number of working days.',
 seo:{title:'Construction Labour Cost Calculator — Crew Wage Cost | Varada Nexus',description:'Free construction labour cost calculator. Estimate labour cost from skilled/unskilled crew size, daily wages and days.',keywords:['labour cost calculator','construction labour calculator','crew wage calculator']},
 inputs:[{id:'skilled',label:'Skilled workers',type:'number',default:20,min:0},{id:'skWage',label:'Skilled daily wage (₹)',type:'number',default:900,min:0},{id:'unskilled',label:'Unskilled workers',type:'number',default:30,min:0},{id:'unWage',label:'Unskilled daily wage (₹)',type:'number',default:600,min:0},{id:'days',label:'Working days',type:'number',default:120,min:0}],
 results:{rowFmt:'raw',columns:['Crew','','Cost'],kpis:[{key:'k1',label:'Total labour cost',format:'text'},{key:'k2',label:'Skilled',format:'text'},{key:'k3',label:'Per day',format:'text'}]},
 assumptions:'Skilled cost = skilled × wage × days; unskilled likewise. Total = sum. Excludes PF/ESI, overtime and contractor margin unless built into the wage.',
 faq:[{q:'How is construction labour cost calculated?',a:'Multiply each crew’s headcount by its daily wage and the number of working days, then add the crews.'},
   {q:'Are statutory costs included?',a:'No — add PF, ESI, insurance and any overtime separately, or use a fully-loaded wage.'},
   {q:'How do I control labour cost?',a:'Improve productivity, sequence trades to avoid idle time and track daily output against plan.'}],
 logic:inr+`
export function compute(v){const s=+v.skilled||0,sw=+v.skWage||0,u=+v.unskilled||0,uw=+v.unWage||0,d=+v.days||0;
 const sk=s*sw*d,un=u*uw*d,tot=sk+un,perDay=d>0?tot/d:0;
 const rows=[['Skilled','@ ₹'+sw+' x '+d+'d',inr(sk)],['Unskilled','@ ₹'+uw+' x '+d+'d',inr(un)],['Total labour','',inr(tot)],['Per day','',inr(perDay)]];
 return{rows,k1:inr(tot),k2:inr(sk),k3:inr(perDay)};}`});

push({id:'structural-cost-calculator',name:'Structural Cost Calculator',
 short:'RCC structural (frame) cost by built-up area.',
 intro:'Estimate the structural (RCC frame) cost of a building — concrete, steel and formwork — from built-up area and a structural rate.',
 seo:{title:'Structural Cost Calculator — RCC Frame Cost by Area | Varada Nexus',description:'Free structural cost calculator. Estimate RCC frame cost (concrete, steel, formwork) from built-up area.',keywords:['structural cost calculator','rcc frame cost','structure cost per sqft']},
 inputs:[{id:'area',label:'Built-up area (sq ft)',type:'number',default:50000,min:0},{id:'rate',label:'Structural rate (₹/sq ft)',type:'select',default:'1000',options:[{v:'800',t:'Low-rise (₹800)'},{v:'1000',t:'Mid-rise (₹1,000)'},{v:'1300',t:'High-rise/heavy (₹1,300)'}]}],
 results:{rowFmt:'raw',columns:['Element','share','Amount'],kpis:[{key:'k1',label:'Total structural cost',format:'text'},{key:'k2',label:'Concrete',format:'text'},{key:'k3',label:'Steel',format:'text'}]},
 assumptions:'Structural cost = area × structural rate. Indicative split: concrete 40%, steel 35%, formwork & labour 25%. The structure is usually 25–30% of total civil cost.',
 faq:[{q:'What is the structural cost per sq ft?',a:'Roughly ₹800–1,300 per sq ft for the RCC frame, depending on building height and loading.'},
   {q:'What share of cost is the structure?',a:'The structural frame is typically about a quarter to a third of total civil construction cost.'},
   {q:'What drives structural cost up?',a:'Height, spans, seismic zone, soil condition and heavy floor loads all increase steel and concrete quantities.'}],
 logic:inr+`
export function compute(v){const a=+v.area||0,r=+v.rate||1000,t=a*r;
 const rows=[['Concrete','40%',inr(t*.4)],['Steel','35%',inr(t*.35)],['Formwork & labour','25%',inr(t*.25)],['Total structural','',inr(t)]];
 return{rows,k1:inr(t),k2:inr(t*.4),k3:inr(t*.35)};}`});

push({id:'project-budget-planner',name:'Construction Project Budget Planner',
 short:'Split a project budget across all cost heads.',
 intro:'Break a total construction project budget into civil, MEP, equipment, preliminaries, consultancy and contingency for early financial planning.',
 seo:{title:'Construction Project Budget Planner — Budget Split by Head | Varada Nexus',description:'Free construction project budget planner. Split a total budget into civil, MEP, equipment, consultancy and contingency.',keywords:['project budget planner','construction budget split','capex planning construction']},
 inputs:[{id:'budget',label:'Total project budget (₹)',type:'number',default:100000000,min:0}],
 results:{rowFmt:'raw',columns:['Head','share','Amount'],kpis:[{key:'k1',label:'Civil',format:'text'},{key:'k2',label:'MEP & services',format:'text'},{key:'k3',label:'Equipment',format:'text'}]},
 assumptions:'Indicative allocation: civil 45%, MEP & services 22%, equipment 18%, preliminaries 5%, consultancy 4%, contingency 6%. Tune to project type; equipment is far higher for hospitals.',
 faq:[{q:'How should a construction budget be split?',a:'Broadly civil ~45%, MEP ~22%, equipment ~18%, with the rest across preliminaries, consultancy and contingency.'},
   {q:'Why hold a contingency?',a:'To absorb scope changes, escalation and unforeseen site conditions without derailing the project.'},
   {q:'Is equipment always 18%?',a:'No — for hospitals and labs equipment can be 30%+; adjust the split to your project.'}],
 logic:inr+`
export function compute(v){const b=+v.budget||0;const S=[['Civil',.45],['MEP & services',.22],['Equipment',.18],['Contingency',.06],['Preliminaries',.05],['Consultancy',.04]];
 const rows=S.map(([n,p])=>[n,(p*100)+'%',inr(b*p)]);
 return{rows,k1:inr(b*.45),k2:inr(b*.22),k3:inr(b*.18)};}`});

push({id:'construction-roi-calculator',name:'Construction ROI Calculator',
 short:'ROI and payback for a construction/property project.',
 intro:'Calculate return on investment and payback period for a construction or property project from total cost and expected annual rental or operating income.',
 seo:{title:'Construction ROI Calculator — Property Project Return & Payback | Varada Nexus',description:'Free construction ROI calculator. Get ROI percentage and payback period from project cost and annual income.',keywords:['construction roi calculator','property roi calculator','real estate payback calculator']},
 inputs:[{id:'cost',label:'Total project cost (₹)',type:'number',default:100000000,min:0},{id:'income',label:'Annual net income (₹)',type:'number',default:12000000,min:0}],
 results:{rowFmt:'raw',columns:['Metric','','Value'],kpis:[{key:'k1',label:'Annual ROI',format:'text'},{key:'k2',label:'Payback period',format:'text'},{key:'k3',label:'10-year income',format:'text'}]},
 assumptions:'ROI% = annual net income ÷ project cost × 100. Payback = cost ÷ annual income. Ignores financing cost, appreciation and the time value of money.',
 faq:[{q:'How is construction ROI calculated?',a:'ROI% = annual net income ÷ total project cost × 100; payback = cost ÷ annual income.'},
   {q:'Does it include capital appreciation?',a:'No, this is income yield only; property value growth would improve the true total return.'},
   {q:'What is a good ROI for property?',a:'It varies by market and asset type; compare against local rental yields and alternative investments.'}],
 logic:inr+`
export function compute(v){const c=+v.cost||1,i=+v.income||0,roi=c>0?i/c*100:0,pb=i>0?c/i:0;
 const rows=[['Annual ROI','',(Math.round(roi*10)/10)+'%'],['Payback period','',i>0?(Math.round(pb*10)/10)+' years':'—'],['10-year income','',inr(i*10)]];
 return{rows,k1:(Math.round(roi*10)/10)+'%',k2:i>0?(Math.round(pb*10)/10)+' yr':'—',k3:inr(i*10)};}`});

push({id:'project-progress-tracker',name:'Project Progress Tracker',
 short:'Schedule status: planned vs actual progress and variance.',
 intro:'Track a project’s schedule health by comparing planned progress (from time elapsed) against actual work done, with a variance and projected completion.',
 seo:{title:'Project Progress Tracker — Planned vs Actual & Schedule Variance | Varada Nexus',description:'Free project progress tracker. Compare planned vs actual progress, get schedule variance and projected completion.',keywords:['project progress tracker','schedule variance calculator','planned vs actual progress']},
 inputs:[{id:'duration',label:'Total duration (months)',type:'number',default:18,min:1},{id:'elapsed',label:'Months elapsed',type:'number',default:9,min:0},{id:'done',label:'Actual work done (%)',type:'number',default:45,min:0,max:100}],
 results:{rowFmt:'raw',columns:['Metric','','Value'],kpis:[{key:'k1',label:'Status',format:'text'},{key:'k2',label:'Variance',format:'text'},{key:'k3',label:'Projected completion',format:'text'}]},
 assumptions:'Planned progress = elapsed ÷ duration × 100 (linear). Variance = actual − planned. Projected duration = elapsed ÷ (actual% ÷ 100). A linear plan is assumed; real S-curves differ.',
 faq:[{q:'How is schedule variance measured?',a:'Compare actual work done against the planned progress for the time elapsed; a negative gap means the project is behind.'},
   {q:'What does projected completion mean?',a:'Extrapolating the current pace: elapsed months ÷ fraction of work done estimates the total months needed.'},
   {q:'Is linear planned progress realistic?',a:'It is a simplification; most projects follow an S-curve, slower at start and finish.'}],
 logic:`export function compute(v){const d=+v.duration||1,e=+v.elapsed||0,done=+v.done||0,planned=e/d*100,varn=done-planned;
 const status=varn>=5?'Ahead of schedule':varn<=-5?'Behind schedule':'On track';
 const proj=done>0?e/(done/100):d;
 const rows=[['Planned progress','elapsed/duration',(Math.round(planned))+'%'],['Actual progress','',done+'%'],['Variance','',(varn>=0?'+':'')+(Math.round(varn))+'%'],['Projected completion','',(Math.round(proj*10)/10)+' months']];
 return{rows,k1:status,k2:(varn>=0?'+':'')+Math.round(varn)+'%',k3:(Math.round(proj*10)/10)+' mo'};}`});

const n=writeTools(T); console.log('construction part-2 seeded '+n+' tools');
