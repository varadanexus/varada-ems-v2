import { writeTools, CHECKLIST_LOGIC, CHECKLIST_RESULTS, D } from './_seedlib.mjs';
const REL=[{label:'Logistics & Transport Services',url:'/services.html'},{label:'Contact Us',url:'/contact.html'}];
const T=[];
const push=o=>{o.cat='transportation-logistics';o.related=o.related||REL;T.push(o);};

/* 1. Freight Cost Calculator */
push({id:'freight-cost-calculator',name:'Freight Cost Calculator',
 short:'Road, rail and air freight cost by weight and distance.',
 intro:'Calculate freight transportation cost by mode (road, rail, air) based on weight, distance and applicable freight rates.',
 seo:{title:'Freight Cost Calculator — Road Rail Air Freight India | Varada Nexus',description:'Free freight cost calculator India. Calculate road, rail and air freight costs by weight and distance for logistics planning.',keywords:['freight cost calculator india','road freight rate calculator','logistics cost per km']},
 inputs:[
  {id:'weight',label:'Shipment weight (kg)',type:'number',default:1000,min:1},
  {id:'distance',label:'Distance (km)',type:'number',default:500,min:1},
  {id:'mode',label:'Transport mode',type:'select',default:'road',options:[{v:'road',t:'Road (truck)'},{v:'rail',t:'Rail'},{v:'air',t:'Air cargo'}]},
  {id:'volume_weight',label:'Volume weight (kg) — if higher than actual',type:'number',default:0,min:0},
  {id:'loading_cost',label:'Loading / unloading cost (₹)',type:'number',default:2000,min:0}],
 results:{rowFmt:'raw',columns:['Component','','Cost (₹)'],kpis:[{key:'k1',label:'Total freight cost',format:'text'},{key:'k2',label:'Cost per km',format:'text'},{key:'k3',label:'Cost per kg',format:'text'}]},
 assumptions:'Approximate rates: Road ₹1.50–2.50/kg/100km; Rail ₹0.80–1.20/kg/100km; Air ₹35–60/kg flat (distance-adjusted). Chargeable weight = max(actual, volume weight).',
 faq:[
  {q:'What is volume weight (dimensional weight)?',a:'Volume weight = (length × width × height in cm) ÷ 5000 for air freight, ÷ 4000 for courier. Carrier charges whichever is higher — actual or volume weight.'},
  {q:'What is the cheapest freight mode in India?',a:'Rail is the cheapest for bulk cargo over long distances (>500km). Road is most flexible for door-to-door. Air is fastest but 10–20× the cost of road freight.'},
  {q:'How is road freight rate calculated in India?',a:'Road freight rates in India are typically quoted per tonne per km or as a flat vehicle hire rate. Rates vary by vehicle type, route, fuel prices and seasonal demand.'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
const RATES={road:2.0,rail:1.0,air:50};
export function compute(v){
  const wt=+v.weight||1000,dist=+v.distance||500,mode=v.mode||'road',vwt=+v.volume_weight||0,lc=+v.loading_cost||0;
  const chargeable=Math.max(wt,vwt||0);
  let freight;
  if(mode==='air'){freight=chargeable*RATES.air*(1+dist/5000);}
  else{freight=chargeable*(RATES[mode]/100)*dist;}
  const total=Math.round(freight+lc);
  const perKm=Math.round(total/dist*100)/100;
  const perKg=Math.round(total/chargeable*100)/100;
  const rows=[
   ['Chargeable weight',chargeable+' kg',''],
   ['Distance',dist+' km',''],
   ['Mode',mode,''],
   ['Freight charge','',inr(Math.round(freight))],
   ['Loading / unloading','',inr(lc)],
   ['Total freight cost','',inr(total)]];
  return{rows,k1:inr(total),k2:'₹'+perKm+'/km',k3:'₹'+perKg+'/kg'};}`});

/* 2. Vehicle Operating Cost Calculator */
push({id:'vehicle-operating-cost',name:'Vehicle Operating Cost Calculator',
 short:'Per-km and monthly vehicle cost including depreciation.',
 intro:'Calculate the total operating cost per kilometre for commercial vehicles including fuel, tyres, maintenance, driver wages, insurance and depreciation.',
 seo:{title:'Vehicle Operating Cost Calculator — Per Km Cost India | Varada Nexus',description:'Free vehicle operating cost calculator India. Calculate per-km cost for trucks and commercial vehicles including fuel, maintenance and depreciation.',keywords:['vehicle operating cost calculator','truck per km cost india','commercial vehicle cost per km']},
 inputs:[
  {id:'vehicle_cost',label:'Vehicle purchase cost (₹)',type:'number',default:2500000,min:100000},
  {id:'monthly_km',label:'Monthly km driven',type:'number',default:8000,min:100},
  {id:'fuel_eff',label:'Fuel efficiency (km/litre)',type:'number',default:5,min:1},
  {id:'fuel_price',label:'Diesel price (₹/litre)',type:'number',default:90,min:50},
  {id:'driver_salary',label:'Driver salary (₹/month)',type:'number',default:25000,min:0},
  {id:'tyre_cost',label:'Monthly tyre cost (₹)',type:'number',default:8000,min:0},
  {id:'maintenance',label:'Monthly maintenance (₹)',type:'number',default:10000,min:0},
  {id:'insurance',label:'Annual insurance (₹)',type:'number',default:80000,min:0}],
 results:{rowFmt:'raw',columns:['Cost Component','Monthly (₹)','Per km (₹)'],kpis:[{key:'k1',label:'Total cost per km',format:'text'},{key:'k2',label:'Monthly operating cost',format:'text'},{key:'k3',label:'Fuel cost per km',format:'text'}]},
 assumptions:'Depreciation = 15% of vehicle cost per year (WDV method). Insurance monthly = annual ÷ 12. Per-km cost = monthly total ÷ monthly km.',
 faq:[
  {q:'What is the average truck operating cost per km in India?',a:'For a 10-tonne truck, operating cost ranges from ₹25–45/km depending on route, load factor and fuel price. Heavy trucks (25t+) cost ₹35–55/km.'},
  {q:'What is the biggest cost in truck operations?',a:'Fuel is typically 40–50% of total operating cost for a truck in India. Driver wages, tyres and maintenance together make up another 30–40%.'},
  {q:'How is vehicle depreciation calculated?',a:'Trucking companies typically use 15% WDV (Written Down Value) depreciation for taxation. For per-km costing, straight-line over 8–10 years is more useful.'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const vc=+v.vehicle_cost||2500000,mkm=+v.monthly_km||8000,fe=+v.fuel_eff||5,fp=+v.fuel_price||90,ds=+v.driver_salary||25000,ty=+v.tyre_cost||8000,mn=+v.maintenance||10000,ins=+v.insurance||80000;
  const fuelMonthly=Math.round(mkm/fe*fp);
  const depMonthly=Math.round(vc*0.15/12);
  const insMonthly=Math.round(ins/12);
  const totalMonthly=fuelMonthly+ds+ty+mn+depMonthly+insMonthly;
  const perKm=Math.round(totalMonthly/mkm*100)/100;
  const fuelPerKm=Math.round(fp/fe*100)/100;
  const rows=[['Fuel',inr(fuelMonthly),'₹'+fuelPerKm],['Driver salary',inr(ds),'₹'+Math.round(ds/mkm*100)/100],['Tyres',inr(ty),'₹'+Math.round(ty/mkm*100)/100],['Maintenance',inr(mn),'₹'+Math.round(mn/mkm*100)/100],['Depreciation (15% p.a.)',inr(depMonthly),'₹'+Math.round(depMonthly/mkm*100)/100],['Insurance',inr(insMonthly),'₹'+Math.round(insMonthly/mkm*100)/100],['TOTAL',inr(totalMonthly),'₹'+perKm]];
  return{rows,k1:'₹'+perKm+'/km',k2:inr(totalMonthly)+'/mo',k3:'₹'+fuelPerKm+'/km'};}`});

/* 3. Delivery Route Optimizer (simplified) */
push({id:'delivery-route-planner',name:'Delivery Route Cost Planner',
 short:'Multi-stop delivery cost and time planning.',
 intro:'Plan and estimate cost and time for multi-stop delivery routes based on number of stops, average distance between stops and vehicle operating cost.',
 seo:{title:'Delivery Route Cost Planner — Multi-Stop Logistics Calculator | Varada Nexus',description:'Free delivery route planner. Calculate total route distance, time and cost for multi-stop delivery runs for logistics and last-mile operations.',keywords:['delivery route planner','multi stop delivery cost calculator','last mile logistics cost']},
 inputs:[
  {id:'stops',label:'Number of delivery stops',type:'number',default:10,min:2},
  {id:'avg_distance',label:'Average distance between stops (km)',type:'number',default:8,min:0.5},
  {id:'cost_per_km',label:'Vehicle cost per km (₹)',type:'number',default:30,min:1},
  {id:'avg_stop_time',label:'Average time per stop (minutes)',type:'number',default:15,min:1},
  {id:'speed',label:'Average driving speed (km/h)',type:'number',default:30,min:5},
  {id:'driver_cost_hr',label:'Driver cost per hour (₹)',type:'number',default:150,min:0}],
 results:{rowFmt:'raw',columns:['Metric','','Value'],kpis:[{key:'k1',label:'Total route cost',format:'text'},{key:'k2',label:'Total route distance',format:'text'},{key:'k3',label:'Total route time',format:'text'}]},
 assumptions:'Total distance = (stops − 1) × avg distance between stops. Drive time = distance ÷ speed. Stop time = stops × avg stop time.',
 faq:[
  {q:'How do I optimise a delivery route?',a:'Use route optimisation software (Google Maps, Routific, OptimoRoute) for real-world routing. Key factors: cluster stops geographically, start from nearest stop, avoid backtracking and time-window constraints.'},
  {q:'What is last-mile delivery cost?',a:'Last-mile delivery typically accounts for 41–53% of total supply chain cost. In India, average cost per last-mile delivery is ₹40–120 depending on city and volume.'},
  {q:'How many deliveries can a truck make per day?',a:'A typical delivery truck in India completes 20–40 stops per day in urban areas, 10–20 in semi-urban. Factors: stop duration, traffic, vehicle capacity, route density.'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const stops=+v.stops||10,avgDist=+v.avg_distance||8,cpkm=+v.cost_per_km||30,stopTime=+v.avg_stop_time||15,speed=+v.speed||30,driverHr=+v.driver_cost_hr||150;
  const totalDist=Math.round((stops-1)*avgDist);
  const driveTimeHr=totalDist/speed;
  const stopTimeHr=stops*stopTime/60;
  const totalTimeHr=driveTimeHr+stopTimeHr;
  const vehicleCost=Math.round(totalDist*cpkm);
  const driverCost=Math.round(totalTimeHr*driverHr);
  const total=vehicleCost+driverCost;
  const costPerStop=Math.round(total/stops);
  const rows=[
   ['Delivery stops',stops,''],
   ['Total route distance',totalDist+' km',''],
   ['Drive time',Math.round(driveTimeHr*60)+' min',''],
   ['Stop time ('+stopTime+' min × '+stops+')','',Math.round(stopTimeHr*60)+' min'],
   ['Total route time','',Math.round(totalTimeHr*60)+' min ('+Math.round(totalTimeHr*10)/10+' hrs)'],
   ['Vehicle cost',inr(vehicleCost),''],
   ['Driver cost',inr(driverCost),''],
   ['Total route cost',inr(total),''],
   ['Cost per stop',inr(costPerStop),'']];
  return{rows,k1:inr(total),k2:totalDist+' km',k3:Math.round(totalTimeHr*60)+' min'};}`});

/* 4. Warehouse Storage Cost Calculator */
push({id:'warehouse-storage-cost',name:'Warehouse Storage Cost Calculator',
 short:'Monthly warehousing cost per unit and per pallet.',
 intro:'Calculate monthly warehouse storage costs including space rent, labour, handling and inventory carrying costs.',
 seo:{title:'Warehouse Storage Cost Calculator — India Warehousing Rates | Varada Nexus',description:'Free warehouse cost calculator. Calculate monthly storage cost per unit, per pallet and total warehousing cost including space, labour and handling.',keywords:['warehouse storage cost calculator','warehousing cost per pallet india','inventory storage cost calculator']},
 inputs:[
  {id:'area',label:'Warehouse area used (sq ft)',type:'number',default:5000,min:100},
  {id:'rent_per_sqft',label:'Rent per sq ft per month (₹)',type:'number',default:25,min:1},
  {id:'labour',label:'Monthly warehouse labour cost (₹)',type:'number',default:80000,min:0},
  {id:'utilities',label:'Monthly utilities (electricity, water) (₹)',type:'number',default:20000,min:0},
  {id:'pallets',label:'Average pallets stored',type:'number',default:200,min:1},
  {id:'units_per_pallet',label:'Units per pallet',type:'number',default:50,min:1},
  {id:'inventory_value',label:'Average inventory value (₹)',type:'number',default:2000000,min:0}],
 results:{rowFmt:'raw',columns:['Cost Component','Monthly (₹)','Per Pallet (₹)'],kpis:[{key:'k1',label:'Total monthly cost',format:'text'},{key:'k2',label:'Cost per pallet/month',format:'text'},{key:'k3',label:'Cost per unit/month',format:'text'}]},
 assumptions:'Space cost = area × rent rate. Inventory carrying cost = inventory value × 2% per month (industry benchmark). Total = space + labour + utilities + carrying cost.',
 faq:[
  {q:'What is the typical warehouse rent in India?',a:'Grade A warehouse rent in India: ₹20–35/sq ft/month in industrial hubs (Bhiwandi, NH8); ₹15–25 in Tier-2 cities. Cold storage commands 1.5–2× premium.'},
  {q:'What is inventory carrying cost?',a:'Inventory carrying cost is the cost of holding stock and includes capital cost, storage, insurance, obsolescence and damage. Benchmark is 20–30% of inventory value per year (≈2% per month).'},
  {q:'What is a pallet?',a:'A standard pallet is 40×48 inches (1.2×1.0 m). A typical warehouse aisle-racking stores 100–150 pallets per 1,000 sq ft at single depth. Double-deep racking improves density.'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const area=+v.area||5000,rent=+v.rent_per_sqft||25,labour=+v.labour||80000,util=+v.utilities||20000,pallets=+v.pallets||200,uph=+v.units_per_pallet||50,invVal=+v.inventory_value||2000000;
  const spaceCost=area*rent;
  const carryCost=Math.round(invVal*0.02);
  const total=spaceCost+labour+util+carryCost;
  const perPallet=Math.round(total/pallets);
  const perUnit=Math.round(total/(pallets*uph)*100)/100;
  const rows=[['Space / rent',inr(spaceCost),inr(Math.round(spaceCost/pallets))],['Labour',inr(labour),inr(Math.round(labour/pallets))],['Utilities',inr(util),inr(Math.round(util/pallets))],['Inventory carrying cost (2%/mo)',inr(carryCost),inr(Math.round(carryCost/pallets))],['TOTAL',inr(total),inr(perPallet)]];
  return{rows,k1:inr(total)+'/mo',k2:inr(perPallet)+'/pallet',k3:'₹'+perUnit+'/unit'};}`});

/* 5. Load Factor Calculator */
push({id:'load-factor-calculator',name:'Load Factor & Capacity Utilisation Calculator',
 short:'Vehicle load factor, deadweight loss and efficiency.',
 intro:'Calculate vehicle load factor, revenue loss from empty running and optimal capacity utilisation for fleet management.',
 seo:{title:'Load Factor Calculator — Vehicle Capacity Utilisation | Varada Nexus',description:'Free load factor calculator. Calculate vehicle capacity utilisation, deadweight loss and revenue opportunity from empty running in logistics.',keywords:['load factor calculator','vehicle capacity utilisation','freight load factor logistics']},
 inputs:[
  {id:'capacity',label:'Vehicle capacity (tonnes)',type:'number',default:10,min:0.5},
  {id:'actual_load',label:'Actual load carried (tonnes)',type:'number',default:7,min:0},
  {id:'return_load',label:'Return journey load (tonnes)',type:'number',default:3,min:0},
  {id:'freight_rate',label:'Freight rate (₹/tonne)',type:'number',default:2000,min:0},
  {id:'trips_month',label:'Trips per month',type:'number',default:20,min:1}],
 results:{rowFmt:'raw',columns:['Metric','Outbound','Return'],kpis:[{key:'k1',label:'Average load factor',format:'text'},{key:'k2',label:'Monthly revenue loss',format:'text'},{key:'k3',label:'Optimal monthly revenue',format:'text'}]},
 assumptions:'Load factor = actual load ÷ capacity × 100%. Revenue loss = (capacity − actual load) × freight rate × trips. Optimal revenue = capacity × freight rate × trips × 2 (both ways).',
 faq:[
  {q:'What is a good vehicle load factor?',a:'A load factor above 80% is considered efficient. Most Indian trucking operators achieve 70–85% on outbound loads; return loads are often 40–60%, reducing overall utilisation.'},
  {q:'How do I reduce empty running?',a:'Load boards (e.g. RIVIGO, BlackBuck, Porter) match available capacity with return loads. Freight exchanges and backhaul arrangements can reduce empty kilometres by 20–30%.'},
  {q:'What is the impact of low load factor on cost?',a:'A truck with 60% load factor incurs the same fixed costs as a full truck but generates only 60% of potential revenue. Each 10% load factor improvement directly improves profitability by 8–12%.'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const cap=+v.capacity||10,out=+v.actual_load||7,ret=+v.return_load||3,rate=+v.freight_rate||2000,trips=+v.trips_month||20;
  const lfOut=Math.round(out/cap*100);
  const lfRet=Math.round(ret/cap*100);
  const avgLF=Math.round((lfOut+lfRet)/2);
  const outRev=out*rate*trips,retRev=ret*rate*trips;
  const optimalRev=cap*rate*trips*2;
  const revLoss=Math.round(optimalRev-outRev-retRev);
  const rows=[
   ['Capacity',cap+' t',cap+' t'],
   ['Actual load',out+' t',ret+' t'],
   ['Load factor',lfOut+'%',lfRet+'%'],
   ['Revenue at current load',inr(outRev),inr(retRev)],
   ['Revenue at full load',inr(cap*rate*trips),inr(cap*rate*trips)],
   ['Revenue loss',inr(Math.round(cap*rate*trips-outRev)),inr(Math.round(cap*rate*trips-retRev))]];
  return{rows,k1:avgLF+'%',k2:inr(revLoss)+'/mo',k3:inr(optimalRev)+'/mo'};}`});

/* 6. Fleet Maintenance Cost Calculator */
push({id:'fleet-maintenance-cost',name:'Fleet Maintenance Cost Calculator',
 short:'Monthly fleet maintenance cost and cost per vehicle.',
 intro:'Calculate total fleet maintenance cost including preventive maintenance, repairs, tyres and annual service costs across your vehicle fleet.',
 seo:{title:'Fleet Maintenance Cost Calculator — Fleet Management India | Varada Nexus',description:'Free fleet maintenance cost calculator. Calculate total and per-vehicle maintenance costs for truck and commercial vehicle fleets in India.',keywords:['fleet maintenance cost calculator','truck fleet maintenance cost','commercial vehicle maintenance budget']},
 inputs:[
  {id:'fleet_size',label:'Fleet size (vehicles)',type:'number',default:10,min:1},
  {id:'monthly_km',label:'Average km per vehicle per month',type:'number',default:8000,min:100},
  {id:'pm_cost_km',label:'Preventive maintenance cost (₹/km)',type:'number',default:1.5,min:0},
  {id:'tyre_km',label:'Tyre life (km per set)',type:'number',default:60000,min:10000},
  {id:'tyre_set_cost',label:'Tyre set cost (₹)',type:'number',default:80000,min:0},
  {id:'annual_service',label:'Annual service cost per vehicle (₹)',type:'number',default:30000,min:0},
  {id:'breakdown_cost',label:'Average monthly breakdown cost per vehicle (₹)',type:'number',default:5000,min:0}],
 results:{rowFmt:'raw',columns:['Cost Component','Per Vehicle/Month','Fleet Total/Month'],kpis:[{key:'k1',label:'Monthly fleet maintenance cost',format:'text'},{key:'k2',label:'Per vehicle per month',format:'text'},{key:'k3',label:'Maintenance cost per km',format:'text'}]},
 assumptions:'Tyre cost/month = (monthly km ÷ tyre life) × tyre set cost. Annual service amortised monthly. PM cost per km applied to monthly km.',
 faq:[
  {q:'What is the rule of thumb for fleet maintenance budget?',a:'Budget 8–15% of vehicle replacement cost per year for maintenance. For a ₹25L truck, budget ₹2–3.75L/year. Higher for older vehicles (10+ years).'},
  {q:'What is preventive vs corrective maintenance?',a:'Preventive maintenance (PM) is scheduled servicing — oil changes, filter replacements, inspections — done to prevent breakdowns. Corrective maintenance is reactive repair after a breakdown.'},
  {q:'How do I reduce fleet maintenance costs?',a:'Implement PM schedules, track vehicle health via telematics, train drivers on eco-driving and vehicle care, negotiate tyre and parts contracts, and track MTBF (mean time between failures).'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const fs=+v.fleet_size||10,mkm=+v.monthly_km||8000,pm=+v.pm_cost_km||1.5,tyreLf=+v.tyre_km||60000,tyreCost=+v.tyre_set_cost||80000,annSvc=+v.annual_service||30000,brkdn=+v.breakdown_cost||5000;
  const pmPerVeh=Math.round(mkm*pm);
  const tyrePerVeh=Math.round(mkm/tyreLf*tyreCost);
  const svcPerVeh=Math.round(annSvc/12);
  const totalPerVeh=pmPerVeh+tyrePerVeh+svcPerVeh+brkdn;
  const fleetTotal=totalPerVeh*fs;
  const perKm=Math.round(totalPerVeh/mkm*100)/100;
  const rows=[['Preventive maintenance',inr(pmPerVeh),inr(pmPerVeh*fs)],['Tyre cost',inr(tyrePerVeh),inr(tyrePerVeh*fs)],['Annual service (monthly)',inr(svcPerVeh),inr(svcPerVeh*fs)],['Breakdown / repairs',inr(brkdn),inr(brkdn*fs)],['TOTAL',inr(totalPerVeh),inr(fleetTotal)]];
  return{rows,k1:inr(fleetTotal)+'/mo',k2:inr(totalPerVeh)+'/vehicle',k3:'₹'+perKm+'/km'};}`});

/* 7. Logistics Cost as % Revenue Calculator */
push({id:'logistics-cost-revenue',name:'Logistics Cost as % of Revenue',
 short:'Logistics spend as percentage of revenue benchmark.',
 intro:'Calculate your total logistics cost as a percentage of revenue and benchmark against industry standards to identify savings opportunities.',
 seo:{title:'Logistics Cost as % of Revenue — Supply Chain Benchmarking | Varada Nexus',description:'Free logistics cost calculator. Measure total logistics spend as % of revenue and benchmark against industry to find cost reduction opportunities.',keywords:['logistics cost percentage revenue','supply chain cost benchmarking','logistics spend analysis india']},
 inputs:[
  {id:'revenue',label:'Annual revenue (₹)',type:'number',default:50000000,min:100000},
  {id:'freight_cost',label:'Annual freight cost (₹)',type:'number',default:3000000,min:0},
  {id:'warehouse_cost',label:'Annual warehousing cost (₹)',type:'number',default:1500000,min:0},
  {id:'inventory_cost',label:'Annual inventory carrying cost (₹)',type:'number',default:1000000,min:0},
  {id:'admin_cost',label:'Logistics admin / technology cost (₹)',type:'number',default:500000,min:0}],
 results:{rowFmt:'raw',columns:['Component','Annual Cost','% of Revenue'],kpis:[{key:'k1',label:'Total logistics cost %',format:'text'},{key:'k2',label:'Total logistics cost',format:'text'},{key:'k3',label:'Savings at benchmark',format:'text'}]},
 assumptions:'Industry benchmark total logistics cost: FMCG 8–12%, Auto parts 6–10%, E-commerce 15–20%, Manufacturing 5–8%. Benchmark used = 8% for savings calculation.',
 faq:[
  {q:'What is the average logistics cost as % of revenue?',a:'India logistics cost averages 13–14% of GDP (higher than the global average of 8–10%). For individual companies: FMCG 8–12%, auto 6–10%, pharma 5–8%, e-commerce 15–22%.'},
  {q:'How can companies reduce logistics costs?',a:'Key levers: consolidate shipments, improve load factors, switch modes for long-haul (road to rail), implement WMS for warehouse efficiency, reduce inventory through better forecasting.'},
  {q:'What is the ideal logistics cost ratio?',a:'World-class companies achieve total logistics cost of 4–7% of revenue. Most Indian SMEs are at 12–18%. Each 1% reduction directly adds to operating profit.'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const rev=+v.revenue||50000000,fr=+v.freight_cost||0,wh=+v.warehouse_cost||0,inv=+v.inventory_cost||0,adm=+v.admin_cost||0;
  const total=fr+wh+inv+adm;
  const pct=Math.round(total/rev*100*10)/10;
  const benchmark=rev*0.08;
  const savings=Math.round(total-benchmark);
  const p=n=>Math.round(n/rev*100*10)/10;
  const rows=[['Freight cost',inr(fr),p(fr)+'%'],['Warehousing',inr(wh),p(wh)+'%'],['Inventory carrying',inr(inv),p(inv)+'%'],['Admin / technology',inr(adm),p(adm)+'%'],['TOTAL',inr(total),pct+'%'],['Industry benchmark (8%)','',inr(Math.round(benchmark))],['Gap to benchmark','',inr(savings)+(savings>0?' (potential saving)':'')]];
  return{rows,k1:pct+'%',k2:inr(total)+'/yr',k3:savings>0?inr(savings):'Below benchmark ✅'};}`});

/* 8. Import Customs Duty Calculator (basic) */
push({id:'customs-duty-calculator',name:'Customs Duty & Import Cost Calculator',
 short:'Total import cost with customs duty, IGST and landing charges.',
 intro:'Calculate the total landed cost of imported goods including customs duty, IGST, social welfare surcharge, landing charges and port handling costs.',
 seo:{title:'Customs Duty Calculator India — Import Cost & Landed Cost | Varada Nexus',description:'Free customs duty calculator India. Calculate total import landed cost with basic customs duty, IGST, social welfare surcharge and port charges.',keywords:['customs duty calculator india','import duty calculator','landed cost calculator india']},
 inputs:[
  {id:'cif_value',label:'CIF value (₹ — cost + insurance + freight)',type:'number',default:500000,min:1},
  {id:'basic_duty',label:'Basic customs duty (%)',type:'number',default:10,min:0,max:100},
  {id:'igst',label:'IGST rate (%)',type:'number',default:18,min:0,max:28},
  {id:'sws',label:'Social Welfare Surcharge (% of basic duty)',type:'number',default:10,min:0,max:20},
  {id:'handling',label:'Port handling & CHA charges (₹)',type:'number',default:15000,min:0}],
 results:{rowFmt:'raw',columns:['Component','Rate','Amount (₹)'],kpis:[{key:'k1',label:'Total landed cost',format:'text'},{key:'k2',label:'Total duty burden',format:'text'},{key:'k3',label:'Effective duty %',format:'text'}]},
 assumptions:'Assessable value = CIF value. Basic duty on assessable value. SWS on basic duty. IGST on (assessable value + basic duty + SWS). Does not include anti-dumping duty or cess.',
 faq:[
  {q:'What is CIF value?',a:'CIF (Cost, Insurance, Freight) is the assessable value for customs duty. It includes the cost of goods, insurance and freight to the Indian port of entry.'},
  {q:'What is Social Welfare Surcharge?',a:'SWS is levied at 10% of the total customs duty (basic + other duties) under the Finance Act. It replaced the Education Cess from 2018.'},
  {q:'Can IGST paid on imports be claimed as input tax credit?',a:'Yes — IGST paid on imports is fully available as input tax credit (ITC) for registered GST businesses, as long as the goods are used for taxable supply.'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const cif=+v.cif_value||500000,bd=+v.basic_duty||10,igstR=+v.igst||18,swsR=+v.sws||10,handling=+v.handling||15000;
  const basicDuty=Math.round(cif*bd/100);
  const sws=Math.round(basicDuty*swsR/100);
  const igstBase=cif+basicDuty+sws;
  const igst=Math.round(igstBase*igstR/100);
  const totalDuty=basicDuty+sws+igst;
  const landed=cif+totalDuty+handling;
  const effectivePct=Math.round(totalDuty/cif*100*10)/10;
  const rows=[
   ['CIF / Assessable value','',inr(cif)],
   ['Basic customs duty',bd+'%',inr(basicDuty)],
   ['Social Welfare Surcharge',swsR+'% of basic',inr(sws)],
   ['IGST',igstR+'% of (CIF+duty+SWS)',inr(igst)],
   ['Port handling & CHA','',inr(handling)],
   ['Total landed cost','',inr(landed)]];
  return{rows,k1:inr(landed),k2:inr(totalDuty),k3:effectivePct+'%'};}`});

/* 9. Logistics RFQ Evaluator */
push({id:'logistics-rfq-evaluator',name:'Logistics RFQ Evaluator & Comparison',
 short:'Compare logistics vendor quotes on cost and service.',
 intro:'Compare logistics service provider quotes on weighted criteria including freight rate, transit time, reliability score and ancillary charges.',
 seo:{title:'Logistics RFQ Evaluator — Vendor Comparison Tool | Varada Nexus',description:'Free logistics RFQ evaluator. Compare freight and logistics vendor quotes on cost, transit time, reliability and service for tender evaluation.',keywords:['logistics rfq evaluator','freight vendor comparison','logistics tender evaluation tool']},
 inputs:[
  {id:'v1_rate',label:'Vendor A: freight rate (₹/tonne)',type:'number',default:2500,min:1},
  {id:'v1_transit',label:'Vendor A: transit time (days)',type:'number',default:3,min:0.5},
  {id:'v1_reliability',label:'Vendor A: reliability score (1–10)',type:'number',default:8,min:1,max:10},
  {id:'v2_rate',label:'Vendor B: freight rate (₹/tonne)',type:'number',default:2200,min:1},
  {id:'v2_transit',label:'Vendor B: transit time (days)',type:'number',default:4,min:0.5},
  {id:'v2_reliability',label:'Vendor B: reliability score (1–10)',type:'number',default:6,min:1,max:10},
  {id:'weight_cost',label:'Weight: cost (%)',type:'number',default:50,min:0,max:100},
  {id:'weight_time',label:'Weight: transit time (%)',type:'number',default:30,min:0,max:100}],
 results:{rowFmt:'raw',columns:['Criterion','Vendor A','Vendor B'],kpis:[{key:'k1',label:'Recommended vendor',format:'text'},{key:'k2',label:'Vendor A score',format:'text'},{key:'k3',label:'Vendor B score',format:'text'}]},
 assumptions:'Reliability weight = 100% − cost weight − time weight. Lower cost/time = higher score. Normalised 0–100 scale per criterion.',
 faq:[
  {q:'What criteria should I use to evaluate logistics vendors?',a:'Key criteria: freight rate, transit time, on-time delivery rate (OTD), damage/loss claims rate, technology (tracking), geographic coverage and financial stability. Weight by business priority.'},
  {q:'Should I always choose the cheapest logistics provider?',a:'Not necessarily. Poor reliability adds hidden costs through customer complaints, rush orders, damage claims and lost business. Total cost of logistics service often favours slightly higher-priced reliable partners.'},
  {q:'How do I negotiate freight rates?',a:'Consolidate volumes, commit to guaranteed volumes, tender at least 2–3 vendors, negotiate annual rate cards with fuel adjustment formulas, and benchmark against market indices (Crisil Trucking Index).'}],
 logic:`export function compute(v){
  const v1r=+v.v1_rate||2500,v1t=+v.v1_transit||3,v1rel=+v.v1_reliability||8;
  const v2r=+v.v2_rate||2200,v2t=+v.v2_transit||4,v2rel=+v.v2_reliability||6;
  const wCost=(+v.weight_cost||50)/100,wTime=(+v.weight_time||30)/100,wRel=Math.max(0,1-wCost-wTime);
  const minRate=Math.min(v1r,v2r),maxRate=Math.max(v1r,v2r);
  const minTime=Math.min(v1t,v2t),maxTime=Math.max(v1t,v2t);
  const norm=(val,min,max,invert)=>max===min?100:invert?(max-val)/(max-min)*100:val/max*100;
  const v1CostScore=norm(v1r,minRate,maxRate,true),v2CostScore=norm(v2r,minRate,maxRate,true);
  const v1TimeScore=norm(v1t,minTime,maxTime,true),v2TimeScore=norm(v2t,minTime,maxTime,true);
  const v1RelScore=v1rel*10,v2RelScore=v2rel*10;
  const v1Total=Math.round(v1CostScore*wCost+v1TimeScore*wTime+v1RelScore*wRel);
  const v2Total=Math.round(v2CostScore*wCost+v2TimeScore*wTime+v2RelScore*wRel);
  const winner=v1Total>=v2Total?'Vendor A ✅':'Vendor B ✅';
  const rows=[['Freight rate','₹'+v1r+'/t','₹'+v2r+'/t'],['Transit time',v1t+' days',v2t+' days'],['Reliability score',v1rel+'/10',v2rel+'/10'],['Cost score ('+Math.round(wCost*100)+'%)',Math.round(v1CostScore),Math.round(v2CostScore)],['Time score ('+Math.round(wTime*100)+'%)',Math.round(v1TimeScore),Math.round(v2TimeScore)],['Reliability score ('+Math.round(wRel*100)+'%)',Math.round(v1RelScore),Math.round(v2RelScore)],['WEIGHTED TOTAL',v1Total,v2Total]];
  return{rows,k1:winner,k2:v1Total+'/100',k3:v2Total+'/100'};}`});

/* 10. Port Demurrage Calculator */
push({id:'demurrage-calculator',name:'Port Demurrage & Detention Calculator',
 short:'Demurrage and detention costs for containers.',
 intro:'Calculate port demurrage and container detention charges based on free days, actual days held and daily rates per container.',
 seo:{title:'Port Demurrage Calculator — Container Detention Charges | Varada Nexus',description:'Free demurrage calculator. Calculate port demurrage and container detention charges based on free days and daily demurrage rates.',keywords:['demurrage calculator','container detention charges','port demurrage cost india']},
 inputs:[
  {id:'containers',label:'Number of containers',type:'number',default:2,min:1},
  {id:'free_days_demurrage',label:'Free days (demurrage at port)',type:'number',default:3,min:0},
  {id:'actual_days_port',label:'Actual days at port',type:'number',default:7,min:0},
  {id:'demurrage_rate',label:'Demurrage rate (₹/container/day)',type:'number',default:8000,min:0},
  {id:'free_days_detention',label:'Free days (detention — container out of port)',type:'number',default:7,min:0},
  {id:'actual_days_detention',label:'Actual detention days',type:'number',default:12,min:0},
  {id:'detention_rate',label:'Detention rate (₹/container/day)',type:'number',default:4000,min:0}],
 results:{rowFmt:'raw',columns:['Charge Type','Days Charged','Amount (₹)'],kpis:[{key:'k1',label:'Total demurrage + detention',format:'text'},{key:'k2',label:'Demurrage charge',format:'text'},{key:'k3',label:'Detention charge',format:'text'}]},
 assumptions:'Chargeable days = max(0, actual days − free days). Demurrage applies while container is at port. Detention applies after container is taken out until returned to depot.',
 faq:[
  {q:'What is the difference between demurrage and detention?',a:'Demurrage is charged when a container stays at the port beyond free time (port-side). Detention is charged when a container is taken outside the port and not returned within free time.'},
  {q:'How can I avoid demurrage and detention?',a:'Pre-arrange customs clearance, transportation and warehousing before cargo arrival. File Bills of Entry early, arrange containers immediately after clearance and return empty containers promptly.'},
  {q:'What are typical free days at Indian ports?',a:'Most shipping lines offer 3–7 days free demurrage at major Indian ports. Free detention is typically 7–14 days. Free days vary by line, port, container type and volume agreement.'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const cont=+v.containers||1,fdD=+v.free_days_demurrage||3,adP=+v.actual_days_port||0,dRate=+v.demurrage_rate||0,fdDet=+v.free_days_detention||7,adDet=+v.actual_days_detention||0,detRate=+v.detention_rate||0;
  const demDays=Math.max(0,adP-fdD),detDays=Math.max(0,adDet-fdDet);
  const demCharge=demDays*dRate*cont,detCharge=detDays*detRate*cont;
  const total=demCharge+detCharge;
  const rows=[['Demurrage',adP+' days at port / '+fdD+' free',demDays+' chargeable days'],['Demurrage charge',cont+' containers × '+demDays+' days × ₹'+dRate,inr(demCharge)],['Detention',adDet+' days out / '+fdDet+' free',detDays+' chargeable days'],['Detention charge',cont+' containers × '+detDays+' days × ₹'+detRate,inr(detCharge)],['TOTAL','',inr(total)]];
  return{rows,k1:inr(total),k2:inr(demCharge),k3:inr(detCharge)};}`});

/* 11. Supply Chain Lead Time Calculator */
push({id:'supply-chain-lead-time',name:'Supply Chain Lead Time Calculator',
 short:'Total end-to-end supply chain lead time from order to delivery.',
 intro:'Calculate total end-to-end supply chain lead time from order placement to final delivery, covering sourcing, manufacturing, shipping and customs.',
 seo:{title:'Supply Chain Lead Time Calculator — Order to Delivery | Varada Nexus',description:'Free supply chain lead time calculator. Calculate total order-to-delivery lead time across sourcing, production, shipping, customs and last-mile delivery.',keywords:['supply chain lead time calculator','order to delivery lead time','procurement lead time calculator']},
 inputs:[
  {id:'sourcing_days',label:'Supplier response / sourcing days',type:'number',default:3,min:0},
  {id:'production_days',label:'Manufacturing / production days',type:'number',default:14,min:0},
  {id:'quality_days',label:'Quality inspection days',type:'number',default:2,min:0},
  {id:'transit_days',label:'Transit / shipping days',type:'number',default:21,min:0},
  {id:'customs_days',label:'Customs clearance days',type:'number',default:3,min:0},
  {id:'last_mile_days',label:'Last-mile delivery days',type:'number',default:2,min:0},
  {id:'safety_stock_days',label:'Safety stock buffer (days)',type:'number',default:7,min:0}],
 results:{rowFmt:'raw',columns:['Supply Chain Stage','Days','Cumulative'],kpis:[{key:'k1',label:'Total lead time',format:'text'},{key:'k2',label:'With safety stock',format:'text'},{key:'k3',label:'Reorder point (days out)',format:'text'}]},
 assumptions:'Reorder point = total lead time + safety stock. Orders should be placed when stock can last for (lead time + safety stock) days.',
 faq:[
  {q:'What is supply chain lead time?',a:'Lead time is the total time from order placement to final delivery. It includes supplier lead time, production lead time, shipping and customs clearance. Reducing lead time improves cash flow and customer service.'},
  {q:'What is safety stock?',a:'Safety stock is buffer inventory held to cover demand variability and supply delays. Typical safety stock = 1–2 weeks of demand for most items; higher for critical or long-lead components.'},
  {q:'How can I reduce supply chain lead time?',a:'Source locally or regionally, qualify backup suppliers, use vendor-managed inventory (VMI), pre-position stock closer to customers, and implement demand forecasting to reduce production lead times.'}],
 logic:`export function compute(v){
  const s=+v.sourcing_days||0,p=+v.production_days||0,q=+v.quality_days||0,t=+v.transit_days||0,c=+v.customs_days||0,l=+v.last_mile_days||0,ss=+v.safety_stock_days||0;
  const stages=[['Sourcing / supplier response',s],['Manufacturing / production',p],['Quality inspection',q],['Transit / shipping',t],['Customs clearance',c],['Last-mile delivery',l]];
  let cum=0;
  const rows=stages.map(([n,d])=>{cum+=d;return[n,d+' days',cum+' days'];});
  const total=cum;
  rows.push(['Safety stock buffer',ss+' days','']);
  const reorder=total+ss;
  return{rows,k1:total+' days',k2:(total+ss)+' days',k3:reorder+' days before stockout'};}`});

/* 12. Freight Insurance Calculator */
push({id:'freight-insurance-calculator',name:'Freight Insurance Cost Calculator',
 short:'Cargo insurance premium for shipments.',
 intro:'Calculate freight and cargo insurance premium for domestic and international shipments based on cargo value, route risk and coverage type.',
 seo:{title:'Freight Insurance Calculator — Cargo Insurance Premium | Varada Nexus',description:'Free freight insurance calculator. Calculate cargo insurance premium for domestic and international shipments based on cargo value and route risk.',keywords:['freight insurance calculator','cargo insurance premium','marine insurance calculator india']},
 inputs:[
  {id:'cargo_value',label:'Cargo / shipment value (₹)',type:'number',default:500000,min:1000},
  {id:'mode',label:'Transport mode',type:'select',default:'road',options:[{v:'road',t:'Road (domestic)'},{v:'rail',t:'Rail (domestic)'},{v:'sea',t:'Sea (international)'},{v:'air',t:'Air (international)'}]},
  {id:'coverage',label:'Coverage type',type:'select',default:'icc_a',options:[{v:'icc_a',t:'ICC A / All Risk (broadest)'},{v:'icc_c',t:'ICC C / Named Perils'},{v:'basic',t:'Basic cover only'}]},
  {id:'deductible',label:'Deductible amount (₹)',type:'number',default:5000,min:0}],
 results:{rowFmt:'raw',columns:['Component','','Value'],kpis:[{key:'k1',label:'Insurance premium',format:'text'},{key:'k2',label:'Rate %',format:'text'},{key:'k3',label:'Coverage (after deductible)',format:'text'}]},
 assumptions:'Indicative rates: Road 0.08–0.15%, Rail 0.06–0.12%, Sea ICC-A 0.10–0.20%, Air ICC-A 0.05–0.12%. All-risk coverage at 1.4× basic rate. Consult insurer for actual quotes.',
 faq:[
  {q:'Is freight insurance mandatory?',a:'No, it is not mandatory but strongly recommended. Most banks financing trade require marine insurance for L/C shipments. Carrier liability under Carriage of Goods Act is limited.'},
  {q:'What does All Risk (ICC A) cargo insurance cover?',a:'ICC A covers all physical loss or damage to cargo from any external cause, including water damage, theft, rough handling and breakage. Exclusions include inherent vice, delay and intentional damage.'},
  {q:'How do I file a cargo insurance claim?',a:'Immediately notify insurer (within 24 hours for visible damage). Get survey done by the insurer\'s surveyor. Document damage with photos, packing list and delivery note. File within the claim period (usually 60–90 days).'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
const BASE_RATES={road:0.0010,rail:0.0008,sea:0.0015,air:0.0008};
const COV_MULT={icc_a:1.4,icc_c:1.0,basic:0.7};
export function compute(v){
  const val=+v.cargo_value||500000,mode=v.mode||'road',cov=v.coverage||'icc_a',ded=+v.deductible||0;
  const rate=(BASE_RATES[mode]||0.001)*(COV_MULT[cov]||1);
  const premium=Math.round(val*rate);
  const coverage=val-ded;
  const rows=[
   ['Cargo / shipment value','',inr(val)],
   ['Mode',mode,''],
   ['Coverage type',cov,''],
   ['Insurance rate','',Math.round(rate*1000)/10+'‰ ('+Math.round(rate*10000)/100+'%)'],
   ['Premium','',inr(premium)],
   ['Deductible','',inr(ded)],
   ['Effective coverage (value − deductible)','',inr(coverage)]];
  return{rows,k1:inr(premium),k2:Math.round(rate*10000)/100+'%',k3:inr(coverage)};}`});

/* 13. Cold Chain Cost Calculator */
push({id:'cold-chain-cost-calculator',name:'Cold Chain Logistics Cost Calculator',
 short:'Temperature-controlled logistics cost for perishables.',
 intro:'Calculate the cost of cold chain logistics including refrigerated transport, cold storage, handling and temperature monitoring for perishable goods.',
 seo:{title:'Cold Chain Cost Calculator — Refrigerated Logistics India | Varada Nexus',description:'Free cold chain cost calculator. Calculate refrigerated transport, cold storage and temperature monitoring costs for perishable goods logistics.',keywords:['cold chain cost calculator','refrigerated logistics cost india','cold storage transport cost']},
 inputs:[
  {id:'weight',label:'Shipment weight (kg)',type:'number',default:5000,min:1},
  {id:'distance',label:'Distance (km)',type:'number',default:800,min:1},
  {id:'temp_zone',label:'Temperature zone',type:'select',default:'chilled',options:[{v:'frozen',t:'Frozen (below −18°C)'},{v:'chilled',t:'Chilled (2–8°C)'},{v:'ambient_ctrl',t:'Ambient controlled (15–25°C)'}]},
  {id:'storage_days',label:'Cold storage days',type:'number',default:3,min:0},
  {id:'storage_area',label:'Cold storage area (sq ft)',type:'number',default:200,min:0}],
 results:{rowFmt:'raw',columns:['Component','','Cost (₹)'],kpis:[{key:'k1',label:'Total cold chain cost',format:'text'},{key:'k2',label:'Cost premium vs normal freight',format:'text'},{key:'k3',label:'Cold chain cost per kg',format:'text'}]},
 assumptions:'Approximate reefer rates: Frozen ₹4.50/kg/100km, Chilled ₹3.50/kg/100km, Ambient controlled ₹2.50/kg/100km. Cold storage: Frozen ₹60/sq ft/day, Chilled ₹40, Ambient ₹20. Normal road freight ₹2/kg/100km.',
 faq:[
  {q:'What is cold chain logistics?',a:'Cold chain logistics maintains perishable goods at required temperatures throughout transit and storage — from production to end consumer. It is critical for food (frozen/fresh), pharma (vaccines, biologics) and chemicals.'},
  {q:'What is the cold chain premium in India?',a:'Cold chain transport costs 1.5–2.5× normal road freight. Cold chain infrastructure is still developing in India, with significant losses (30% of perishables) due to inadequate cold chain.'},
  {q:'How do I ensure temperature integrity in cold chain?',a:'Use validated temperature-controlled vehicles (with calibrated reefer units), real-time temperature monitoring IoT sensors, qualified packaging (insulated, dry ice, gel packs), and documented temperature logs for each shipment.'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
const TRANSPORT_RATES={frozen:4.5,chilled:3.5,ambient_ctrl:2.5};
const STORAGE_RATES={frozen:60,chilled:40,ambient_ctrl:20};
const NORMAL_RATE=2.0;
export function compute(v){
  const wt=+v.weight||5000,dist=+v.distance||800,zone=v.temp_zone||'chilled',days=+v.storage_days||0,area=+v.storage_area||0;
  const transport=Math.round(wt*(TRANSPORT_RATES[zone]||3.5)/100*dist);
  const storage=Math.round(area*STORAGE_RATES[zone]*days);
  const total=transport+storage;
  const normalFreight=Math.round(wt*NORMAL_RATE/100*dist);
  const premium=total-normalFreight;
  const perKg=Math.round(total/wt*100)/100;
  const rows=[
   ['Temperature zone',zone,''],
   ['Reefer transport',wt+'kg × '+dist+'km',''+inr(transport)],
   ['Cold storage ('+days+' days)','',inr(storage)],
   ['Total cold chain cost','',inr(total)],
   ['Normal freight (comparison)','',inr(normalFreight)],
   ['Cold chain premium','',inr(premium)]];
  return{rows,k1:inr(total),k2:inr(premium)+' over normal',k3:'₹'+perKg+'/kg'};}`});

/* 14. Vehicle Payload Calculator */
push({id:'vehicle-payload-calculator',name:'Vehicle Payload & GVW Calculator',
 short:'Legal payload capacity and overloading check.',
 intro:'Calculate legal payload capacity, gross vehicle weight and check if your load complies with axle load regulations to avoid overloading penalties.',
 seo:{title:'Vehicle Payload Calculator — GVW & Axle Load India | Varada Nexus',description:'Free vehicle payload calculator. Calculate legal payload, GVW and check axle load compliance for trucks in India under Motor Vehicles Act.',keywords:['vehicle payload calculator','truck gvw calculator','axle load calculator india']},
 inputs:[
  {id:'vehicle_type',label:'Vehicle type',type:'select',default:'12t',options:[{v:'lmv',t:'LMV / 3.5t GVW'},{v:'7t',t:'7 tonne truck'},{v:'12t',t:'12 tonne truck'},{v:'25t',t:'25 tonne truck (6-wheel)'},{v:'40t',t:'40 tonne (multi-axle)'}]},
  {id:'tare_weight',label:'Tare weight / unladen weight (kg)',type:'number',default:8500,min:500},
  {id:'cargo_weight',label:'Cargo weight to load (kg)',type:'number',default:10000,min:0},
  {id:'fuel_water',label:'Fuel, water, driver weight (kg)',type:'number',default:500,min:0}],
 results:{rowFmt:'raw',columns:['Parameter','Legal Limit','Actual'],kpis:[{key:'k1',label:'Load status',format:'text'},{key:'k2',label:'Overloading by',format:'text'},{key:'k3',label:'Legal payload',format:'text'}]},
 assumptions:'GVW limits (approx): LMV 3,500kg; 7t truck 7,000kg; 12t truck 12,000kg; 25t 25,000kg; 40t 40,000kg. Legal payload = GVW − tare − fuel/driver weight. Overloading fine in India: ₹20,000 + ₹2,000/extra tonne.',
 faq:[
  {q:'What is the overloading penalty in India?',a:'Under the Motor Vehicles Act amendment 2019, overloading fine is ₹20,000 for the first offence and ₹2,000 per extra tonne. Vehicles can be detained until excess load is removed.'},
  {q:'What is GVW?',a:'GVW (Gross Vehicle Weight) is the maximum permissible total weight of a vehicle — including the vehicle itself, fuel, driver, passengers and cargo. Exceeding GVW is overloading.'},
  {q:'How is payload calculated?',a:'Payload = GVW − Kerb weight (tare weight + fuel + driver). Always check the RC book for the vehicle\'s registered GVW limit and tare weight.'}],
 logic:`const GVW={lmv:3500,7:7000,12:12000,25:25000,40:40000};
const KT={'lmv':3500,'7t':7000,'12t':12000,'25t':25000,'40t':40000};
export function compute(v){
  const vtype=v.vehicle_type||'12t',tare=+v.tare_weight||8500,cargo=+v.cargo_weight||0,fw=+v.fuel_water||500;
  const gvwLimit=KT[vtype]||12000;
  const legalPayload=Math.max(0,gvwLimit-tare-fw);
  const actualGVW=tare+cargo+fw;
  const overload=Math.max(0,actualGVW-gvwLimit);
  const status=overload>0?'⚠️ OVERLOADED':'✅ Within limit';
  const rows=[
   ['GVW limit',gvwLimit+'kg','—'],
   ['Tare / unladen weight','—',tare+'kg'],
   ['Fuel + water + driver','—',fw+'kg'],
   ['Cargo','—',cargo+'kg'],
   ['Actual GVW','—',actualGVW+'kg'],
   ['Legal payload',legalPayload+'kg','—'],
   ['Overloading',overload>0?overload+'kg OVER':'—','']];
  return{rows,k1:status,k2:overload>0?overload+'kg':'None ✅',k3:legalPayload+'kg'};}`});

/* 15. Transport Compliance Checklist */
push({id:'transport-compliance-checklist',name:'Transport & Logistics Compliance Checklist',kind:'checklist',
 short:'Vehicle, driver and freight compliance audit.',
 intro:'Audit your transport and logistics operation against key compliance requirements including vehicle fitness, driver licences, insurance, permits and freight documentation.',
 seo:{title:'Transport Compliance Checklist India — Logistics Audit | Varada Nexus',description:'Free transport compliance checklist India. Audit vehicle fitness, driver licences, insurance, permits and freight documentation for logistics operations.',keywords:['transport compliance checklist india','logistics audit checklist','truck compliance checklist']},
 buttonLabel:'Run Transport Compliance Audit',
 checklist:[
  {name:'1. Vehicle Documents',items:[
   {id:'v1',text:'Registration Certificate (RC) valid and not expired',critical:true},
   {id:'v2',text:'Fitness Certificate (FC) valid',critical:true},
   {id:'v3',text:'Motor Vehicles Insurance (Third Party + Own Damage)',critical:true},
   {id:'v4',text:'National Permit / State Permit valid',critical:true},
   {id:'v5',text:'PUC (Pollution Under Control) certificate valid'}]},
  {name:'2. Driver Compliance',items:[
   {id:'d1',text:'Commercial Driving Licence (CDL) valid for vehicle class',critical:true},
   {id:'d2',text:'Driver medical fitness certificate current'},
   {id:'d3',text:'Driver rest hours compliant (max 8h driving, rest required)',critical:true},
   {id:'d4',text:'Speed governor / vehicle tracking unit (VTU) fitted and active'}]},
  {name:'3. Freight Documentation',items:[
   {id:'f1',text:'E-way bill generated for goods ≥₹50,000 value (GST)',critical:true},
   {id:'f2',text:'Lorry Receipt (LR) / consignment note issued',critical:true},
   {id:'f3',text:'Goods and Services Tax (GST) documents in order'},
   {id:'f4',text:'Dangerous goods declaration (if applicable)'}]},
  {name:'4. Load Compliance',items:[
   {id:'l1',text:'Load within permissible GVW limit',critical:true},
   {id:'l2',text:'Cargo properly secured to prevent shifting',critical:true},
   {id:'l3',text:'Hazardous cargo labelled per HMRT rules (if applicable)'},
   {id:'l4',text:'Oversized / ODC cargo with special permit (if applicable)'}]},
  {name:'5. Operational',items:[
   {id:'o1',text:'First aid kit, fire extinguisher and reflective triangles in vehicle'},
   {id:'o2',text:'Fleet maintenance records up to date'},
   {id:'o3',text:'GPS/vehicle tracking active and reporting'},
   {id:'o4',text:'Driver training records maintained'}]}],
 results:CHECKLIST_RESULTS,
 assumptions:'Based on Motor Vehicles Act 1988, Central Motor Vehicles Rules and GST E-way bill requirements. State-specific rules may add requirements.',
 faq:[
  {q:'What is an E-way bill?',a:'An E-way bill is an electronic document generated on the GST portal for movement of goods worth more than ₹50,000. It is mandatory for interstate transport and for intrastate movement in most states.'},
  {q:'What permits does a truck need for interstate transport?',a:'For interstate goods transport: National Permit from the MV Department, RC, FC, insurance, PUC and driver\'s commercial licence. Goods requiring special handling (chemicals, food, pharma) may need additional permits.'},
  {q:'What are the penalties for driving without a fitness certificate?',a:'Driving without a valid FC attracts a fine and vehicle detention. For commercial vehicles, the fine can be up to ₹10,000. Repeat offences can lead to suspension of the vehicle permit.'}],
 logic:CHECKLIST_LOGIC});

/* 16. Inventory Turnover Calculator */
push({id:'inventory-turnover-calculator',name:'Inventory Turnover & Days Calculator',
 short:'Inventory turnover ratio, DIO and carrying cost.',
 intro:'Calculate inventory turnover ratio, days inventory outstanding (DIO), inventory carrying cost and identify slow-moving stock.',
 seo:{title:'Inventory Turnover Calculator — DIO & Stock Efficiency | Varada Nexus',description:'Free inventory turnover calculator. Calculate inventory turnover ratio, days inventory outstanding and carrying cost for supply chain efficiency.',keywords:['inventory turnover calculator','days inventory outstanding calculator','stock turnover ratio india']},
 inputs:[
  {id:'cogs',label:'Cost of goods sold / COGS (₹/year)',type:'number',default:10000000,min:1},
  {id:'opening_inv',label:'Opening inventory (₹)',type:'number',default:2000000,min:0},
  {id:'closing_inv',label:'Closing inventory (₹)',type:'number',default:1800000,min:0},
  {id:'carrying_rate',label:'Inventory carrying cost rate (%/year)',type:'number',default:25,min:5,max:50}],
 results:{rowFmt:'raw',columns:['Metric','','Value'],kpis:[{key:'k1',label:'Inventory turnover ratio',format:'text'},{key:'k2',label:'Days inventory outstanding',format:'text'},{key:'k3',label:'Annual carrying cost',format:'text'}]},
 assumptions:'Average inventory = (opening + closing) ÷ 2. Turnover ratio = COGS ÷ average inventory. DIO = 365 ÷ turnover ratio. Carrying cost = average inventory × carrying rate.',
 faq:[
  {q:'What is a good inventory turnover ratio?',a:'Benchmarks vary by industry. FMCG/retail targets 6–12×; manufacturing 4–8×; engineering 2–4×. Higher is generally better — it means less capital tied up in stock.'},
  {q:'What is Days Inventory Outstanding (DIO)?',a:'DIO is the average number of days a company holds inventory before selling it. Lower DIO means faster-moving stock. DIO = 365 ÷ inventory turnover ratio.'},
  {q:'How do I improve inventory turnover?',a:'Improve demand forecasting, reduce safety stock where possible, implement ABC analysis (focus on fast movers), run promotions on slow movers, and negotiate shorter supplier lead times.'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const cogs=+v.cogs||10000000,oi=+v.opening_inv||2000000,ci=+v.closing_inv||1800000,cr=+v.carrying_rate||25;
  const avgInv=(oi+ci)/2;
  const turnover=Math.round(cogs/avgInv*10)/10;
  const dio=Math.round(365/turnover);
  const carryingCost=Math.round(avgInv*cr/100);
  const rows=[
   ['COGS',inr(cogs),''],
   ['Opening inventory',inr(oi),''],
   ['Closing inventory',inr(ci),''],
   ['Average inventory',inr(Math.round(avgInv)),''],
   ['Inventory turnover ratio',turnover+'× per year',''],
   ['Days inventory outstanding (DIO)',dio+' days',''],
   ['Inventory carrying cost ('+cr+'%/yr)',inr(carryingCost),'']];
  return{rows,k1:turnover+'×',k2:dio+' days',k3:inr(carryingCost)+'/yr'};}`});

/* 17. Shipment Tracking & ETA Calculator */
push({id:'shipment-eta-calculator',name:'Shipment ETA & Transit Time Calculator',
 short:'Expected delivery date from dispatch and transit time.',
 intro:'Calculate expected delivery date (ETA), factoring in transit time, customs clearance, weekends and buffer days for planning and customer communication.',
 seo:{title:'Shipment ETA Calculator — Expected Delivery Date | Varada Nexus',description:'Free shipment ETA calculator. Calculate expected delivery date from dispatch date, transit days, customs clearance and delivery buffer.',keywords:['shipment eta calculator','delivery date calculator','transit time calculator india']},
 inputs:[
  {id:'transit_days',label:'Transit / shipping days',type:'number',default:5,min:0},
  {id:'customs_days',label:'Customs clearance days (if applicable)',type:'number',default:0,min:0},
  {id:'last_mile_days',label:'Last-mile delivery days',type:'number',default:1,min:0},
  {id:'buffer_days',label:'Buffer / contingency days',type:'number',default:1,min:0},
  {id:'working_days_only',label:'Count working days only?',type:'select',default:'no',options:[{v:'yes',t:'Yes (Mon–Sat)'},{v:'no',t:'No (calendar days)'}]}],
 results:{rowFmt:'raw',columns:['Stage','Days','Cumulative'],kpis:[{key:'k1',label:'Total transit days',format:'text'},{key:'k2',label:'ETA (days from dispatch)',format:'text'},{key:'k3',label:'Recommended promise date',format:'text'}]},
 assumptions:'Working days = 6 days/week (Mon–Sat). Calendar days include all days. Recommended promise date adds buffer to ETA. Customs clearance assumed 0 for domestic.',
 faq:[
  {q:'What is transit time vs lead time?',a:'Transit time is the time goods are physically in motion. Lead time (order to delivery) includes order processing, production, transit and customs clearance. ETA is calculated from dispatch.'},
  {q:'How do I communicate ETA to customers?',a:'Share a range (best case to worst case), be proactive about delays, share tracking information and provide a single point of contact. Surprising customers with delays damages more trust than an upfront longer ETA.'},
  {q:'What causes transit time delays in India?',a:'Common causes: port congestion, transshipment delays, customs holds, document errors, inland transport delays and weather. Budget extra days for festive seasons and year-end.'}],
 logic:`export function compute(v){
  const tr=+v.transit_days||0,cu=+v.customs_days||0,lm=+v.last_mile_days||0,buf=+v.buffer_days||1,wdo=v.working_days_only==='yes';
  const calDays=tr+cu+lm;
  const etaDays=wdo?Math.ceil(calDays/6*7):calDays;
  const promiseDays=etaDays+buf;
  const stages=[['Transit / shipping',tr,tr],['Customs clearance',cu,tr+cu],['Last-mile delivery',lm,calDays]];
  const rows=stages.map(([n,d,c])=>[n,d+' days',c+' days']);
  rows.push(['Buffer','',buf+' days']);
  const note=wdo?' (working days, Mon–Sat)':' (calendar days)';
  return{rows,k1:calDays+' days'+note,k2:etaDays+' days from dispatch',k3:promiseDays+' days from dispatch'};}`});

/* 18. Logistics KPI Dashboard */
push({id:'logistics-kpi-dashboard',name:'Logistics KPI Dashboard',
 short:'Key logistics performance metrics: OTIF, fill rate, cost per order.',
 intro:'Calculate key logistics KPIs including on-time in-full (OTIF) delivery rate, order fill rate, cost per order and return rate for supply chain performance reporting.',
 seo:{title:'Logistics KPI Dashboard — OTIF Fill Rate Cost Per Order | Varada Nexus',description:'Free logistics KPI calculator. Compute OTIF, order fill rate, cost per order, return rate and perfect order index for supply chain performance.',keywords:['logistics kpi calculator','otif calculator','order fill rate calculator supply chain']},
 inputs:[
  {id:'total_orders',label:'Total orders dispatched (month)',type:'number',default:500,min:1},
  {id:'on_time',label:'Orders delivered on time',type:'number',default:440,min:0},
  {id:'in_full',label:'Orders delivered in full (correct qty)',type:'number',default:475,min:0},
  {id:'damage_free',label:'Orders delivered damage-free',type:'number',default:490,min:0},
  {id:'total_logistics_cost',label:'Total monthly logistics cost (₹)',type:'number',default:500000,min:0},
  {id:'returns',label:'Orders returned',type:'number',default:15,min:0}],
 results:{rowFmt:'raw',columns:['KPI','Value','Benchmark'],kpis:[{key:'k1',label:'OTIF rate',format:'text'},{key:'k2',label:'Perfect order index',format:'text'},{key:'k3',label:'Cost per order',format:'text'}]},
 assumptions:'OTIF = (on-time AND in-full orders) ÷ total orders × 100. Perfect Order Index = (on-time × in-full × damage-free) ÷ total³. Return rate = returns ÷ total orders.',
 faq:[
  {q:'What is OTIF?',a:'OTIF (On-Time In-Full) measures the percentage of orders delivered both on time AND in the correct quantity. It is the gold standard logistics KPI for supply chain reliability.'},
  {q:'What is a good OTIF rate?',a:'Best-in-class companies achieve 95%+ OTIF. 85–90% is average for most Indian logistics operations. Below 80% indicates significant supply chain reliability issues.'},
  {q:'What is the Perfect Order Index?',a:'Perfect Order Index measures orders that are on-time, in-full, damage-free and with correct documentation. It is a composite metric; achieving 90%+ across all dimensions is world-class.'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const tot=+v.total_orders||500,ot=+v.on_time||0,inf=+v.in_full||0,df=+v.damage_free||0,cost=+v.total_logistics_cost||0,ret=+v.returns||0;
  const otif=Math.round(Math.min(ot,inf)/tot*100*10)/10;
  const poi=Math.round((ot/tot)*(inf/tot)*(df/tot)*100*10)/10;
  const cpo=tot>0?Math.round(cost/tot):0;
  const returnRate=Math.round(ret/tot*100*10)/10;
  const rows=[
   ['Total orders',tot,'—'],
   ['On-time delivery rate',Math.round(ot/tot*100)+'%','Target: ≥95%'],
   ['In-full delivery rate',Math.round(inf/tot*100)+'%','Target: ≥98%'],
   ['Damage-free rate',Math.round(df/tot*100)+'%','Target: ≥99%'],
   ['OTIF rate',otif+'%','Target: ≥90%'],
   ['Perfect Order Index',poi+'%','Target: ≥85%'],
   ['Cost per order',inr(cpo),'Benchmark: varies'],
   ['Return rate',returnRate+'%','Target: <2%']];
  return{rows,k1:otif+'%',k2:poi+'%',k3:inr(cpo)+'/order'};}`});

const n=writeTools(T);
console.log('Transportation & logistics tools written:',n);
