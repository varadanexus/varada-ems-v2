import { writeTools, CHECKLIST_LOGIC, CHECKLIST_RESULTS, D } from './_seedlib.mjs';
const REL=[{label:'Mining & Minerals Services',url:'/mining.html'},{label:'Contact Us',url:'/contact.html'}];
const T=[];
const push=o=>{o.cat='mining-minerals';o.related=o.related||REL;T.push(o);};

const inr=`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');`;

/* 1. Royalty Cost Calculator */
push({id:'mining-royalty-calculator',name:'Mining Royalty Calculator',
 short:'Calculate mineral royalty payable to state government on production',
 intro:'Compute the royalty liability on mineral extraction based on production quantity, grade and the applicable ad valorem or specific rate notified by the state government.',
 seo:{title:'Mining Royalty Calculator India – Mineral Royalty Rate Estimator',description:'Calculate mining royalty payable to state government. Supports ad valorem and specific rate royalties for coal, iron ore, bauxite and other minerals in India.',keywords:['mining royalty calculator India','mineral royalty rate','MMDR royalty','ad valorem royalty mining','state royalty mineral extraction']},
 inputs:[
  {id:'mineral',label:'Mineral',type:'select',default:'iron_ore',options:[{v:'iron_ore',t:'Iron Ore (15% ad valorem)'},{v:'coal',t:'Coal (₹400/tonne specific)'},{v:'bauxite',t:'Bauxite (0.5% ad valorem)'},{v:'limestone',t:'Limestone (80 paise/tonne)'},{v:'sand',t:'Sand & Gravel (2% ad valorem)'},{v:'custom',t:'Custom Rate'}]},
  {id:'quantity_mt',label:'Production Quantity (metric tonnes)',type:'number',default:10000,min:1},
  {id:'sale_value_per_mt',label:'Sale Value per MT (₹)',type:'number',default:3500,min:0,hint:'For ad valorem minerals'},
  {id:'custom_rate',label:'Custom Royalty Rate (₹/MT or %)',type:'number',default:0,min:0,hint:'If Custom Rate selected above'},
  {id:'custom_type',label:'Custom Rate Type',type:'select',default:'advalorem',options:[{v:'advalorem',t:'Ad Valorem (% of value)'},{v:'specific',t:'Specific Rate (₹ per tonne)'}]},
  {id:'dmc_rate',label:'DMF / NMET Contribution (%)',type:'number',default:30,min:0,max:50,hint:'District Mineral Foundation: 30% of royalty for major, 10% for minor minerals'}],
 results:{rowFmt:'raw',columns:['Levy','Rate / Basis','Amount (₹)'],kpis:[{key:'k1',label:'Royalty Payable',format:'text'},{key:'k2',label:'DMF Contribution',format:'text'},{key:'k3',label:'Total Mineral Tax',format:'text'}]},
 assumptions:'Rates per MMDR Act 2015 (indicative — verify current schedule). NMET 2% of royalty for major minerals included in DMF calc.',
 faq:[
  {q:'Who levies mineral royalty in India?',a:'Under the Mines and Minerals (Development and Regulation) Act 1957, royalty is levied by the State Government and the rate schedule is notified by the Central Government. The holder of mining lease pays royalty.'},
  {q:'What is the District Mineral Foundation (DMF)?',a:'DMF is a statutory trust set up in mining districts to benefit communities affected by mining. For leases executed after 12 Jan 2015, royalty holders pay 30% (major minerals) or 10% (minor) of royalty to DMF.'},
  {q:'What is the difference between royalty and premium?',a:'Royalty is the statutory levy on each tonne of mineral extracted. Premium is the additional amount paid by auction winners over the floor price in competitive bidding for mining leases.'}],
 logic:`${inr}
const RATES={
  iron_ore:{type:'advalorem',rate:15},
  coal:{type:'specific',rate:400},
  bauxite:{type:'advalorem',rate:0.5},
  limestone:{type:'specific',rate:0.80},
  sand:{type:'advalorem',rate:2}};
export function compute(v){
  const mineral=v.mineral||'iron_ore',qty=+v.quantity_mt||10000;
  const saleVal=+v.sale_value_per_mt||3500,dmcR=+v.dmc_rate||30;
  let royaltyPerMT,rateLabel;
  if(mineral==='custom'){
    const cr=+v.custom_rate||0;
    if(v.custom_type==='specific'){royaltyPerMT=cr;rateLabel='₹'+cr+'/MT';}
    else{royaltyPerMT=saleVal*cr/100;rateLabel=cr+'% of ₹'+saleVal;}
  } else {
    const r=RATES[mineral];
    if(r.type==='specific'){royaltyPerMT=r.rate;rateLabel='₹'+r.rate+'/MT';}
    else{royaltyPerMT=saleVal*r.rate/100;rateLabel=r.rate+'% of ₹'+saleVal;}
  }
  const royalty=Math.round(qty*royaltyPerMT);
  const dmc=Math.round(royalty*dmcR/100);
  const nmet=Math.round(royalty*0.02);
  const total=royalty+dmc+nmet;
  return{
    rows:[
      ['Production',qty.toLocaleString('en-IN')+' MT',''],
      ['Royalty',rateLabel+' × '+qty.toLocaleString('en-IN')+' MT',inr(royalty)],
      ['DMF Contribution',dmcR+'% of royalty',inr(dmc)],
      ['NMET','2% of royalty',inr(nmet)],
      ['Total Mineral Levy','',inr(total)]],
    k1:inr(royalty),k2:inr(dmc),k3:inr(total)};
}`});

/* 2. Mine Operating Cost Calculator */
push({id:'mine-operating-cost-calculator',name:'Mine Operating Cost Calculator',
 short:'Estimate cost per tonne of mineral production',
 intro:'Calculate the total operating cost per metric tonne of mineral production by aggregating drilling, blasting, loading, hauling, processing and overhead costs.',
 seo:{title:'Mine Operating Cost Calculator – Cost Per Tonne Mining India',description:'Calculate mining operating cost per tonne. Covers drilling, blasting, loading, hauling, processing and overheads for open-cast and underground mines.',keywords:['mine operating cost calculator','cost per tonne mining India','mining OPEX calculator','open cast mining cost','underground mine cost calculator']},
 inputs:[
  {id:'production_mt',label:'Monthly Production (MT)',type:'number',default:50000,min:1},
  {id:'drilling_blasting',label:'Drilling & Blasting Cost (₹/MT)',type:'number',default:120,min:0},
  {id:'loading_excavation',label:'Loading & Excavation (₹/MT)',type:'number',default:80,min:0},
  {id:'hauling_transport',label:'Hauling & Internal Transport (₹/MT)',type:'number',default:150,min:0},
  {id:'crushing_processing',label:'Crushing & Processing (₹/MT)',type:'number',default:90,min:0},
  {id:'overburden_removal',label:'Overburden Removal (₹/MT ore)',type:'number',default:60,min:0},
  {id:'labour_cost',label:'Labour Cost (₹/MT)',type:'number',default:100,min:0},
  {id:'overhead_monthly',label:'Monthly Fixed Overheads (₹)',type:'number',default:2000000,min:0}],
 results:{rowFmt:'raw',columns:['Cost Component','₹/MT','Monthly Total (₹)'],kpis:[{key:'k1',label:'Total Cost / MT',format:'text'},{key:'k2',label:'Monthly OPEX',format:'text'},{key:'k3',label:'Fixed Cost / MT',format:'text'}]},
 assumptions:'Fixed overheads divided equally across production tonnes. All variable costs in ₹/MT.',
 faq:[
  {q:'What is a typical cost per tonne for iron ore mining in India?',a:'Open-cast iron ore mining in India typically costs ₹500–₹900/MT all-in including royalty. High strip ratio sites or underground operations can cost ₹1,200–₹2,000/MT.'},
  {q:'What is the strip ratio and how does it affect cost?',a:'Strip ratio is the volume of overburden removed per tonne of ore. A ratio of 3:1 means 3 cubic metres of rock removed per tonne of ore. Higher strip ratios significantly increase hauling and overburden costs.'},
  {q:'How do I reduce mining operating cost?',a:'Optimise blast design to reduce secondary breaking, use larger capacity equipment (lower unit cost), improve utilisation rates, reduce downtime through predictive maintenance, and negotiate bulk fuel supply contracts.'}],
 logic:`${inr}
export function compute(v){
  const prod=+v.production_mt||50000;
  const db=+v.drilling_blasting||120,le=+v.loading_excavation||80;
  const ht=+v.hauling_transport||150,cp=+v.crushing_processing||90;
  const ob=+v.overburden_removal||60,lab=+v.labour_cost||100;
  const fixedOH=+v.overhead_monthly||2000000;
  const varPerMT=db+le+ht+cp+ob+lab;
  const fixedPerMT=Math.round(fixedOH/prod);
  const totalPerMT=varPerMT+fixedPerMT;
  const totalMonthly=Math.round(totalPerMT*prod);
  const rows=[
    ['Drilling & Blasting',db,inr(db*prod)],
    ['Loading & Excavation',le,inr(le*prod)],
    ['Hauling & Transport',ht,inr(ht*prod)],
    ['Crushing & Processing',cp,inr(cp*prod)],
    ['Overburden Removal',ob,inr(ob*prod)],
    ['Labour',lab,inr(lab*prod)],
    ['Fixed Overheads',fixedPerMT,inr(fixedOH)],
    ['Total',totalPerMT,inr(totalMonthly)]];
  return{rows:rows.map(r=>[r[0],inr(r[1])+'/MT',r[2]]),
    k1:inr(totalPerMT)+'/MT',k2:inr(totalMonthly),k3:inr(fixedPerMT)+'/MT'};
}`});

/* 3. Mineral Valuation Calculator */
push({id:'mineral-valuation-calculator',name:'Mineral Grade & Valuation Calculator',
 short:'Calculate mineral value based on grade, recovery and market price',
 intro:'Estimate the in-situ and realizable value of a mineral deposit based on resource tonnage, head grade, metallurgical recovery and current commodity price.',
 seo:{title:'Mineral Valuation Calculator – Grade Recovery Value India',description:'Calculate mineral deposit value from resource tonnage, head grade, recovery factor and commodity price. For iron ore, coal, bauxite and other minerals.',keywords:['mineral valuation calculator','ore grade recovery calculator','mining deposit value India','in-situ mineral value','metallurgical recovery calculator']},
 inputs:[
  {id:'resource_mt',label:'Total Resource / Reserve (MT)',type:'number',default:1000000,min:1,hint:'Geological resource estimate in metric tonnes'},
  {id:'head_grade',label:'Head Grade (%)',type:'number',default:58,min:0.01,max:100,hint:'Metal / mineral content of the ore'},
  {id:'recovery_pct',label:'Metallurgical Recovery (%)',type:'number',default:85,min:1,max:100,hint:'% of mineral recovered after processing'},
  {id:'commodity_price',label:'Commodity Price (₹/MT of product)',type:'number',default:4500,min:0,hint:'Market price of finished mineral'},
  {id:'mining_cost_per_mt',label:'All-In Mining Cost (₹/MT ore)',type:'number',default:700,min:0},
  {id:'processing_cost_per_mt',label:'Processing Cost (₹/MT ore)',type:'number',default:200,min:0}],
 results:{rowFmt:'raw',columns:['Metric','Calculation','Value'],kpis:[{key:'k1',label:'Gross In-Situ Value',format:'text'},{key:'k2',label:'Net Realisable Value',format:'text'},{key:'k3',label:'Value per MT Ore',format:'text'}]},
 assumptions:'Product tonnes = resource × head grade% × recovery%. Net value = gross − total cost. Royalty not included.',
 faq:[
  {q:'What is the difference between resource and reserve?',a:'Mineral Resource is the total estimated mineral in-ground (Inferred/Indicated/Measured). Mineral Reserve is the economic part (Probable/Proven) — planned to be mined. Reserve ≤ Resource always.'},
  {q:'What is metallurgical recovery?',a:'Recovery is the % of metal/mineral in the ore that ends up in the final product after processing. Loss occurs due to fines, tailings and process inefficiencies. Iron ore typically 78–92%, coal 85–95%.'},
  {q:'What is head grade and why does it matter?',a:'Head grade is the concentration of valuable mineral in the ore fed to the processing plant. Higher grade = less ore to mine per tonne of product = lower cost. Grade significantly drives project economics.'}],
 logic:`${inr}
export function compute(v){
  const res=+v.resource_mt||1000000,grade=+v.head_grade||58,rec=+v.recovery_pct||85;
  const price=+v.commodity_price||4500,minCost=+v.mining_cost_per_mt||700,procCost=+v.processing_cost_per_mt||200;
  const productMT=Math.round(res*grade/100*rec/100);
  const grossValue=Math.round(productMT*price);
  const totalCost=Math.round(res*(minCost+procCost));
  const netValue=grossValue-totalCost;
  const perMTOre=Math.round(netValue/res);
  return{
    rows:[
      ['Resource / Reserve',res.toLocaleString('en-IN')+' MT ore',''],
      ['Head Grade',grade+'%',''],
      ['Metallurgical Recovery',rec+'%',''],
      ['Product Output',productMT.toLocaleString('en-IN')+' MT',''],
      ['Gross Revenue',productMT.toLocaleString('en-IN')+' × ₹'+price,inr(grossValue)],
      ['Total Mining + Processing Cost',inr(minCost+procCost)+'/MT ore',inr(totalCost)],
      ['Net Realisable Value','',inr(netValue)]],
    k1:inr(grossValue),k2:inr(netValue),k3:inr(perMTOre)+'/MT ore'};
}`});

/* 4. Overburden Removal Cost Calculator */
push({id:'overburden-removal-cost-calculator',name:'Overburden Removal Cost Calculator',
 short:'Calculate overburden stripping cost for open-cast mining',
 intro:'Estimate the total cost of removing overburden (waste rock and soil) to access ore in open-cast mines, using the strip ratio and excavation unit rates.',
 seo:{title:'Overburden Removal Cost Calculator – Strip Ratio Mining India',description:'Calculate overburden stripping cost for open cast mines. Uses strip ratio and unit excavation rates to estimate total OB removal and ore extraction cost.',keywords:['overburden removal calculator','strip ratio calculator mining','OB removal cost India','open cast mine stripping cost','waste rock removal mining']},
 inputs:[
  {id:'ore_production_mt',label:'Ore Production (MT/month)',type:'number',default:50000,min:1},
  {id:'strip_ratio',label:'Strip Ratio (BCM per MT ore)',type:'number',default:3,min:0,hint:'Bank cubic metres of waste per metric tonne of ore'},
  {id:'ob_excavation_cost',label:'OB Excavation Cost (₹/BCM)',type:'number',default:120,min:0},
  {id:'ob_transport_cost',label:'OB Transport / Dumping (₹/BCM)',type:'number',default:80,min:0},
  {id:'ore_excavation_cost',label:'Ore Excavation & Loading (₹/MT)',type:'number',default:180,min:0},
  {id:'drill_blast_cost',label:'Drill & Blast Cost (₹/BCM incl ore)',type:'number',default:60,min:0}],
 results:{rowFmt:'raw',columns:['Component','Rate','Monthly Cost (₹)'],kpis:[{key:'k1',label:'Total Stripping Cost / MT ore',format:'text'},{key:'k2',label:'OB Volume / Month',format:'text'},{key:'k3',label:'Total Mining Cost / Month',format:'text'}]},
 assumptions:'OB volume = ore production × strip ratio. All costs in ₹/BCM for waste and ₹/MT for ore.',
 faq:[
  {q:'What is BCM and how is it different from MT?',a:'BCM (Bank Cubic Metre) is volume of rock in its natural (undisturbed) state. When blasted, rock swells 20–30% (Loose Cubic Metres). For cost purposes, BCM is used for design; after blasting use LCM.'},
  {q:'What is a stripping ratio and how does it affect mine economics?',a:'Strip ratio = tonnes of waste / tonne of ore. A SR of 5:1 means you must remove 5 BCM of waste for every tonne of ore. High SR increases cost and is the primary reason mines become uneconomic.'},
  {q:'When does a mine become economically unviable?',a:'When the cost of stripping + ore mining exceeds the net realisable value of the ore. Cut-off strip ratio = (ore value − ore processing cost) / OB removal cost per BCM.'}],
 logic:`${inr}
export function compute(v){
  const ore=+v.ore_production_mt||50000,sr=+v.strip_ratio||3;
  const obEx=+v.ob_excavation_cost||120,obTr=+v.ob_transport_cost||80;
  const oreEx=+v.ore_excavation_cost||180,db=+v.drill_blast_cost||60;
  const obVol=Math.round(ore*sr);
  const obCost=Math.round(obVol*(obEx+obTr));
  const oreCost=Math.round(ore*(oreEx));
  const dbCost=Math.round((obVol+ore)*db);
  const totalMonthly=obCost+oreCost+dbCost;
  const perMTOre=Math.round(totalMonthly/ore);
  return{
    rows:[
      ['OB Volume',sr+' BCM/MT × '+ore.toLocaleString('en-IN')+' MT',obVol.toLocaleString('en-IN')+' BCM'],
      ['OB Excavation',inr(obEx)+'/BCM',inr(Math.round(obVol*obEx))],
      ['OB Transport & Dumping',inr(obTr)+'/BCM',inr(Math.round(obVol*obTr))],
      ['Ore Excavation & Loading',inr(oreEx)+'/MT',inr(oreCost)],
      ['Drill & Blast (OB + Ore)',inr(db)+'/BCM',inr(dbCost)],
      ['Total Monthly Mining Cost','',inr(totalMonthly)]],
    k1:inr(perMTOre)+'/MT ore',k2:obVol.toLocaleString('en-IN')+' BCM',k3:inr(totalMonthly)};
}`});

/* 5. Mine Revenue Estimator */
push({id:'mine-revenue-estimator',name:'Mine Revenue Estimator',
 short:'Project monthly and annual revenue from mineral production',
 intro:'Forecast mining revenue by combining production volume, product grade, recovery rate and prevailing sale price — including price sensitivity analysis.',
 seo:{title:'Mine Revenue Estimator – Mining Revenue Forecast India',description:'Estimate monthly and annual mining revenue from production tonnage, grade and sale price. Includes price sensitivity and royalty deduction for Indian mines.',keywords:['mine revenue calculator India','mining revenue forecast','mineral production revenue','iron ore revenue estimator','mine income calculator India']},
 inputs:[
  {id:'monthly_production',label:'Monthly Ore Production (MT)',type:'number',default:50000,min:1},
  {id:'product_grade',label:'Product Grade / Quality (%)',type:'number',default:62,min:0.01,max:100,hint:'Fe% for iron ore, ash% for coal, etc.'},
  {id:'sale_price',label:'Sale Price (₹/MT product)',type:'number',default:4800,min:0},
  {id:'recovery_pct',label:'Processing Recovery (%)',type:'number',default:88,min:1,max:100},
  {id:'royalty_pct',label:'Royalty Rate (% of sale value)',type:'number',default:15,min:0,max:50},
  {id:'dmc_pct',label:'DMF/NMET (% of royalty)',type:'number',default:32,min:0,max:50}],
 results:{rowFmt:'raw',columns:['Revenue Item','Calculation','Amount (₹)'],kpis:[{key:'k1',label:'Gross Monthly Revenue',format:'text'},{key:'k2',label:'Net Revenue (after levies)',format:'text'},{key:'k3',label:'Annual Net Revenue',format:'text'}]},
 assumptions:'Product tonnes = ore × recovery%. Net revenue after royalty and DMF/NMET. No transport cost deducted.',
 faq:[
  {q:'What determines iron ore sale price in India?',a:'Iron ore price is benchmark against NMDC\'s published rates, Platts 62% Fe CFR China index, and local market demand. Fines and lumps attract different prices (lumps 15–20% premium).'},
  {q:'How often do mining companies settle royalty?',a:'Royalty is typically payable monthly or quarterly depending on state rules, within 30 days of dispatch or as specified in the mining lease conditions.'},
  {q:'What price assumptions should I use for revenue projections?',a:'Use conservative long-term average prices (5-year average) for bank submissions. For internal planning use spot price. Always model at ±20% price sensitivity.'}],
 logic:`${inr}
export function compute(v){
  const prod=+v.monthly_production||50000,grade=+v.product_grade||62,rec=+v.recovery_pct||88;
  const price=+v.sale_price||4800,royR=+v.royalty_pct||15,dmcR=+v.dmc_pct||32;
  const productMT=Math.round(prod*rec/100);
  const grossRev=Math.round(productMT*price);
  const royalty=Math.round(grossRev*royR/100);
  const dmc=Math.round(royalty*dmcR/100);
  const netRev=grossRev-royalty-dmc;
  const annualNet=netRev*12;
  return{
    rows:[
      ['Ore Production',prod.toLocaleString('en-IN')+' MT/month',''],
      ['Recovery',rec+'%',''],
      ['Product Output',productMT.toLocaleString('en-IN')+' MT @ ₹'+price+'/MT',''],
      ['Gross Revenue','',inr(grossRev)],
      ['Royalty',royR+'%','-'+inr(royalty)],
      ['DMF / NMET',dmcR+'% of royalty','-'+inr(dmc)],
      ['Net Revenue','',inr(netRev)]],
    k1:inr(grossRev),k2:inr(netRev),k3:inr(annualNet)};
}`});

/* 6. Ore Transport & Logistics Cost */
push({id:'ore-transport-logistics-cost',name:'Ore Transport & Logistics Cost Calculator',
 short:'Calculate cost of transporting ore from mine to plant or port',
 intro:'Estimate the end-to-end logistics cost of moving ore from the mine gate to the processing plant or export port — covering road, rail and port handling.',
 seo:{title:'Ore Transport Logistics Cost Calculator – Mining India',description:'Calculate ore transport cost from mine to plant or port. Road haulage, rail freight, port handling and stacking costs for mining operations in India.',keywords:['ore transport cost calculator','mining logistics cost India','mine to plant transport','ore freight rate India','mineral logistics calculator']},
 inputs:[
  {id:'production_mt',label:'Monthly Ore Volume (MT)',type:'number',default:50000,min:1},
  {id:'road_distance',label:'Road Haul Distance (km)',type:'number',default:50,min:0},
  {id:'road_rate_per_mt_km',label:'Road Rate (₹/MT/km)',type:'number',default:3.5,min:0},
  {id:'rail_freight_per_mt',label:'Rail Freight (₹/MT total)',type:'number',default:400,min:0,hint:'Enter 0 if no rail leg'},
  {id:'port_handling',label:'Port Handling / Stacking (₹/MT)',type:'number',default:120,min:0,hint:'For export consignments'},
  {id:'loading_charges',label:'Loading / Unloading Charges (₹/MT)',type:'number',default:80,min:0}],
 results:{rowFmt:'raw',columns:['Logistics Component','Rate','Monthly Cost (₹)'],kpis:[{key:'k1',label:'Total Logistics / MT',format:'text'},{key:'k2',label:'Monthly Logistics Cost',format:'text'},{key:'k3',label:'Logistics % of ₹4500/MT',format:'text'}]},
 assumptions:'Road cost = distance × rate × volume. All rates in ₹/MT unless noted. ₹4,500/MT benchmark for logistics % calculation.',
 faq:[
  {q:'What is the typical road freight rate for ore in India?',a:'Road freight for ore: ₹2.50–₹5/MT/km depending on truck size, road condition and region. Tipper trucks (10–15 MT) are common for short hauls; semi-trailers (25 MT) for longer distances.'},
  {q:'When is rail transport more economical for ore?',a:'Rail becomes economical beyond 150–200 km for bulk minerals. Dedicated rail sidings at mines (private/captive) can further reduce cost. CONCOR and zone railways offer special bulk mineral rates.'},
  {q:'What is a weighbridge and why is it important?',a:'A weighbridge (weigh-in-motion or static) at the mine gate ensures accurate billing and prevents overloading penalties. Trucks overloaded beyond permissible limits face heavy fines under Motor Vehicles Act.'}],
 logic:`${inr}
export function compute(v){
  const prod=+v.production_mt||50000,rd=+v.road_distance||50;
  const rrk=+v.road_rate_per_mt_km||3.5,rail=+v.rail_freight_per_mt||400;
  const port=+v.port_handling||120,load=+v.loading_charges||80;
  const roadPerMT=Math.round(rd*rrk);
  const totalPerMT=roadPerMT+rail+port+load;
  const totalMonthly=Math.round(totalPerMT*prod);
  const pct=Math.round(totalPerMT/4500*1000)/10;
  return{
    rows:[
      ['Road Haulage',rd+' km × ₹'+rrk+'/MT/km',inr(roadPerMT*prod)],
      ['Rail Freight',inr(rail)+'/MT',inr(rail*prod)],
      ['Port Handling / Stacking',inr(port)+'/MT',inr(port*prod)],
      ['Loading / Unloading',inr(load)+'/MT',inr(load*prod)],
      ['Total Logistics',inr(totalPerMT)+'/MT',inr(totalMonthly)]],
    k1:inr(totalPerMT)+'/MT',k2:inr(totalMonthly),k3:pct+'%'};
}`});

/* 7. Explosive Consumption Calculator */
push({id:'explosive-consumption-calculator',name:'Explosive Consumption Calculator',
 short:'Estimate explosive requirement and cost for mining blasts',
 intro:'Calculate the quantity of explosives and detonators required for a blast pattern in open-cast or underground mines, based on powder factor and rock volume.',
 seo:{title:'Explosive Consumption Calculator – Blasting Cost Mining India',description:'Calculate explosive consumption, detonator quantity and total blasting cost for mining operations. Based on powder factor and rock volume.',keywords:['explosive consumption calculator mining','blasting cost calculator India','powder factor mining','emulsion explosive cost','mine blast design calculator']},
 inputs:[
  {id:'rock_volume_bcm',label:'Rock Volume to Blast (BCM)',type:'number',default:50000,min:1},
  {id:'powder_factor',label:'Powder Factor (kg/BCM)',type:'number',default:0.35,min:0.05,max:5,hint:'Typical: 0.25–0.45 kg/BCM for open-cast'},
  {id:'explosive_cost',label:'Explosive Cost (₹/kg)',type:'number',default:55,min:0,hint:'Bulk emulsion: ₹45–₹65/kg'},
  {id:'detonator_per_hole',label:'Detonators per Hole',type:'number',default:2,min:1},
  {id:'holes_per_blast',label:'Number of Holes in Blast',type:'number',default:200,min:1},
  {id:'detonator_cost',label:'Detonator Cost (₹/unit)',type:'number',default:350,min:0},
  {id:'accessories_pct',label:'Blasting Accessories (% of explosive cost)',type:'number',default:15,min:0}],
 results:{rowFmt:'raw',columns:['Item','Quantity','Cost (₹)'],kpis:[{key:'k1',label:'Total Blast Cost',format:'text'},{key:'k2',label:'Cost per BCM',format:'text'},{key:'k3',label:'Explosive Quantity (kg)',format:'text'}]},
 assumptions:'Explosive quantity = rock volume × powder factor. Accessories include primers, boosters, detonating cord.',
 faq:[
  {q:'What is powder factor and how is it determined?',a:'Powder factor (specific charge) is kg of explosive per BCM of rock blasted. It depends on rock hardness (RMR), burden-spacing design, desired fragmentation size and explosive energy. Hard granite may need 0.5+ kg/BCM.'},
  {q:'What types of explosives are used in Indian mines?',a:'Bulk emulsion (most common in open-cast), ANFO, Slurry/Watergel for wet conditions, and cartridge emulsion for smaller operations. All must be sourced from licensed manufacturers and stored in licensed magazines.'},
  {q:'What licences are required for explosives in mining?',a:'Under Explosives Act 1884 and Explosives Rules 2008: Licence for manufacture, storage (magazine), transport and use. PESO (Petroleum and Explosives Safety Organisation) is the regulating authority.'}],
 logic:`${inr}
export function compute(v){
  const vol=+v.rock_volume_bcm||50000,pf=+v.powder_factor||0.35;
  const expCost=+v.explosive_cost||55,detPerHole=+v.detonator_per_hole||2;
  const holes=+v.holes_per_blast||200,detCost=+v.detonator_cost||350,accPct=+v.accessories_pct||15;
  const expKg=Math.round(vol*pf);
  const expCostTotal=Math.round(expKg*expCost);
  const detQty=holes*detPerHole;
  const detTotal=detQty*detCost;
  const accessories=Math.round(expCostTotal*accPct/100);
  const total=expCostTotal+detTotal+accessories;
  const perBCM=Math.round(total/vol*100)/100;
  return{
    rows:[
      ['Explosive Quantity',vol.toLocaleString('en-IN')+' BCM × '+pf+' kg/BCM',expKg.toLocaleString('en-IN')+' kg'],
      ['Explosive Cost',inr(expCost)+'/kg',inr(expCostTotal)],
      ['Detonators',detQty+' units × ₹'+detCost,inr(detTotal)],
      ['Accessories & Accessories',accPct+'%',inr(accessories)],
      ['Total Blast Cost','',inr(total)]],
    k1:inr(total),k2:inr(perBCM)+'/BCM',k3:expKg.toLocaleString('en-IN')+' kg'};
}`});

/* 8. Equipment Productivity Calculator */
push({id:'mining-equipment-productivity-calculator',name:'Mining Equipment Productivity Calculator',
 short:'Calculate shovel, dumper and drill productivity and utilisation',
 intro:'Measure the actual productivity and utilisation of key mining equipment — excavators, dump trucks and drills — to identify bottlenecks and improve fleet efficiency.',
 seo:{title:'Mining Equipment Productivity Calculator – Shovel Dumper India',description:'Calculate mining equipment productivity: excavator bucket cycles, dump truck payload and drill ROP. Measure utilisation and production per shift for Indian mines.',keywords:['mining equipment productivity','shovel productivity calculator','dump truck productivity','drill productivity mining','equipment utilisation mining India']},
 inputs:[
  {id:'equipment_type',label:'Equipment Type',type:'select',default:'excavator',options:[{v:'excavator',t:'Excavator / Shovel'},{v:'dumper',t:'Dump Truck / Dumper'},{v:'drill',t:'Rotary Drill Rig'}]},
  {id:'shift_hours',label:'Shift Duration (hours)',type:'number',default:8,min:1,max:12},
  {id:'availability_pct',label:'Mechanical Availability (%)',type:'number',default:80,min:10,max:100},
  {id:'utilisation_pct',label:'Operational Utilisation (%)',type:'number',default:75,min:10,max:100},
  {id:'cycle_time_min',label:'Cycle Time (minutes)',type:'number',default:3.5,min:0.5,hint:'For excavator: dig+swing+dump+return. Dumper: load+haul+dump+return.'},
  {id:'payload_or_bucket',label:'Payload / Bucket Capacity (MT or m³)',type:'number',default:10,min:0.1},
  {id:'fill_factor',label:'Fill Factor (%)',type:'number',default:90,min:50,max:110,hint:'Bucket fill efficiency vs rated capacity'}],
 results:{rowFmt:'raw',columns:['Parameter','Calculation','Value'],kpis:[{key:'k1',label:'Production per Shift',format:'text'},{key:'k2',label:'Effective Hours',format:'text'},{key:'k3',label:'Cycles per Shift',format:'text'}]},
 assumptions:'Effective hours = shift × availability% × utilisation%. Cycles = effective hours × 60 / cycle time. Production = cycles × payload × fill factor.',
 faq:[
  {q:'What is the difference between mechanical availability and utilisation?',a:'Mechanical Availability = % of time equipment is not under maintenance. Utilisation = % of available time actually worked. A machine at 85% MA and 80% utilisation works 68% of total shift time.'},
  {q:'What is a good OEE for mining equipment?',a:'Overall Equipment Effectiveness (MA × Utilisation × Performance) of 65–75% is considered good for mining. World class mines achieve 80%+ OEE through predictive maintenance and queue management.'},
  {q:'How do I improve dump truck cycle time?',a:'Reduce haul road grades, improve road surface quality (reduce rolling resistance), eliminate waiting time at loader, optimise truck spotting position, and use dispatch systems for truck allocation.'}],
 logic:`${inr}
export function compute(v){
  const et=v.equipment_type||'excavator',shift=+v.shift_hours||8;
  const avail=+v.availability_pct||80,util=+v.utilisation_pct||75;
  const cycle=+v.cycle_time_min||3.5,payload=+v.payload_or_bucket||10,ff=+v.fill_factor||90;
  const effHours=Math.round(shift*avail/100*util/100*100)/100;
  const cyclesPerShift=Math.round(effHours*60/cycle);
  const effectivePayload=payload*ff/100;
  const prodPerShift=Math.round(cyclesPerShift*effectivePayload);
  const oee=Math.round(avail*util/10000*1000)/10;
  const typeLabel={excavator:'Excavator',dumper:'Dump Truck',drill:'Drill Rig'};
  const unit=et==='drill'?'m drilled':'MT';
  return{
    rows:[
      ['Equipment',typeLabel[et]||et,''],
      ['Shift Hours',shift+' hrs',''],
      ['Mechanical Availability',avail+'%',''],
      ['Operational Utilisation',util+'%',''],
      ['Effective Working Hours',shift+' × '+avail+'% × '+util+'%',effHours+' hrs'],
      ['Cycle Time',cycle+' min',''],
      ['Cycles per Shift','',cyclesPerShift],
      ['Effective Payload',payload+' × '+ff+'%',effectivePayload.toFixed(1)+' MT'],
      ['OEE',avail+'% × '+util+'%',oee+'%'],
      ['Production per Shift','',prodPerShift+' '+unit]],
    k1:prodPerShift+' '+unit,k2:effHours+' hrs',k3:cyclesPerShift+' cycles'};
}`});

/* 9. Mine Closure Cost Estimator */
push({id:'mine-closure-cost-estimator',name:'Mine Closure Cost Estimator',
 short:'Estimate mine closure liability and rehabilitation bond requirement',
 intro:'Plan for mine closure costs including decommissioning, land rehabilitation, water treatment and progressive restoration to meet legal obligations and MMDR requirements.',
 seo:{title:'Mine Closure Cost Estimator – Mine Rehabilitation India MMDR',description:'Estimate mine closure and rehabilitation cost for Indian mines. Covers site decommissioning, topsoil replacement, water treatment and afforestation per MMDR Act.',keywords:['mine closure cost India','mine rehabilitation cost','MMDR mine closure plan','mine decommissioning cost','progressive mine restoration India']},
 inputs:[
  {id:'mine_area_ha',label:'Mine Lease Area (hectares)',type:'number',default:100,min:0.1},
  {id:'waste_dump_area',label:'Waste Dump / OB Area (hectares)',type:'number',default:30,min:0},
  {id:'water_treatment_years',label:'Water Treatment Period (years)',type:'number',default:5,min:0},
  {id:'water_treatment_cost_pa',label:'Annual Water Treatment Cost (₹)',type:'number',default:2000000,min:0},
  {id:'topsoil_cost_per_ha',label:'Topsoil Replacement (₹/ha)',type:'number',default:500000,min:0},
  {id:'afforestation_cost_per_ha',label:'Afforestation (₹/ha)',type:'number',default:300000,min:0},
  {id:'demolition_cost',label:'Structures & Equipment Demolition (₹)',type:'number',default:5000000,min:0},
  {id:'contingency_pct',label:'Contingency (%)',type:'number',default:20,min:0,max:50}],
 results:{rowFmt:'raw',columns:['Closure Cost Component','Area / Basis','Cost (₹)'],kpis:[{key:'k1',label:'Total Closure Cost',format:'text'},{key:'k2',label:'Annual Bank Guarantee Needed',format:'text'},{key:'k3',label:'Cost per Hectare',format:'text'}]},
 assumptions:'Bank Guarantee typically 1/5 of total closure cost under MMDR. Contingency on all direct closure costs.',
 faq:[
  {q:'What are legal requirements for mine closure in India?',a:'Under MMDR Act and Mineral Conservation & Development Rules, all mine holders must submit a Mine Closure Plan (MCP) before commencement and maintain a closure fund. Mandatory progressive restoration is required.'},
  {q:'What is a Mine Closure Plan (MCP)?',a:'MCP is a detailed document submitted to IBM and State Government outlining physical, chemical and biological rehabilitation of the mined area. It must be submitted with the Mining Plan and updated every 5 years.'},
  {q:'Can closure costs be reduced through progressive restoration?',a:'Yes. Progressive land rehabilitation during mining significantly reduces closure costs. Re-grading waste dumps, backfilling exhausted pits and early revegetation cut final costs by 40–60%.'}],
 logic:`${inr}
export function compute(v){
  const area=+v.mine_area_ha||100,dump=+v.waste_dump_area||30;
  const wtYrs=+v.water_treatment_years||5,wtPA=+v.water_treatment_cost_pa||2000000;
  const tsCost=+v.topsoil_cost_per_ha||500000,afCost=+v.afforestation_cost_per_ha||300000;
  const demo=+v.demolition_cost||5000000,contPct=+v.contingency_pct||20;
  const totalArea=area+dump;
  const waterTotal=Math.round(wtYrs*wtPA);
  const topsoil=Math.round(totalArea*tsCost);
  const afforestation=Math.round(totalArea*afCost);
  const directCosts=waterTotal+topsoil+afforestation+demo;
  const contingency=Math.round(directCosts*contPct/100);
  const total=directCosts+contingency;
  const annualBG=Math.round(total/5);
  const perHa=Math.round(total/area);
  return{
    rows:[
      ['Water Treatment',wtYrs+' years × '+inr(wtPA),inr(waterTotal)],
      ['Topsoil Replacement',totalArea+' ha × '+inr(tsCost),inr(topsoil)],
      ['Afforestation',totalArea+' ha × '+inr(afCost),inr(afforestation)],
      ['Demolition & Decommissioning','',inr(demo)],
      ['Contingency',contPct+'%',inr(contingency)],
      ['Total Closure Cost','',inr(total)]],
    k1:inr(total),k2:inr(annualBG)+'/year',k3:inr(perHa)+'/ha'};
}`});

/* 10. Mineral Export Value Calculator */
push({id:'mineral-export-value-calculator',name:'Mineral Export Value Calculator',
 short:'Calculate FOB and CIF value of mineral exports from India',
 intro:'Compute the export value of minerals including royalty-adjusted cost, freight, insurance and applicable export duty to arrive at FOB and CIF price for mineral exports.',
 seo:{title:'Mineral Export Value Calculator – Iron Ore Export India',description:'Calculate FOB and CIF value of mineral exports from India. Accounts for mining cost, royalty, transport to port, export duty and freight.',keywords:['mineral export value calculator','iron ore export price India','mineral FOB price calculator','export duty minerals India','mineral export profitability']},
 inputs:[
  {id:'production_cost_mt',label:'Mining Cost per MT (₹)',type:'number',default:700,min:0},
  {id:'royalty_mt',label:'Royalty & DMF per MT (₹)',type:'number',default:540,min:0,hint:'Royalty + DMF + NMET combined'},
  {id:'transport_to_port',label:'Transport to Port (₹/MT)',type:'number',default:350,min:0},
  {id:'port_handling',label:'Port Handling (₹/MT)',type:'number',default:120,min:0},
  {id:'export_duty_pct',label:'Export Duty (%)',type:'number',default:30,min:0,max:100,hint:'Iron ore: 30% (as of 2022); check current notification'},
  {id:'quantity_mt',label:'Export Quantity (MT)',type:'number',default:10000,min:1},
  {id:'freight_mt',label:'Sea Freight (₹/MT)',type:'number',default:800,min:0},
  {id:'insurance_pct',label:'Marine Insurance (% of FOB)',type:'number',default:0.5,min:0}],
 results:{rowFmt:'raw',columns:['Export Value Component','Per MT (₹)','Total (₹)'],kpis:[{key:'k1',label:'FOB Value / MT',format:'text'},{key:'k2',label:'Export Duty Payable',format:'text'},{key:'k3',label:'Net Margin / MT',format:'text'}]},
 assumptions:'Cost base = mining + royalty + transport + port. Export duty on FOB value. CIF = FOB + freight + insurance.',
 faq:[
  {q:'What export duty applies on iron ore from India?',a:'The Government of India raised export duty on iron ore to 30% (lump and fines) and 45% on iron ore pellets in May 2022. Always verify the current rate from CBIC Custom Tariff notifications.'},
  {q:'Can iron ore be exported freely from India?',a:'Iron ore export requires Customs clearance and Shipping Bill. High export duty discourages large-scale exports to protect domestic steel industry. Some low-grade fines may be less restricted.'},
  {q:'What is the role of MMTC in mineral exports?',a:'MMTC (Metals and Minerals Trading Corporation) is a government canalising agency for certain minerals. Some mineral exports must be routed through MMTC or other designated agencies.'}],
 logic:`${inr}
export function compute(v){
  const mc=+v.production_cost_mt||700,roy=+v.royalty_mt||540;
  const trans=+v.transport_to_port||350,port=+v.port_handling||120;
  const edR=+v.export_duty_pct||30,qty=+v.quantity_mt||10000;
  const freight=+v.freight_mt||800,insR=+v.insurance_pct||0.5;
  const costPerMT=mc+roy+trans+port;
  const totalCost=Math.round(costPerMT*qty);
  // FOB is typically the sale price; for margin calc we treat FOB as sale price
  // Here we derive the export duty on FOB assumed at a reasonable market value
  // We need the user's sale price - let's use a market price assumption or the FOB as given
  // Actually in this tool we calculate what the FOB "needs" to be for profitability
  // Let me recalculate: FOB is the contract price. Export duty is on FOB value.
  // We'll show cost buildup and let user see margin
  const fobPerMT=costPerMT; // this is breakeven fob pre-duty
  const exportDutyPerMT=Math.round(fobPerMT*edR/100);
  const fobWithDuty=fobPerMT+exportDutyPerMT;
  const cifPerMT=fobWithDuty+freight+Math.round(fobWithDuty*insR/100);
  const exportDutyTotal=exportDutyPerMT*qty;
  const marginPerMT=0; // at breakeven
  return{
    rows:[
      ['Mining Cost',inr(mc)+'/MT',inr(mc*qty)],
      ['Royalty & DMF',inr(roy)+'/MT',inr(roy*qty)],
      ['Transport to Port',inr(trans)+'/MT',inr(trans*qty)],
      ['Port Handling',inr(port)+'/MT',inr(port*qty)],
      ['Cost at Port (pre-duty)',inr(costPerMT)+'/MT',inr(totalCost)],
      ['Export Duty ('+edR+'% of FOB)',inr(exportDutyPerMT)+'/MT',inr(exportDutyTotal)],
      ['FOB (cost+duty)',inr(fobWithDuty)+'/MT',inr(fobWithDuty*qty)],
      ['CIF (FOB+freight+ins)',inr(cifPerMT)+'/MT',inr(cifPerMT*qty)]],
    k1:inr(fobWithDuty)+'/MT',k2:inr(exportDutyTotal),k3:inr(costPerMT)+'/MT (cost base)'};
}`});

/* 11. Environmental Compliance Cost Calculator */
push({id:'mining-environmental-compliance-cost',name:'Mining Environmental Compliance Cost Calculator',
 short:'Estimate environmental compliance costs for mining operations',
 intro:'Budget for environmental management obligations in mining — afforestation, water treatment, dust suppression, monitoring and statutory clearance fees.',
 seo:{title:'Mining Environmental Compliance Cost Calculator India',description:'Estimate environmental compliance costs for mines in India. Covers EMP, afforestation levy, dust suppression, effluent treatment and monitoring.',keywords:['mining environmental compliance cost','EMP cost mining India','forest diversion mining cost','afforestation levy mining','mine environment management']},
 inputs:[
  {id:'mine_area_ha',label:'Mining Lease Area (ha)',type:'number',default:100,min:0.1},
  {id:'forest_area_ha',label:'Forest Area Diverted (ha)',type:'number',default:20,min:0,hint:'For NPV and CA levy calculation'},
  {id:'npv_per_ha',label:'Net Present Value Levy (₹/ha)',type:'number',default:1000000,min:0,hint:'Payable to CAMPA for forest diversion'},
  {id:'ca_ratio',label:'Compensatory Afforestation Ratio',type:'number',default:2,min:1,max:5,hint:'Typically 1:2 (non-forest) or 1:1 degraded forest'},
  {id:'afforestation_cost_per_ha',label:'Afforestation Cost (₹/ha)',type:'number',default:300000,min:0},
  {id:'dust_suppression_monthly',label:'Dust Suppression (₹/month)',type:'number',default:100000,min:0},
  {id:'water_treatment_monthly',label:'Effluent/Mine Water Treatment (₹/month)',type:'number',default:150000,min:0},
  {id:'monitoring_annual',label:'Environmental Monitoring & Audit (₹/year)',type:'number',default:500000,min:0}],
 results:{rowFmt:'raw',columns:['Environmental Cost','Basis','Amount (₹)'],kpis:[{key:'k1',label:'One-Time Env. Costs',format:'text'},{key:'k2',label:'Annual Recurring Cost',format:'text'},{key:'k3',label:'Total 5-Year Env. Cost',format:'text'}]},
 assumptions:'NPV and CA are one-time at project start. Annual recurring = (dust + water) × 12 + monitoring. 5-year total = one-time + 5 × annual.',
 faq:[
  {q:'What is NPV levy for forest land diversion?',a:'NPV (Net Present Value) compensates for loss of ecosystem services when forest is diverted for mining. Rates range from ₹5 lakh to ₹10+ lakh per hectare based on forest density. Paid to CAMPA (Compensatory Afforestation Fund).'},
  {q:'What is Compensatory Afforestation?',a:'For every hectare of forest diverted for mining, 2 hectares of non-forest land must be afforested (or 1 ha degraded forest restored). The cost is borne by the user agency (mine operator).'},
  {q:'What environmental clearances are required for mining?',a:'Above 5 ha: Environmental Clearance from MoEFCC / SEIAA. Forest diversion > 5 ha: FC from MoEFCC. Mines near wildlife sanctuaries / national parks need additional clearances. CTE and CTO from State Pollution Control Board required.'}],
 logic:`${inr}
export function compute(v){
  const mArea=+v.mine_area_ha||100,fArea=+v.forest_area_ha||20;
  const npvPerHa=+v.npv_per_ha||1000000,caRatio=+v.ca_ratio||2;
  const afCost=+v.afforestation_cost_per_ha||300000;
  const dustM=+v.dust_suppression_monthly||100000;
  const wtM=+v.water_treatment_monthly||150000,monA=+v.monitoring_annual||500000;
  const npvTotal=Math.round(fArea*npvPerHa);
  const caArea=Math.round(fArea*caRatio);
  const caTotal=Math.round(caArea*afCost);
  const oneTime=npvTotal+caTotal;
  const annualRecurring=Math.round((dustM+wtM)*12+monA);
  const fiveYear=oneTime+annualRecurring*5;
  return{
    rows:[
      ['NPV Levy',fArea+' ha × '+inr(npvPerHa),inr(npvTotal)],
      ['Compensatory Afforestation',caArea+' ha × '+inr(afCost),inr(caTotal)],
      ['Dust Suppression',inr(dustM)+'/month × 12',inr(dustM*12)],
      ['Mine Water Treatment',inr(wtM)+'/month × 12',inr(wtM*12)],
      ['Env. Monitoring & Audit','Annual',inr(monA)],
      ['Annual Recurring Total','',inr(annualRecurring)],
      ['5-Year Total Cost','',inr(fiveYear)]],
    k1:inr(oneTime),k2:inr(annualRecurring),k3:inr(fiveYear)};
}`});

/* 12. Stockpile Inventory Calculator */
push({id:'stockpile-inventory-calculator',name:'Stockpile Inventory Calculator',
 short:'Estimate stockpile volume, tonnage and value at mine site',
 intro:'Calculate the estimated tonnage and value of mineral stockpiles using surveyed dimensions and bulk density — essential for inventory accounting and sales planning.',
 seo:{title:'Stockpile Inventory Calculator – Ore Stockpile Volume Tonnage India',description:'Calculate mineral stockpile volume, tonnage and value from pile dimensions. Supports conical and trapezoidal stockpile shapes for mining inventory.',keywords:['stockpile inventory calculator mining','ore stockpile tonnage calculator','mineral stockpile volume','bulk density stockpile','mine inventory valuation']},
 inputs:[
  {id:'stockpile_shape',label:'Stockpile Shape',type:'select',default:'cone',options:[{v:'cone',t:'Conical (round base)'},{v:'trap',t:'Trapezoidal / Ridge pile'}]},
  {id:'length',label:'Base Length (m)',type:'number',default:60,min:1,hint:'Long axis of trapezoidal pile'},
  {id:'width',label:'Base Width (m)',type:'number',default:40,min:1},
  {id:'height',label:'Height / Apex (m)',type:'number',default:8,min:0.5},
  {id:'bulk_density',label:'Bulk Density (MT/m³)',type:'number',default:2.0,min:0.5,hint:'Iron ore: 1.8–2.2; coal: 0.8–1.0; limestone: 1.4–1.6'},
  {id:'sale_price_mt',label:'Sale Price (₹/MT)',type:'number',default:4500,min:0},
  {id:'moisture_pct',label:'Moisture Content (%)',type:'number',default:5,min:0,max:40,hint:'Deducted from dry weight for billing'}],
 results:{rowFmt:'raw',columns:['Parameter','Formula','Value'],kpis:[{key:'k1',label:'Dry Tonne (for billing)',format:'text'},{key:'k2',label:'Stockpile Value',format:'text'},{key:'k3',label:'Volume (m³)',format:'text'}]},
 assumptions:'Cone volume = (1/3)πr²h. Trapezoidal: (1/3)h(A1 + A2 + √(A1×A2)). Dry tonnes = wet tonnes × (1 − moisture/100).',
 faq:[
  {q:'How is ore stockpile measured in practice?',a:'Drone/UAV volumetric survey (most accurate), total station survey, or simple geometric measurement. Drone surveys can achieve ±1–2% accuracy on large stockpiles.'},
  {q:'What is bulk density and how do I determine it?',a:'Bulk density = mass per unit volume including voids between particles. Measured by filling a known-volume container and weighing. Varies with moisture, particle size and compaction. Use lab-measured value.'},
  {q:'Why is moisture correction important?',a:'Iron ore and coal are sold on dry-weight basis (or specified moisture basis). Excess moisture means you are effectively selling water at ore price. Moisture content directly reduces realisation.'}],
 logic:`${inr}
export function compute(v){
  const shape=v.stockpile_shape||'cone',l=+v.length||60,w=+v.width||40,h=+v.height||8;
  const bd=+v.bulk_density||2.0,price=+v.sale_price_mt||4500,moist=+v.moisture_pct||5;
  let vol,shapeLabel;
  if(shape==='cone'){
    const r=Math.min(l,w)/2;
    vol=Math.round(Math.PI*r*r*h/3);
    shapeLabel='Cone (r='+r+'m, h='+h+'m)';
  } else {
    const A1=l*w,A2=(l-2*h)*(w-2*h),safeA2=Math.max(0,A2);
    vol=Math.round(h/3*(A1+safeA2+Math.sqrt(A1*safeA2)));
    shapeLabel='Trapezoidal '+l+'×'+w+'×'+h+'m';
  }
  const wetTonnes=Math.round(vol*bd);
  const dryTonnes=Math.round(wetTonnes*(1-moist/100));
  const value=Math.round(dryTonnes*price);
  return{
    rows:[
      ['Shape',shapeLabel,''],
      ['Volume',Math.round(vol).toLocaleString('en-IN')+' m³',''],
      ['Bulk Density',bd+' MT/m³',''],
      ['Wet Tonnes',wetTonnes.toLocaleString('en-IN')+' MT',''],
      ['Moisture',moist+'%',''],
      ['Dry (Billing) Tonnes',wetTonnes+' × '+(1-moist/100),dryTonnes.toLocaleString('en-IN')+' MT'],
      ['Stockpile Value',dryTonnes.toLocaleString('en-IN')+' MT × ₹'+price,inr(value)]],
    k1:dryTonnes.toLocaleString('en-IN')+' MT',k2:inr(value),k3:vol.toLocaleString('en-IN')+' m³'};
}`});

/* 13. Mine Water Management Cost */
push({id:'mine-water-management-cost',name:'Mine Water Management Cost Calculator',
 short:'Estimate mine dewatering and water treatment costs',
 intro:'Calculate the cost of mine dewatering, water treatment and effluent discharge compliance — a major recurring operating cost in both open-cast and underground mines.',
 seo:{title:'Mine Water Management Cost Calculator India – Dewatering',description:'Calculate mine dewatering and water treatment costs. Includes pump energy, sump capacity, treatment plant operation and discharge compliance for Indian mines.',keywords:['mine dewatering cost calculator','mine water treatment India','pit dewatering cost','mine effluent treatment','underground mine dewatering']},
 inputs:[
  {id:'water_inflow_m3h',label:'Water Inflow Rate (m³/hour)',type:'number',default:200,min:1},
  {id:'pump_head_m',label:'Total Pump Head (metres)',type:'number',default:100,min:10,hint:'Vertical lift + friction losses'},
  {id:'pump_efficiency',label:'Pump Efficiency (%)',type:'number',default:70,min:20,max:95},
  {id:'electricity_rate',label:'Electricity Rate (₹/kWh)',type:'number',default:7,min:1},
  {id:'treatment_cost_per_m3',label:'Water Treatment Cost (₹/m³)',type:'number',default:8,min:0,hint:'Settling, pH correction, filtration'},
  {id:'operating_hours_day',label:'Pumping Hours per Day',type:'number',default:20,min:1,max:24}],
 results:{rowFmt:'raw',columns:['Parameter','Calculation','Value'],kpis:[{key:'k1',label:'Monthly Dewatering Cost',format:'text'},{key:'k2',label:'Cost per m³ Water',format:'text'},{key:'k3',label:'Power Consumption (kW)',format:'text'}]},
 assumptions:'Power (kW) = (flow × head × density × g) / (pump efficiency × 1000). Water density = 1000 kg/m³, g = 9.81 m/s².',
 faq:[
  {q:'What is the typical mine water inflow rate?',a:'Inflow varies significantly with rock type, depth and season. Coal mines may face 200–2,000 m³/hour in waterlogged regions. Hard rock mines typically 50–500 m³/hour. Monsoon inflows can be 5–10× normal.'},
  {q:'Can mine water be reused?',a:'Yes. Treated mine water can be used for dust suppression, explosive preparation (controlled), and after treatment, for industrial cooling. CPCB/SPCB discharge norms must be met for any disposal to surface waters.'},
  {q:'What pumping system is used in deep mines?',a:'Multi-stage dewatering: sump pumps at pit bottom transfer to intermediate sumps, main dewatering pumps lift to surface. Submersible and vertical turbine pumps are common for open-cast; shaft pumps for underground.'}],
 logic:`${inr}
export function compute(v){
  const flow=+v.water_inflow_m3h||200,head=+v.pump_head_m||100;
  const eff=+v.pump_efficiency||70,elecRate=+v.electricity_rate||7;
  const treatCost=+v.treatment_cost_per_m3||8,hrsDay=+v.operating_hours_day||20;
  // Power = (m3/s × head × density × g) / efficiency
  const flowMs=flow/3600;
  const powerKW=Math.round(flowMs*head*1000*9.81/(eff/100*1000)*10)/10;
  const kwhPerDay=Math.round(powerKW*hrsDay);
  const waterM3Day=Math.round(flow*hrsDay);
  const elecCostDay=Math.round(kwhPerDay*elecRate);
  const treatCostDay=Math.round(waterM3Day*treatCost);
  const totalDayCost=elecCostDay+treatCostDay;
  const monthlyTotal=totalDayCost*30;
  const perM3=Math.round(totalDayCost/waterM3Day*100)/100;
  return{
    rows:[
      ['Water Inflow',flow+' m³/hr × '+hrsDay+' hrs',waterM3Day.toLocaleString('en-IN')+' m³/day'],
      ['Pump Power',Math.round(flowMs*head*1000*9.81/1000)+' kW (theoretical) / '+eff+'% eff',powerKW+' kW'],
      ['Energy Consumed',powerKW+' × '+hrsDay+' hrs',kwhPerDay.toLocaleString('en-IN')+' kWh/day'],
      ['Electricity Cost','₹'+elecRate+'/kWh',inr(elecCostDay)+'/day'],
      ['Water Treatment',waterM3Day.toLocaleString('en-IN')+' m³ × ₹'+treatCost,inr(treatCostDay)+'/day'],
      ['Total Daily Cost','',inr(totalDayCost)],
      ['Monthly Total (30 days)','',inr(monthlyTotal)]],
    k1:inr(monthlyTotal),k2:inr(perM3)+'/m³',k3:powerKW+' kW'};
}`});

/* 14. Mining Safety Compliance Checklist */
push({id:'mining-safety-compliance-checklist',name:'Mining Safety Compliance Checklist',
 kind:'checklist',
 short:'Verify statutory safety requirements for mining operations',
 intro:'Systematically audit your mining operation against the Mines Act 1952, Metalliferous Mines Regulations and Coal Mines Regulations to ensure zero-tolerance safety compliance.',
 seo:{title:'Mining Safety Compliance Checklist India – Mines Act DGMS',description:'Complete safety compliance checklist for Indian mines. Covers DGMS requirements, personal protection, explosives safety, equipment inspection and statutory returns.',keywords:['mining safety compliance checklist India','Mines Act 1952 compliance','DGMS safety requirements','mine safety audit checklist','coal mine safety India']},
 inputs:[],
 checklist:[
  {name:'Statutory Licences & Notices',items:[
   {id:'s1',text:'Mining lease valid and renewed — no operations after expiry',critical:true},
   {id:'s2',text:'Mining Plan approved by IBM and latest amendment on record',critical:true},
   {id:'s3',text:'Notice of commencement submitted to DGMS / District Mining Office',critical:true},
   {id:'s4',text:'Manager competency certificate (Mine Manager) valid and displayed',critical:true},
   {id:'s5',text:'Safety Committee constituted and meetings held quarterly'}]},
  {name:'Personal Protection & Medical',items:[
   {id:'s6',text:'PPE issued to all workers: helmet, safety shoes, high-vis, gloves',critical:true},
   {id:'s7',text:'Pre-employment and annual medical examination records maintained',critical:true},
   {id:'s8',text:'Mines Rescue team members trained and equipment serviceable'},
   {id:'s9',text:'First aid facilities with trained First Aider on each shift',critical:true},
   {id:'s10',text:'Noise level monitoring conducted; ear protection in high-noise areas'}]},
  {name:'Explosives & Blasting Safety',items:[
   {id:'s11',text:'Explosives magazine licensed by PESO and inspected annually',critical:true},
   {id:'s12',text:'Blasting done only by licensed shotfirer; records maintained',critical:true},
   {id:'s13',text:'Danger zone cleared and misfires handled per DGMS guidelines',critical:true},
   {id:'s14',text:'Explosives stock register maintained; reconciliation done daily'},
   {id:'s15',text:'Blasting permitted only at specified times; sirens and warning signs in place'}]},
  {name:'Equipment & Electrical Safety',items:[
   {id:'s16',text:'All vehicles and HME inspected daily — pre-shift checklist completed',critical:true},
   {id:'s17',text:'Third-party inspection of cranes, hoists and lifting equipment annually',critical:true},
   {id:'s18',text:'Electrical installations inspected and certified; no open wiring',critical:true},
   {id:'s19',text:'Haul roads graded, berms maintained, speed limits posted'},
   {id:'s20',text:'Monthly safety inspection by Manager; reports submitted to DGMS'}]}],
 buttonLabel:'Check Safety Compliance',
 results:CHECKLIST_RESULTS,
 logic:CHECKLIST_LOGIC,
 assumptions:'Checklist based on Mines Act 1952, MMR 1961 and CMR 2017. Specific requirements vary by mine type (coal/metalliferous/OC/UG). Consult DGMS notifications.',
 faq:[
  {q:'Who regulates mine safety in India?',a:'Directorate General of Mines Safety (DGMS), under Ministry of Labour & Employment, is the statutory authority. DGMS inspectors conduct periodic inspections and can issue closure orders for unsafe mines.'},
  {q:'What is the penalty for violating Mines Act provisions?',a:'Violations attract fines up to ₹1 lakh and/or imprisonment up to 6 months for first offence; higher for repeat violations. Fatal accidents require mandatory inquiry by DGMS.'},
  {q:'What is Section 23 of the Mines Act?',a:"Section 23 empowers the Inspector of Mines to order stoppage of operations or withdrawal of workers in any part of a mine if he believes a danger to life or safety exists. Compliance is immediate and mandatory."}]});

/* 15. Mine Lease Cost Estimator */
push({id:'mine-lease-cost-estimator',name:'Mine Lease Cost Estimator',
 short:'Estimate upfront and recurring costs of obtaining a mine lease',
 intro:'Calculate the total cost of acquiring and maintaining a mining lease in India — covering application fees, surface rent, dead rent, royalty and IBM/DGMS fees.',
 seo:{title:'Mine Lease Cost Estimator – Mining Lease Fees India MMDR',description:'Estimate total mining lease costs in India: application fees, surface rent, dead rent, royalty, IBM fees and DGMS inspection charges per MMDR Act.',keywords:['mining lease cost India','mine lease fees MMDR','surface rent mining','dead rent mining India','mining licence cost India']},
 inputs:[
  {id:'lease_area_ha',label:'Lease Area (hectares)',type:'number',default:50,min:0.1},
  {id:'mineral_type',label:'Mineral Category',type:'select',default:'major',options:[{v:'major',t:'Major Mineral (IBM regulated)'},{v:'minor',t:'Minor Mineral (State regulated)'}]},
  {id:'application_fee',label:'Application Fee (₹)',type:'number',default:50000,min:0,hint:'Varies by state and mineral'},
  {id:'surface_rent_per_ha',label:'Annual Surface Rent (₹/ha)',type:'number',default:10000,min:0},
  {id:'dead_rent_per_ha',label:'Annual Dead Rent (₹/ha)',type:'number',default:5000,min:0,hint:'Minimum rent payable even if no production'},
  {id:'annual_production_mt',label:'Expected Annual Production (MT)',type:'number',default:100000,min:0},
  {id:'royalty_per_mt',label:'Royalty per MT (₹)',type:'number',default:525,min:0}],
 results:{rowFmt:'raw',columns:['Lease Cost Component','Frequency','Annual Amount (₹)'],kpis:[{key:'k1',label:'Annual Lease Costs',format:'text'},{key:'k2',label:'Total Cost per MT',format:'text'},{key:'k3',label:'One-Time Costs',format:'text'}]},
 assumptions:'Dead rent credited against royalty in years of production. IBM fees ₹25,000/year (indicative). One-time includes application + legal costs.',
 faq:[
  {q:'What is the difference between royalty and dead rent?',a:'Royalty is payable per tonne of mineral extracted. Dead rent is the minimum annual rent payable even in years of no or low production. Royalty paid in a year is adjusted against dead rent.'},
  {q:'How long is a mining lease granted for?',a:'Under MMDR Act, mining leases through auction are granted for 50 years (non-renewable as of 2021 amendment). Older leases could be renewed; new regime is strictly 50-year competitive auction.'},
  {q:'What is a Preferred Bidder\'s Upfront Payment?',a:'In auctioned mine leases, the highest bidder (by Premium%) must pay an upfront fee (state-specified, typically 1–5% of NPV) within 30 days of being declared Preferred Bidder. This is in addition to ongoing royalty and premium.'}],
 logic:`${inr}
export function compute(v){
  const area=+v.lease_area_ha||50;
  const appFee=+v.application_fee||50000;
  const surfRent=+v.surface_rent_per_ha||10000;
  const deadRent=+v.dead_rent_per_ha||5000;
  const prod=+v.annual_production_mt||100000;
  const royPerMT=+v.royalty_per_mt||525;
  const surfTotal=Math.round(area*surfRent);
  const deadTotal=Math.round(area*deadRent);
  const royaltyTotal=Math.round(prod*royPerMT);
  const dmc=Math.round(royaltyTotal*0.30);
  const ibmFee=25000;
  const oneTime=appFee+50000; // appFee + legal estimate
  const annual=surfTotal+Math.max(0,royaltyTotal-deadTotal)+deadTotal+dmc+ibmFee;
  const perMT=prod>0?Math.round(annual/prod*100)/100:0;
  return{
    rows:[
      ['Surface Rent',area+' ha × ₹'+surfRent,inr(surfTotal)+'/year'],
      ['Dead Rent',area+' ha × ₹'+deadRent,inr(deadTotal)+'/year'],
      ['Royalty',prod.toLocaleString('en-IN')+' MT × ₹'+royPerMT,inr(royaltyTotal)+'/year'],
      ['DMF + NMET','~32% of royalty',inr(dmc)+'/year'],
      ['IBM / DGMS Fees','Indicative',inr(ibmFee)+'/year'],
      ['Total Annual Lease Cost','',inr(annual)],
      ['One-Time Costs (appln+legal)','',inr(oneTime)]],
    k1:inr(annual),k2:'₹'+perMT+'/MT',k3:inr(oneTime)};
}`});

/* 16. Crushing & Screening Plant Efficiency */
push({id:'crushing-screening-plant-efficiency',name:'Crushing & Screening Plant Efficiency Calculator',
 short:'Measure crushing and screening plant throughput and efficiency',
 intro:'Evaluate the operational efficiency of mineral processing plants — crushers, screens and classifiers — to optimise throughput, reduce downtime and improve product quality.',
 seo:{title:'Crushing Screening Plant Efficiency Calculator – Mining India',description:'Calculate crushing and screening plant throughput, efficiency and cost per tonne. Identify bottlenecks in mineral processing for Indian mining operations.',keywords:['crushing plant efficiency calculator','screening plant throughput India','mineral processing efficiency','crusher productivity calculator','plant OEE mining India']},
 inputs:[
  {id:'design_capacity_tph',label:'Design Capacity (TPH)',type:'number',default:200,min:1},
  {id:'actual_throughput_tph',label:'Actual Average Throughput (TPH)',type:'number',default:160,min:1},
  {id:'operating_hours_day',label:'Operating Hours per Day',type:'number',default:16,min:1,max:24},
  {id:'downtime_hours_month',label:'Unplanned Downtime (hours/month)',type:'number',default:40,min:0},
  {id:'power_consumption_kw',label:'Total Power Consumption (kW)',type:'number',default:500,min:1},
  {id:'electricity_rate',label:'Electricity Rate (₹/kWh)',type:'number',default:7,min:1},
  {id:'maintenance_monthly',label:'Monthly Maintenance Cost (₹)',type:'number',default:300000,min:0}],
 results:{rowFmt:'raw',columns:['Plant KPI','Calculation','Value'],kpis:[{key:'k1',label:'Monthly Output (MT)',format:'text'},{key:'k2',label:'Processing Cost / MT',format:'text'},{key:'k3',label:'Plant Efficiency %',format:'text'}]},
 assumptions:'Available hours = operating hours × 30 − downtime. Monthly output = actual TPH × available hours. Efficiency = actual/design TPH.',
 faq:[
  {q:'What causes crushing plant downtime?',a:'Liner/jaw wear (scheduled), tramp metal (unscheduled), screen blinding, conveyor spillage, motor failures and feeder blockages. Predictive maintenance and online monitoring reduce unplanned downtime significantly.'},
  {q:'What is a good crushing plant utilisation rate?',a:'Well-operated crushing plants achieve 75–85% utilisation. Below 65% indicates operational inefficiency or design issues. World-class operations target 90%+ with automated monitoring.'},
  {q:'How do I reduce crushing cost per tonne?',a:'Maximise throughput (close to design), schedule maintenance in off-shifts, use wear-resistant liners for longer replacement intervals, feed consistent particle size to avoid oversize, and optimise screen aperture.'}],
 logic:`${inr}
export function compute(v){
  const design=+v.design_capacity_tph||200,actual=+v.actual_throughput_tph||160;
  const hrsDay=+v.operating_hours_day||16,dtHrs=+v.downtime_hours_month||40;
  const power=+v.power_consumption_kw||500,elec=+v.electricity_rate||7;
  const maint=+v.maintenance_monthly||300000;
  const availHrs=hrsDay*30-dtHrs;
  const monthlyOut=Math.round(actual*availHrs);
  const efficiency=Math.round(actual/design*1000)/10;
  const powerCostM=Math.round(power*availHrs*elec);
  const totalCost=powerCostM+maint;
  const costPerMT=monthlyOut>0?Math.round(totalCost/monthlyOut*100)/100:0;
  return{
    rows:[
      ['Design Capacity',design+' TPH',''],
      ['Actual Throughput',actual+' TPH',''],
      ['Plant Efficiency',actual+'/'+design+' TPH',efficiency+'%'],
      ['Available Hours',hrsDay*30+' - '+dtHrs+' downtime',availHrs+' hrs/month'],
      ['Monthly Output',actual+' TPH × '+availHrs+' hrs',monthlyOut.toLocaleString('en-IN')+' MT'],
      ['Power Cost',power+' kW × '+availHrs+' hrs × ₹'+elec,inr(powerCostM)],
      ['Maintenance','',inr(maint)],
      ['Processing Cost / MT',inr(totalCost)+' / '+monthlyOut,inr(costPerMT)+'/MT']],
    k1:monthlyOut.toLocaleString('en-IN')+' MT',k2:inr(costPerMT)+'/MT',k3:efficiency+'%'};
}`});

/* 17. Pit Optimisation / Cut-off Grade Calculator */
push({id:'cut-off-grade-calculator',name:'Cut-off Grade Calculator',
 short:'Determine minimum viable ore grade for profitable extraction',
 intro:'Calculate the break-even (cut-off) grade below which mining a block of ore is uneconomical — the fundamental tool for optimising mine planning and resource classification.',
 seo:{title:'Cut-off Grade Calculator – Mine Planning Optimization India',description:'Calculate break-even cut-off grade for mineral deposits. Determine minimum economic ore grade based on mining cost, processing cost and commodity price.',keywords:['cut-off grade calculator mining','break-even grade calculator','mine planning optimization India','economic ore grade','mineral cut-off grade']},
 inputs:[
  {id:'mining_cost_mt',label:'Mining Cost (₹/MT ore)',type:'number',default:500,min:0},
  {id:'processing_cost_mt',label:'Processing Cost (₹/MT ore)',type:'number',default:200,min:0},
  {id:'overhead_cost_mt',label:'G&A / Overhead (₹/MT ore)',type:'number',default:100,min:0},
  {id:'royalty_mt',label:'Royalty & Levies (₹/MT ore)',type:'number',default:150,min:0},
  {id:'product_price',label:'Product Sale Price (₹/MT product)',type:'number',default:4500,min:0},
  {id:'recovery_pct',label:'Processing Recovery (%)',type:'number',default:88,min:1,max:100},
  {id:'target_margin_pct',label:'Target Profit Margin (%)',type:'number',default:0,min:0,max:50,hint:'Enter 0 for pure break-even; add % for minimum return'}],
 results:{rowFmt:'raw',columns:['Parameter','Calculation','Value'],kpis:[{key:'k1',label:'Break-even Grade',format:'text'},{key:'k2',label:'Grade with Margin',format:'text'},{key:'k3',label:'Revenue at Break-even',format:'text'}]},
 assumptions:'Cut-off grade = total cost per MT ore / (product price × recovery%). Result is % mineral in ore that makes extraction viable.',
 faq:[
  {q:'How is cut-off grade used in mine planning?',a:'Blocks below cut-off grade are classified as waste (even if they contain mineral). Only blocks at or above cut-off grade are included in ore reserve. This directly determines mineable reserve tonnage.'},
  {q:'Does cut-off grade change over time?',a:'Yes. Rising commodity prices lower the cut-off grade (more ore is economic), while rising costs raise it. Cut-off grade should be recalculated annually or when costs/prices change significantly.'},
  {q:'What is marginal ore and how is it handled?',a:'Marginal ore is material with grade just above or below cut-off. It is often stockpiled for reprocessing when prices improve. Internal cut-off grades separate stockpile material from waste.'}],
 logic:`${inr}
export function compute(v){
  const mc=+v.mining_cost_mt||500,pc=+v.processing_cost_mt||200;
  const gc=+v.overhead_cost_mt||100,roy=+v.royalty_mt||150;
  const price=+v.product_price||4500,rec=+v.recovery_pct||88,margin=+v.target_margin_pct||0;
  const totalCost=mc+pc+gc+roy;
  const requiredRevenue=totalCost*(1+margin/100);
  const breakEvenGrade=Math.round(requiredRevenue/(price*rec/100)*1000)/10;
  const breakEvenGradeMargin=Math.round(requiredRevenue*(1+margin/100)/(price*rec/100)*1000)/10;
  const revAtBE=Math.round(breakEvenGrade/100*rec/100*price);
  return{
    rows:[
      ['Mining Cost',inr(mc)+'/MT ore',''],
      ['Processing Cost',inr(pc)+'/MT ore',''],
      ['Overhead / G&A',inr(gc)+'/MT ore',''],
      ['Royalty & Levies',inr(roy)+'/MT ore',''],
      ['Total Cost',inr(totalCost)+'/MT ore',''],
      ['Product Price',inr(price)+'/MT product',''],
      ['Recovery',rec+'%',''],
      ['Break-even Grade','Total cost / (price × rec)',breakEvenGrade+'%'],
      ['Grade with '+margin+'% Margin','',breakEvenGradeMargin+'%']],
    k1:breakEvenGrade+'%',k2:breakEvenGradeMargin+'%',k3:inr(revAtBE)+'/MT ore at BE grade'};
}`});

/* 18. Mineral Testing & Sampling Cost */
push({id:'mineral-testing-sampling-cost',name:'Mineral Testing & Sampling Cost Calculator',
 short:'Budget for mineral quality testing and sampling programmes',
 intro:'Estimate the total cost of a mineral sampling and testing programme — covering sample collection, preparation, assay charges and reporting for exploration or operational quality control.',
 seo:{title:'Mineral Testing Sampling Cost Calculator – Mining Quality India',description:'Calculate mineral sampling and laboratory testing costs. Covers sample collection, preparation, XRF/ICP assay, moisture and reporting for Indian mining QC.',keywords:['mineral testing cost calculator India','ore sampling cost','mining laboratory cost','XRF assay cost India','ore quality testing budget']},
 inputs:[
  {id:'samples_per_month',label:'Samples per Month',type:'number',default:100,min:1},
  {id:'collection_cost_per_sample',label:'Sample Collection Cost (₹/sample)',type:'number',default:300,min:0,hint:'Labour, equipment, transport'},
  {id:'preparation_cost_per_sample',label:'Sample Preparation (₹/sample)',type:'number',default:200,min:0,hint:'Crushing, splitting, pulverising'},
  {id:'assay_cost_per_sample',label:'Laboratory Assay Cost (₹/sample)',type:'number',default:800,min:0,hint:'XRF, ICP, wet chemistry'},
  {id:'moisture_test_pct',label:'Samples for Moisture Testing (%)',type:'number',default:20,min:0,max:100},
  {id:'moisture_cost',label:'Moisture Test Cost (₹/sample)',type:'number',default:200,min:0},
  {id:'reporting_monthly',label:'QC Reporting & Certification (₹/month)',type:'number',default:15000,min:0}],
 results:{rowFmt:'raw',columns:['Testing Component','Quantity × Rate','Monthly Cost (₹)'],kpis:[{key:'k1',label:'Monthly Testing Cost',format:'text'},{key:'k2',label:'Cost per Sample',format:'text'},{key:'k3',label:'Annual Budget',format:'text'}]},
 assumptions:'Moisture samples = total samples × moisture %. Reporting is a fixed monthly cost.',
 faq:[
  {q:'What analytical methods are used for iron ore testing?',a:'XRF (X-Ray Fluorescence) for major element oxides (Fe, SiO2, Al2O3, P, S), ICP for trace elements, Leco for C/S content. ISO methods (ISO 2597 series) are standard for international trade.'},
  {q:'How many samples are needed for quality control?',a:'Open-cast mines: 1 sample per 500–1,000 MT for ROM ore, 1 per 2,000–5,000 MT for product. Exploration: 1 per 3–5 m of drill core or at specific geological intervals. Statistical sampling frequency should be per ISO 3085.'},
  {q:'What is Third Party Sampling?',a:'Independent sampling and testing by an accredited agency at the time of dispatch/receipt. Required for large export consignments and for dispute resolution. Cost is ₹5,000–₹20,000 per consignment.'}],
 logic:`${inr}
export function compute(v){
  const samples=+v.samples_per_month||100;
  const collect=+v.collection_cost_per_sample||300;
  const prep=+v.preparation_cost_per_sample||200;
  const assay=+v.assay_cost_per_sample||800;
  const moistPct=+v.moisture_test_pct||20;
  const moistCost=+v.moisture_cost||200;
  const reporting=+v.reporting_monthly||15000;
  const moistSamples=Math.round(samples*moistPct/100);
  const collTotal=collect*samples;
  const prepTotal=prep*samples;
  const assayTotal=assay*samples;
  const moistTotal=moistSamples*moistCost;
  const totalMonthly=collTotal+prepTotal+assayTotal+moistTotal+reporting;
  const perSample=Math.round(totalMonthly/samples);
  return{
    rows:[
      ['Sample Collection',samples+' × ₹'+collect,inr(collTotal)],
      ['Sample Preparation',samples+' × ₹'+prep,inr(prepTotal)],
      ['Laboratory Assay',samples+' × ₹'+assay,inr(assayTotal)],
      ['Moisture Testing',moistSamples+' × ₹'+moistCost,inr(moistTotal)],
      ['Reporting & Certification','Monthly',inr(reporting)],
      ['Total Monthly Cost','',inr(totalMonthly)]],
    k1:inr(totalMonthly),k2:inr(perSample)+'/sample',k3:inr(totalMonthly*12)};
}`});

/* 19. IBM Statutory Returns Checklist */
push({id:'mining-statutory-returns-checklist',name:'Mining Statutory Returns & IBM Compliance Checklist',
 kind:'checklist',
 short:'Ensure timely submission of all mining statutory returns and reports',
 intro:'Verify that all mandatory returns, reports and intimations required under the MMDR Act, Mines Act, and IBM/DGMS regulations are submitted on time to avoid penalties.',
 seo:{title:'Mining Statutory Returns Checklist – IBM DGMS Compliance India',description:'Complete checklist for mining statutory returns and compliance in India. IBM annual returns, DGMS quarterly reports, royalty payment and surface rent compliance.',keywords:['mining statutory returns India','IBM compliance checklist','DGMS returns mining','mining annual return','mine compliance India MMDR']},
 inputs:[],
 checklist:[
  {name:'IBM & MMDR Returns',items:[
   {id:'r1',text:'Annual Return of Mineral Production (Form K) to IBM by 31 January',critical:true},
   {id:'r2',text:'Half-yearly Return to State DMG/DMO by 31 July and 31 January',critical:true},
   {id:'r3',text:'Mining Plan review submitted to IBM every 5 years',critical:true},
   {id:'r4',text:'Mine closure plan (MCP) updated and progressive restoration report submitted',critical:true},
   {id:'r5',text:'Quarterly production and despatch data uploaded to IBM Unified Portal'}]},
  {name:'DGMS & Safety Returns',items:[
   {id:'r6',text:'Annual Safety Return (Form S) to DGMS by 31 January',critical:true},
   {id:'r7',text:'Serious accident / fatal accident reported to DGMS within 24 hours',critical:true},
   {id:'r8',text:'Quarterly occupational health returns submitted to DGMS'},
   {id:'r9',text:'Quarterly blasting return submitted to DGMS Inspector'},
   {id:'r10',text:'Annual report on statutory training and refresher courses submitted'}]},
  {name:'Financial & Royalty Compliance',items:[
   {id:'r11',text:'Monthly royalty paid to State Government within due date',critical:true},
   {id:'r12',text:'Annual surface rent and dead rent paid before due date',critical:true},
   {id:'r13',text:'DMF (District Mineral Foundation) contribution paid monthly',critical:true},
   {id:'r14',text:'NMET (National Mineral Exploration Trust) contribution paid'},
   {id:'r15',text:'Annual accounts of mine operations filed with State DMO'}]},
  {name:'Environmental & Forest Returns',items:[
   {id:'r16',text:'Half-yearly compliance report to MoEFCC / SEIAA on EC conditions',critical:true},
   {id:'r17',text:'Annual environment statement (Form V) to SPCB',critical:true},
   {id:'r18',text:'Afforestation progress report to CAMPA submitted annually'},
   {id:'r19',text:'Consent to Operate (CTO) renewed from SPCB before expiry'},
   {id:'r20',text:'Water consumption and effluent discharge returns filed with SPCB'}]}],
 buttonLabel:'Check Compliance Status',
 results:CHECKLIST_RESULTS,
 logic:CHECKLIST_LOGIC,
 assumptions:'Deadlines and forms vary by state and mineral type. Always confirm with your IBM Regional Controller, DGMS Regional Inspector and State DMO for exact current requirements.',
 faq:[
  {q:'What is the penalty for late submission of IBM returns?',a:'Under MMDR Act, failure to submit returns is an offence punishable with fine up to ₹5,000 for the first offence and higher for continuing offences. IBM can also initiate action under MMDR for rule violations.'},
  {q:'What is the IBM Unified Portal?',a:'The Indian Bureau of Mines (IBM) Online Portal (https://ibm.gov.in) is the mandatory digital platform for filing mining plans, annual returns, quarterly production data and applying for mine closure. Physical filings are no longer accepted for most submissions.'},
  {q:'What happens if royalty payment is delayed?',a:'Interest at 24% per annum is charged on delayed royalty. Persistent default can lead to suspension or revocation of mining lease under MMDR Act provisions.'}]});

/* 20. Mineral Dispatch Planning Calculator */
push({id:'mineral-dispatch-planning-calculator',name:'Mineral Dispatch Planning Calculator',
 short:'Plan and schedule mineral dispatch to meet annual targets',
 intro:'Build a monthly dispatch plan for mineral production, balancing production rates, stockpile levels, transport availability and customer commitments to achieve annual targets.',
 seo:{title:'Mineral Dispatch Planning Calculator – Mine Dispatch Schedule India',description:'Plan mineral dispatch schedule from mine to match production with customer commitments. Balance stockpile, transport and annual target for mining businesses.',keywords:['mineral dispatch planning India','mine dispatch calculator','ore dispatch schedule','mining logistics planning','mineral supply chain India']},
 inputs:[
  {id:'annual_target_mt',label:'Annual Dispatch Target (MT)',type:'number',default:600000,min:1000},
  {id:'current_stockpile',label:'Current Stockpile (MT)',type:'number',default:50000,min:0},
  {id:'monthly_production',label:'Monthly Production (MT)',type:'number',default:55000,min:0},
  {id:'plant_shutdown_days',label:'Plant Shutdown Days per Month',type:'number',default:2,min:0,max:15},
  {id:'months_remaining',label:'Months Remaining in Year',type:'number',default:12,min:1,max:12},
  {id:'min_stockpile',label:'Minimum Buffer Stockpile (MT)',type:'number',default:10000,min:0,hint:'Minimum stock to maintain at all times'},
  {id:'transport_capacity_monthly',label:'Max Transport Capacity (MT/month)',type:'number',default:60000,min:0}],
 results:{rowFmt:'raw',columns:['Planning Parameter','Calculation','Value'],kpis:[{key:'k1',label:'Monthly Dispatch Target',format:'text'},{key:'k2',label:'Achievable by Year-End',format:'text'},{key:'k3',label:'Transport Constraint',format:'text'}]},
 assumptions:'Available production = monthly production × (1 − shutdown days/30). Dispatch limited by min of production + stockpile drawdown vs transport capacity.',
 faq:[
  {q:'How do I handle production shortfalls vs dispatch commitments?',a:'Maintain a strategic stockpile buffer (1–2 months production) to cover plant breakdowns or monsoon production drops. Communicate proactively with customers if shortfall is unavoidable; force majeure clauses in supply contracts.'},
  {q:'What factors affect mine-to-customer logistics planning?',a:'Rake availability (rail), truck fleet availability, weather disruptions, port congestion, weighbridge queues, and regulatory stops (vehicle overload checks). Plan 10–15% buffer in transport commitment.'},
  {q:'When should I build stockpile vs dispatch immediately?',a:'Build stockpile when prices are rising (hold for higher price), when transport is constrained (accumulate for bulk despatch), or before planned shutdown periods. Dispatch immediately when cashflow is critical or prices are declining.'}],
 logic:`${inr}
export function compute(v){
  const annTarget=+v.annual_target_mt||600000;
  const stockpile=+v.current_stockpile||50000;
  const monthProd=+v.monthly_production||55000;
  const shutdown=+v.plant_shutdown_days||2;
  const months=+v.months_remaining||12;
  const minStock=+v.min_stockpile||10000;
  const transport=+v.transport_capacity_monthly||60000;
  const effectiveProd=Math.round(monthProd*(1-shutdown/30));
  const availableToDispatch=stockpile-minStock;
  const totalAvail=effectiveProd*months+Math.max(0,availableToDispatch);
  const monthlyRequired=Math.round(annTarget/months);
  const achievable=Math.min(totalAvail,transport*months);
  const transportOK=monthlyRequired<=transport?'Sufficient':'CONSTRAINED';
  return{
    rows:[
      ['Annual Target',annTarget.toLocaleString('en-IN')+' MT',''],
      ['Months Remaining',months,''],
      ['Required Monthly Dispatch','Target / months',monthlyRequired.toLocaleString('en-IN')+' MT'],
      ['Effective Monthly Prod','',effectiveProd.toLocaleString('en-IN')+' MT'],
      ['Usable Stockpile',stockpile+' − '+minStock+' buffer',Math.max(0,availableToDispatch).toLocaleString('en-IN')+' MT'],
      ['Total Available in Period','Prod × months + stock',totalAvail.toLocaleString('en-IN')+' MT'],
      ['Transport Capacity',transport.toLocaleString('en-IN')+' MT/month',transportOK],
      ['Achievable Dispatch','Min(available, transport)',achievable.toLocaleString('en-IN')+' MT']],
    k1:monthlyRequired.toLocaleString('en-IN')+' MT/month',k2:achievable.toLocaleString('en-IN')+' MT',k3:transportOK};
}`});

writeTools(T);
const n=T.length;
console.log('Mining & Minerals tools written:',n);
