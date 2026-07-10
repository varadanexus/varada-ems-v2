import { writeTools } from './_seedlib.mjs';
const REL=[{label:'Hospital Infrastructure',url:'/hospital.html'},{label:'Hospital Consultancy',url:'/consultancy.html'}];
const T=[]; const push=o=>{o.cat='hospital-construction';o.related=o.related||REL;T.push(o);};
const GRADES=[{v:'1-2-4',t:'M15 (1:2:4)'},{v:'1-1.5-3',t:'M20 (1:1.5:3)'},{v:'1-1-2',t:'M25 (1:1:2)'}];

push({id:'hospital-building-cost-calculator',name:'Hospital Building Cost Calculator',
 short:'Civil + services construction cost from built-up area.',
 intro:'Estimate hospital building construction cost from built-up area and finishing grade, including civil, MEP, HVAC and a contingency.',
 seo:{title:'Hospital Building Cost Calculator — Construction Cost by Area | Varada Nexus',description:'Free hospital building cost calculator. Estimate civil, MEP and HVAC construction cost from built-up area and finish grade.',keywords:['hospital building cost calculator','hospital construction cost per sqft','building cost estimator']},
 inputs:[{id:'area',label:'Built-up area (sq ft)',type:'number',default:100000,min:0},{id:'rate',label:'Civil rate (₹/sq ft)',type:'select',default:'3500',options:[{v:'2500',t:'Standard ₹2,500'},{v:'3500',t:'Premium ₹3,500'},{v:'4500',t:'Super-premium ₹4,500'}]},{id:'cont',label:'Contingency (%)',type:'number',default:7,min:0}],
 results:{rowFmt:'raw',columns:['Component','','Amount'],kpis:[{key:'k1',label:'Total cost',format:'text'},{key:'k2',label:'Cost per sq ft',format:'text'},{key:'k3',label:'Civil cost',format:'text'}]},
 assumptions:'Civil = area × civil rate. MEP 25%, HVAC 15%, medical gas & fire 8% of civil. Contingency applied on the sum. Equipment and land are excluded.',
 faq:[{q:'What is the construction cost of a hospital per sq ft?',a:'Civil work is typically ₹2,500–4,500/sq ft; with MEP, HVAC and services the all-in building cost is often ₹4,000–7,000/sq ft.'},
   {q:'Does this include medical equipment?',a:'No, this is building cost only. Equipment is usually an additional ₹5–15 lakh per bed.'},
   {q:'What is contingency for?',a:'A buffer (typically 5–10%) for design changes, price escalation and site conditions.'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){const a=+v.area||0,r=+v.rate||3500,cp=+v.cont||0;const civil=a*r,mep=civil*.25,hvac=civil*.15,mg=civil*.08,sub=civil+mep+hvac+mg,cont=sub*cp/100,tot=sub+cont;
 const rows=[['Civil',a.toLocaleString('en-IN')+' sq ft',inr(civil)],['MEP','25%',inr(mep)],['HVAC','15%',inr(hvac)],['Medical gas & fire','8%',inr(mg)],['Contingency',cp+'%',inr(cont)],['Total','',inr(tot)]];
 return{rows,k1:inr(tot),k2:inr(tot/(a||1)),k3:inr(civil)};}`});

push({id:'boq-estimator',name:'BOQ Estimator',
 short:'High-level bill of quantities cost split by area.',
 intro:'Generate a high-level Bill of Quantities cost split — substructure, superstructure, finishes, MEP and external works — from built-up area and an average rate.',
 seo:{title:'BOQ Estimator — Bill of Quantities Cost Split by Area | Varada Nexus',description:'Free BOQ estimator. Split building cost into substructure, superstructure, finishes, MEP and external works from area and rate.',keywords:['boq estimator','bill of quantities calculator','construction boq split']},
 inputs:[{id:'area',label:'Built-up area (sq ft)',type:'number',default:50000,min:0},{id:'rate',label:'Average rate (₹/sq ft)',type:'number',default:2500,min:0}],
 results:{rowFmt:'raw',columns:['BOQ head','share','Amount'],kpis:[{key:'k1',label:'Total BOQ',format:'text'},{key:'k2',label:'Superstructure',format:'text'},{key:'k3',label:'Finishes',format:'text'}]},
 assumptions:'Total = area × rate. Indicative split: substructure 15%, superstructure 30%, finishes 25%, MEP 22%, external & site 8%. Actual BOQ depends on design and specifications.',
 faq:[{q:'What is a BOQ?',a:'A Bill of Quantities itemises the materials, parts and labour (and their costs) for a construction project.'},
   {q:'How is a rough BOQ split?',a:'A common breakdown is substructure ~15%, superstructure ~30%, finishes ~25%, MEP ~22% and external works ~8%.'},
   {q:'Is this a detailed BOQ?',a:'No, this is a high-level cost split for early budgeting; a detailed BOQ is prepared from drawings by a quantity surveyor.'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){const a=+v.area||0,r=+v.rate||0,t=a*r;const S=[['Substructure',.15],['Superstructure',.30],['Finishes',.25],['MEP',.22],['External & site',.08]];
 const rows=S.map(([n,p])=>[n,(p*100)+'%',inr(t*p)]);rows.push(['Total','',inr(t)]);
 return{rows,k1:inr(t),k2:inr(t*.30),k3:inr(t*.25)};}`});

push({id:'civil-material-calculator',name:'Civil Material Calculator',
 short:'Cement, steel, sand, aggregate and bricks for a building.',
 intro:'Estimate the main civil materials — cement, steel, sand, aggregate and bricks — for a building using standard per-sq-ft thumb rules.',
 seo:{title:'Civil Material Calculator — Cement, Steel, Sand & Bricks by Area | Varada Nexus',description:'Free civil material calculator. Estimate cement, steel, sand, aggregate and bricks for a building from built-up area.',keywords:['civil material calculator','construction material estimate','building material calculator']},
 inputs:[{id:'area',label:'Built-up area (sq ft)',type:'number',default:2000,min:0}],
 results:{rowFmt:'raw',columns:['Material','thumb rule','Quantity'],kpis:[{key:'k1',label:'Cement',format:'text'},{key:'k2',label:'Steel',format:'text'},{key:'k3',label:'Bricks',format:'text'}]},
 assumptions:'Per-sq-ft thumb rules for RCC-framed construction: cement 0.4 bags, steel 4 kg, sand 1.2 cft, aggregate 1.35 cft, bricks 8 nos. These are approximate averages and vary with design.',
 faq:[{q:'How much cement is needed per sq ft?',a:'About 0.4 bags of cement per sq ft of built-up area for typical RCC-framed construction.'},
   {q:'How much steel per sq ft?',a:'Roughly 4 kg of steel per sq ft; heavily loaded or tall structures can need more.'},
   {q:'Are these exact?',a:'No — they are planning thumb rules. Exact quantities come from a structural design and detailed BOQ.'}],
 logic:`export function compute(v){const a=+v.area||0;const cem=a*0.4,steel=a*4,sand=a*1.2,agg=a*1.35,brick=a*8;
 const rows=[['Cement','0.4 bags/sqft',Math.round(cem).toLocaleString('en-IN')+' bags'],['Steel','4 kg/sqft',Math.round(steel).toLocaleString('en-IN')+' kg'],['Sand','1.2 cft/sqft',Math.round(sand).toLocaleString('en-IN')+' cft'],['Aggregate','1.35 cft/sqft',Math.round(agg).toLocaleString('en-IN')+' cft'],['Bricks','8 /sqft',Math.round(brick).toLocaleString('en-IN')+' nos']];
 return{rows,k1:Math.round(cem).toLocaleString('en-IN')+' bags',k2:Math.round(steel).toLocaleString('en-IN')+' kg',k3:Math.round(brick).toLocaleString('en-IN')+' nos'};}`});

push({id:'cement-calculator',name:'Cement Calculator',
 short:'Cement bags for concrete by volume and grade.',
 intro:'Calculate the cement bags, sand and aggregate needed for a concrete volume at a chosen mix grade (M15, M20, M25).',
 seo:{title:'Cement Calculator — Bags of Cement for Concrete by Grade | Varada Nexus',description:'Free cement calculator. Find cement bags, sand and aggregate for any concrete volume at M15, M20 or M25 grade.',keywords:['cement calculator','cement bags for concrete','concrete mix calculator']},
 inputs:[{id:'vol',label:'Concrete volume (m³)',type:'number',default:10,min:0},{id:'grade',label:'Concrete grade',type:'select',default:'1-1.5-3',options:GRADES}],
 results:{rowFmt:'raw',columns:['Material','','Quantity'],kpis:[{key:'k1',label:'Cement',format:'text'},{key:'k2',label:'Sand',format:'text'},{key:'k3',label:'Aggregate',format:'text'}]},
 assumptions:'Dry volume = 1.54 × wet volume. Cement bags = dry × (cement ÷ total ratio) × 1440 ÷ 50. Sand and aggregate by their ratio share, shown in cft (1 m³ = 35.315 cft).',
 faq:[{q:'How many cement bags per m³ of concrete?',a:'About 8 bags per m³ for M20 (1:1.5:3), ~6.5 for M15 and ~9.5 for M25.'},
   {q:'What is dry volume factor 1.54?',a:'Wet concrete volume shrinks; multiplying by 1.54 gives the dry material volume needed before mixing.'},
   {q:'Does this include wastage?',a:'No — add about 3–5% for wastage on site.'}],
 logic:`export function compute(v){const vol=+v.vol||0,[c,s,a]=(v.grade||'1-1.5-3').split('-').map(Number),tot=c+s+a,dry=vol*1.54;
 const bags=dry*(c/tot)*1440/50,sand=dry*(s/tot)*35.315,agg=dry*(a/tot)*35.315;
 const rows=[['Cement','1440 kg/m³',Math.ceil(bags)+' bags'],['Sand','',Math.round(sand)+' cft'],['Aggregate','',Math.round(agg)+' cft']];
 return{rows,k1:Math.ceil(bags)+' bags',k2:Math.round(sand)+' cft',k3:Math.round(agg)+' cft'};}`});

push({id:'steel-quantity-calculator',name:'Steel Quantity Calculator',
 short:'Reinforcement steel for RCC members by concrete volume.',
 intro:'Estimate reinforcement steel (rebar) quantity and cost for RCC members from concrete volume and member type, using standard kg-per-m³ rates.',
 seo:{title:'Steel Quantity Calculator — Rebar for RCC by Concrete Volume | Varada Nexus',description:'Free steel quantity calculator. Estimate reinforcement steel and cost for slabs, beams, columns and footings by concrete volume.',keywords:['steel calculator','rebar quantity calculator','reinforcement steel per m3']},
 inputs:[{id:'vol',label:'Concrete volume (m³)',type:'number',default:20,min:0},{id:'member',label:'RCC member',type:'select',default:'100',options:[{v:'75',t:'Footings (~75 kg/m³)'},{v:'100',t:'Slabs (~100 kg/m³)'},{v:'130',t:'Beams (~130 kg/m³)'},{v:'160',t:'Columns (~160 kg/m³)'}]},{id:'rate',label:'Steel price (₹/kg)',type:'number',default:65,min:0}],
 results:{rowFmt:'raw',columns:['Metric','','Value'],kpis:[{key:'k1',label:'Steel weight',format:'text'},{key:'k2',label:'In tonnes',format:'text'},{key:'k3',label:'Steel cost',format:'text'}]},
 assumptions:'Steel = concrete volume × kg-per-m³ for the member type (footings ~75, slabs ~100, beams ~130, columns ~160 kg/m³). Rates are typical; exact steel comes from the bar bending schedule.',
 faq:[{q:'How much steel is required per m³ of concrete?',a:'Roughly 75 kg/m³ for footings, 100 for slabs, 130 for beams and 160 for columns.'},
   {q:'How do I convert to tonnes?',a:'Divide the steel weight in kg by 1,000.'},
   {q:'Is this exact?',a:'No — it is a thumb-rule estimate; the bar bending schedule from structural drawings gives exact quantities.'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){const vol=+v.vol||0,kg=+v.member||100,r=+v.rate||65,w=vol*kg;
 const rows=[['Concrete volume','',vol+' m³'],['Steel weight','@ '+kg+' kg/m³',Math.round(w).toLocaleString('en-IN')+' kg'],['In tonnes','',(Math.round(w/100)/10)+' t'],['Steel cost','@ ₹'+r+'/kg',inr(w*r)]];
 return{rows,k1:Math.round(w).toLocaleString('en-IN')+' kg',k2:(Math.round(w/100)/10)+' t',k3:inr(w*r)};}`});

push({id:'brick-calculator',name:'Brick Calculator',
 short:'Number of bricks, cement and sand for a wall.',
 intro:'Calculate the number of bricks plus cement and sand for mortar, from wall area and wall thickness (4.5-inch or 9-inch).',
 seo:{title:'Brick Calculator — Bricks, Cement & Sand for a Wall | Varada Nexus',description:'Free brick calculator. Find the number of bricks and mortar (cement, sand) for a wall by area and thickness.',keywords:['brick calculator','how many bricks for a wall','brick masonry calculator']},
 inputs:[{id:'area',label:'Wall area (sq ft)',type:'number',default:1000,min:0},{id:'thick',label:'Wall thickness',type:'select',default:'9',options:[{v:'4.5',t:'4.5 inch (half brick)'},{v:'9',t:'9 inch (full brick)'}]}],
 results:{rowFmt:'raw',columns:['Material','','Quantity'],kpis:[{key:'k1',label:'Bricks',format:'text'},{key:'k2',label:'Cement',format:'text'},{key:'k3',label:'Sand',format:'text'}]},
 assumptions:'Bricks per sq ft ≈ 5 for a 4.5-inch wall and ≈ 10 for a 9-inch wall (standard modular brick with mortar). Mortar ≈ 0.02 bag cement and 0.6 cft sand per sq ft for a 9-inch wall (half for 4.5-inch).',
 faq:[{q:'How many bricks per square foot?',a:'About 5 bricks/sq ft for a 4.5-inch (half-brick) wall and about 10/sq ft for a 9-inch (full-brick) wall.'},
   {q:'How much mortar is needed?',a:'Mortar is roughly 20–25% of the wall volume; this tool estimates the cement and sand for it.'},
   {q:'Should I add wastage?',a:'Yes, add about 5% for breakage and cutting.'}],
 logic:`export function compute(v){const a=+v.area||0,th=+v.thick||9,f=th===9?1:0.5,bricks=a*10*f,cem=a*0.02*f,sand=a*0.6*f;
 const rows=[['Bricks','',Math.round(bricks).toLocaleString('en-IN')+' nos'],['Cement (mortar)','',Math.ceil(cem)+' bags'],['Sand (mortar)','',Math.round(sand)+' cft']];
 return{rows,k1:Math.round(bricks).toLocaleString('en-IN')+' nos',k2:Math.ceil(cem)+' bags',k3:Math.round(sand)+' cft'};}`});

push({id:'sand-calculator',name:'Sand Calculator',
 short:'Sand quantity for concrete by volume and grade.',
 intro:'Calculate the sand (fine aggregate) required for a concrete volume at a chosen grade, in cubic feet and cubic metres, with cement and aggregate shown too.',
 seo:{title:'Sand Calculator — Sand for Concrete by Volume & Grade | Varada Nexus',description:'Free sand calculator for concrete. Get sand quantity in cft and m³ for any concrete volume at M15, M20 or M25.',keywords:['sand calculator','sand for concrete','fine aggregate calculator']},
 inputs:[{id:'vol',label:'Concrete volume (m³)',type:'number',default:10,min:0},{id:'grade',label:'Concrete grade',type:'select',default:'1-1.5-3',options:GRADES}],
 results:{rowFmt:'raw',columns:['Material','','Quantity'],kpis:[{key:'k1',label:'Sand',format:'text'},{key:'k2',label:'Sand (m³)',format:'text'},{key:'k3',label:'Cement',format:'text'}]},
 assumptions:'Dry volume = 1.54 × wet. Sand = dry × (sand ÷ total ratio). 1 m³ = 35.315 cft. Cement and aggregate follow their ratios.',
 faq:[{q:'How much sand per m³ of concrete?',a:'About 0.42 m³ (≈15 cft) of sand per m³ of M20 concrete (1:1.5:3).'},
   {q:'Why multiply by 1.54?',a:'It converts wet concrete volume to the dry material volume required before mixing.'},
   {q:'Cft or m³?',a:'Sand is often sold in cft in India; this tool shows both.'}],
 logic:`export function compute(v){const vol=+v.vol||0,[c,s,a]=(v.grade||'1-1.5-3').split('-').map(Number),tot=c+s+a,dry=vol*1.54;
 const sandM=dry*(s/tot),sand=sandM*35.315,bags=dry*(c/tot)*1440/50;
 const rows=[['Sand','',Math.round(sand)+' cft'],['Sand (m³)','',(Math.round(sandM*100)/100)+' m³'],['Cement','',Math.ceil(bags)+' bags']];
 return{rows,k1:Math.round(sand)+' cft',k2:(Math.round(sandM*100)/100)+' m³',k3:Math.ceil(bags)+' bags'};}`});

push({id:'aggregate-calculator',name:'Aggregate Calculator',
 short:'Coarse aggregate for concrete by volume and grade.',
 intro:'Calculate the coarse aggregate required for a concrete volume at a chosen grade, in cubic feet and cubic metres.',
 seo:{title:'Aggregate Calculator — Coarse Aggregate for Concrete | Varada Nexus',description:'Free aggregate calculator for concrete. Get coarse aggregate in cft and m³ for any concrete volume and grade.',keywords:['aggregate calculator','coarse aggregate for concrete','jelly calculator concrete']},
 inputs:[{id:'vol',label:'Concrete volume (m³)',type:'number',default:10,min:0},{id:'grade',label:'Concrete grade',type:'select',default:'1-1.5-3',options:GRADES}],
 results:{rowFmt:'raw',columns:['Material','','Quantity'],kpis:[{key:'k1',label:'Aggregate',format:'text'},{key:'k2',label:'Aggregate (m³)',format:'text'},{key:'k3',label:'Cement',format:'text'}]},
 assumptions:'Dry volume = 1.54 × wet. Aggregate = dry × (aggregate ÷ total ratio). 1 m³ = 35.315 cft.',
 faq:[{q:'How much aggregate per m³ of concrete?',a:'About 0.84 m³ (≈30 cft) of coarse aggregate per m³ of M20 concrete (1:1.5:3).'},
   {q:'What size aggregate is used?',a:'20 mm is common for general RCC; 10 mm for thin or congested sections.'},
   {q:'Does this include wastage?',a:'No — add roughly 3–5% for site wastage.'}],
 logic:`export function compute(v){const vol=+v.vol||0,[c,s,a]=(v.grade||'1-1.5-3').split('-').map(Number),tot=c+s+a,dry=vol*1.54;
 const aggM=dry*(a/tot),agg=aggM*35.315,bags=dry*(c/tot)*1440/50;
 const rows=[['Aggregate','',Math.round(agg)+' cft'],['Aggregate (m³)','',(Math.round(aggM*100)/100)+' m³'],['Cement','',Math.ceil(bags)+' bags']];
 return{rows,k1:Math.round(agg)+' cft',k2:(Math.round(aggM*100)/100)+' m³',k3:Math.ceil(bags)+' bags'};}`});

push({id:'flooring-cost-calculator',name:'Flooring Cost Calculator',
 short:'Flooring material + labour cost by area.',
 intro:'Estimate flooring cost from area, material rate and laying labour — for tiles, granite, marble or vitrified flooring.',
 seo:{title:'Flooring Cost Calculator — Tiles, Granite & Marble by Area | Varada Nexus',description:'Free flooring cost calculator. Estimate material and labour cost for tile, granite, marble or vitrified flooring by area.',keywords:['flooring cost calculator','tile flooring cost','granite flooring cost']},
 inputs:[{id:'area',label:'Floor area (sq ft)',type:'number',default:1000,min:0},{id:'material',label:'Material rate (₹/sq ft)',type:'number',default:80,min:0},{id:'labour',label:'Laying labour (₹/sq ft)',type:'number',default:35,min:0},{id:'wastage',label:'Wastage (%)',type:'number',default:8,min:0}],
 results:{rowFmt:'raw',columns:['Component','','Amount'],kpis:[{key:'k1',label:'Total cost',format:'text'},{key:'k2',label:'Cost per sq ft',format:'text'},{key:'k3',label:'Material cost',format:'text'}]},
 assumptions:'Material cost = area × (1 + wastage%) × material rate. Labour = area × labour rate. Excludes skirting, adhesive and levelling unless included in the rates.',
 faq:[{q:'How is flooring cost calculated?',a:'Flooring cost = area × material rate (plus wastage) + area × laying labour rate.'},
   {q:'How much wastage should I allow for tiles?',a:'About 5–10%, more for diagonal patterns or rooms with many cuts.'},
   {q:'Are adhesive and skirting included?',a:'Only if built into your rates; otherwise budget them separately.'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){const a=+v.area||0,m=+v.material||0,l=+v.labour||0,w=+v.wastage||0;const mat=a*(1+w/100)*m,lab=a*l,tot=mat+lab;
 const rows=[['Material','incl. '+w+'% wastage',inr(mat)],['Labour','@ ₹'+l+'/sqft',inr(lab)],['Total','',inr(tot)]];
 return{rows,k1:inr(tot),k2:inr(tot/(a||1)),k3:inr(mat)};}`});

push({id:'electrical-load-calculator',name:'Electrical Load Calculator',
 short:'Connected load, demand and transformer sizing by area.',
 intro:'Estimate the connected electrical load, maximum demand and recommended transformer/DG size for a building from area and load density.',
 seo:{title:'Electrical Load Calculator — Connected Load & Transformer Sizing | Varada Nexus',description:'Free electrical load calculator. Estimate connected load, demand (kVA) and transformer size from building area and load density.',keywords:['electrical load calculator','connected load calculator','transformer sizing calculator']},
 inputs:[{id:'area',label:'Built-up area (sq ft)',type:'number',default:50000,min:0},{id:'va',label:'Load density (VA/sq ft)',type:'select',default:'5',options:[{v:'2',t:'Residential (2 VA)'},{v:'3',t:'Office (3 VA)'},{v:'5',t:'Hospital (5 VA)'},{v:'6',t:'Lab/ICU heavy (6 VA)'}]},{id:'div',label:'Diversity factor (%)',type:'number',default:70,min:1,max:100},{id:'pf',label:'Power factor',type:'number',default:0.9,min:0.1,max:1}],
 results:{rowFmt:'raw',columns:['Metric','','Value'],kpis:[{key:'k1',label:'Maximum demand',format:'text'},{key:'k2',label:'Connected load',format:'text'},{key:'k3',label:'Suggested transformer',format:'text'}]},
 assumptions:'Connected load (kVA) = area × VA/sq ft ÷ 1000. Maximum demand = connected × diversity%. Transformer is the next standard size above demand ÷ 0.8 loading. Detailed load schedules override these thumb rules.',
 faq:[{q:'What is load density for a hospital?',a:'Hospitals typically design around 4–6 VA per sq ft, higher than offices (~3) due to HVAC, imaging and 24×7 loads.'},
   {q:'What is diversity factor?',a:'Not all loads run at once; the diversity factor (often 60–80%) reduces connected load to a realistic maximum demand.'},
   {q:'How do I size the transformer?',a:'Size for maximum demand at ~80% loading, then pick the next standard rating; add DG backup for essential loads.'}],
 logic:`const STD=[100,160,250,315,400,500,630,800,1000,1250,1600,2000,2500];
export function compute(v){const a=+v.area||0,va=+v.va||5,d=+v.div||70,connected=a*va/1000,demand=connected*d/100,need=demand/0.8;
 const tr=STD.find(s=>s>=need)||Math.ceil(need);
 const rows=[['Connected load','@ '+va+' VA/sqft',(Math.round(connected))+' kVA'],['Maximum demand','@ '+d+'% diversity',(Math.round(demand))+' kVA'],['Suggested transformer','80% loading',tr+' kVA']];
 return{rows,k1:Math.round(demand)+' kVA',k2:Math.round(connected)+' kVA',k3:tr+' kVA'};}`});

const n=writeTools(T); console.log('construction part-1 seeded '+n+' tools');
