import { writeTools, CHECKLIST_LOGIC, CHECKLIST_RESULTS, D } from './_seedlib.mjs';
const REL=[{label:'Interior Design Services',url:'/services.html'},{label:'Contact Us',url:'/contact.html'}];
const T=[];
const push=o=>{o.cat='interior-design';o.related=o.related||REL;T.push(o);};
const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
const sqft=n=>Math.round(n).toLocaleString('en-IN')+' sq ft';

/* 1. Interior Design Cost Estimator */
push({id:'interior-design-cost-estimator',name:'Interior Design Cost Estimator',
 short:'Total interior design budget by area and finish level.',
 intro:'Estimate the total interior design and fit-out cost for a residential or commercial space based on carpet area and finish level.',
 seo:{title:'Interior Design Cost Estimator — Fit-out Budget Calculator India | Varada Nexus',description:'Free interior design cost estimator. Calculate fit-out budget for homes and offices by area and finish level — basic, standard or premium.',keywords:['interior design cost calculator','home interior cost india','interior fit out budget']},
 inputs:[
  {id:'area',label:'Carpet area (sq ft)',type:'number',default:1000,min:100},
  {id:'type',label:'Space type',type:'select',default:'home',options:[{v:'home',t:'Residential / Home'},{v:'office',t:'Commercial / Office'},{v:'retail',t:'Retail / Showroom'},{v:'hospital',t:'Healthcare / Hospital'}]},
  {id:'finish',label:'Finish level',type:'select',default:'standard',options:[{v:'basic',t:'Basic (₹800–1,200/sq ft)'},{v:'standard',t:'Standard (₹1,500–2,200/sq ft)'},{v:'premium',t:'Premium (₹2,500–4,000/sq ft)'},{v:'luxury',t:'Luxury (₹4,500+/sq ft)'}]}],
 results:{rowFmt:'raw',columns:['Category','Share','Budget'],kpis:[{key:'k1',label:'Total fit-out cost',format:'text'},{key:'k2',label:'Per sq ft',format:'text'},{key:'k3',label:'Design fee (10%)',format:'text'}]},
 assumptions:'Rate ranges: basic ₹1,000, standard ₹1,800, premium ₹3,200, luxury ₹5,000 per sq ft. Commercial and healthcare spaces cost 15–30% more than residential at same finish level. Split: civil/flooring 30%, furniture 30%, electrical/lighting 15%, false ceiling 10%, furnishings 10%, design fee 5%.',
 faq:[
  {q:'What is the average interior design cost per sq ft in India?',a:'Basic finishes run ₹800–1,200/sq ft, standard ₹1,500–2,200, premium ₹2,500–4,000 and luxury ₹4,500+ for a fully furnished and fit-out home.'},
  {q:'Is the design fee included in this estimate?',a:'This tool shows design fee as a separate 10% line. Interior designers in India typically charge 8–15% of project cost or a fixed fee per sq ft.'},
  {q:'Does this include civil construction?',a:'Yes — fit-out includes civil modifications, flooring, electrical, false ceiling, furniture and furnishings but excludes structural changes and external works.'}],
 logic:`const RATES={home:{basic:1000,standard:1800,premium:3200,luxury:5000},office:{basic:1200,standard:2200,premium:3800,luxury:6000},retail:{basic:1300,standard:2400,premium:4000,luxury:6500},hospital:{basic:1500,standard:2600,premium:4200,luxury:7000}};
const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const a=+v.area||1000,t=v.type||'home',f=v.finish||'standard';
  const rate=(RATES[t]||RATES.home)[f]||1800;
  const total=a*rate;
  const rows=[['Civil work & flooring','30%',inr(total*0.30)],['Furniture & joinery','30%',inr(total*0.30)],['Electrical & lighting','15%',inr(total*0.15)],['False ceiling','10%',inr(total*0.10)],['Furnishings & décor','10%',inr(total*0.10)],['Design fee','~10%',inr(total*0.10)],['Total fit-out','',inr(total)]];
  return{rows,k1:inr(total),k2:inr(rate)+'/sq ft',k3:inr(Math.round(total*0.10))};}`});

/* 2. Wallpaper Cost Calculator */
push({id:'wallpaper-cost-calculator',name:'Wallpaper Cost Calculator',
 short:'Wallpaper rolls and total cost for any room.',
 intro:'Calculate the number of wallpaper rolls required and total cost for a room, accounting for pattern repeat and waste.',
 seo:{title:'Wallpaper Cost Calculator — Rolls & Budget Estimator | Varada Nexus',description:'Free wallpaper calculator. Estimate number of rolls and total wallpaper cost for any room size with pattern repeat and waste factor.',keywords:['wallpaper cost calculator','wallpaper rolls calculator','wallpaper estimator india']},
 inputs:[
  {id:'length',label:'Room length (ft)',type:'number',default:15,min:1},
  {id:'width',label:'Room width (ft)',type:'number',default:12,min:1},
  {id:'height',label:'Room height (ft)',type:'number',default:10,min:1},
  {id:'doors',label:'Doors & windows (count)',type:'number',default:2,min:0},
  {id:'roll_width',label:'Roll width (inches)',type:'number',default:21,min:12},
  {id:'roll_length',label:'Roll length (ft)',type:'number',default:33,min:10},
  {id:'pattern',label:'Pattern repeat (inches)',type:'number',default:0,min:0,hint:'0 = no repeat / plain'},
  {id:'price',label:'Price per roll (₹)',type:'number',default:1800,min:100}],
 results:{rowFmt:'raw',columns:['Item','','Value'],kpis:[{key:'k1',label:'Rolls required',format:'text'},{key:'k2',label:'Total cost',format:'text'},{key:'k3',label:'Wall area covered',format:'text'}]},
 assumptions:'Wall area = perimeter × height − (doors × windows × 20 sq ft each). Usable strips per roll = roll length ÷ (height + pattern repeat). Waste factor 10% added.',
 faq:[
  {q:'How many wallpaper rolls do I need for a 12×15 room?',a:'For a 12×15 ft room at 10 ft height with a 21-inch roll (33 ft long), you typically need 10–12 rolls depending on pattern repeat and number of openings.'},
  {q:'What is a pattern repeat in wallpaper?',a:'Pattern repeat is the vertical distance after which the design repeats. Higher repeat means more waste when matching patterns — add the repeat length to room height per strip.'},
  {q:'Should I order extra wallpaper rolls?',a:'Always order 10–15% extra for waste, pattern matching and future repairs — wallpaper dye lots vary and exact matches may not be available later.'}],
 logic:`export function compute(v){
  const L=+v.length||15,W=+v.width||12,H=+v.height||10,doors=+v.doors||2;
  const rw=(+v.roll_width||21)/12,rl=+v.roll_length||33,rep=(+v.pattern||0)/12,price=+v.price||1800;
  const wallArea=(2*(L+W)*H)-(doors*20);
  const stripsPerRoll=Math.floor(rl/(H+rep));
  const totalStrips=Math.ceil(wallArea/(H*(rw)));
  const rolls=Math.ceil(totalStrips/stripsPerRoll*1.10);
  const cost=rolls*price;
  const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
  const rows=[['Wall area (net)','',Math.round(wallArea)+' sq ft'],['Strips needed','',totalStrips],['Strips per roll','',stripsPerRoll],['Rolls (incl. 10% waste)','',rolls],['Price per roll','',inr(price)],['Total cost','',inr(cost)]];
  return{rows,k1:rolls+' rolls',k2:inr(cost),k3:Math.round(wallArea)+' sq ft'};}`});

/* 3. False Ceiling Cost Calculator */
push({id:'false-ceiling-cost-calculator',name:'False Ceiling Cost Calculator',
 short:'False ceiling area, material cost and installation estimate.',
 intro:'Estimate the cost of a false ceiling for any room based on area, ceiling type and finish, including material and labour.',
 seo:{title:'False Ceiling Cost Calculator — Gypsum & POP Ceiling Estimator | Varada Nexus',description:'Free false ceiling cost calculator. Estimate gypsum board, POP or metal false ceiling costs including material and installation for any room size.',keywords:['false ceiling cost calculator','gypsum ceiling cost','pop false ceiling estimate india']},
 inputs:[
  {id:'length',label:'Room length (ft)',type:'number',default:18,min:1},
  {id:'width',label:'Room width (ft)',type:'number',default:14,min:1},
  {id:'type',label:'Ceiling type',type:'select',default:'gypsum',options:[{v:'pop',t:'POP (₹60–80/sq ft)'},{v:'gypsum',t:'Gypsum board (₹80–110/sq ft)'},{v:'grid',t:'Grid/Mineral fibre (₹70–90/sq ft)'},{v:'wood',t:'Wooden / PVC (₹120–180/sq ft)'}]},
  {id:'design',label:'Design complexity',type:'select',default:'simple',options:[{v:'plain',t:'Plain flat'},{v:'simple',t:'Simple (1 level + coving)'},{v:'complex',t:'Complex (multi-level / coves)'}]}],
 results:{rowFmt:'raw',columns:['Item','Rate','Cost'],kpis:[{key:'k1',label:'Total ceiling cost',format:'text'},{key:'k2',label:'Per sq ft',format:'text'},{key:'k3',label:'Ceiling area',format:'text'}]},
 assumptions:'Rates include material and labour. Complexity multiplier: plain 1.0×, simple 1.2×, complex 1.5×. Lighting cutouts not included.',
 faq:[
  {q:'What is the cost of a gypsum false ceiling per sq ft?',a:'Gypsum board false ceiling costs ₹80–120 per sq ft including material and installation for a simple single-level design in India (2024).'},
  {q:'Which false ceiling type is best for homes?',a:'Gypsum board is most popular for homes (easy to paint, good finish), while grid/mineral fibre is preferred for offices (easy access to electrical above).'},
  {q:'Does false ceiling cost include lights?',a:'No — false ceiling estimates cover structure and boarding only; lights, fixtures and wiring are billed separately.'}],
 logic:`const RATES={pop:70,gypsum:95,grid:80,wood:150};
const MULT={plain:1.0,simple:1.2,complex:1.5};
const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const L=+v.length||18,W=+v.width||14,t=v.type||'gypsum',d=v.design||'simple';
  const area=L*W;
  const rate=(RATES[t]||95)*(MULT[d]||1.2);
  const mat=area*rate*0.55,labour=area*rate*0.45,total=area*rate;
  const rows=[['Ceiling area','',area+' sq ft'],['Material cost','55%',inr(mat)],['Labour & framing','45%',inr(labour)],['Total ceiling cost','',inr(total)]];
  return{rows,k1:inr(total),k2:inr(Math.round(rate))+'/sq ft',k3:area+' sq ft'};}`});

/* 4. Modular Kitchen Estimator */
push({id:'modular-kitchen-estimator',name:'Modular Kitchen Estimator',
 short:'Modular kitchen cost by cabinet count and finish.',
 intro:'Estimate the cost of a modular kitchen based on linear feet of cabinetry, material type and accessories.',
 seo:{title:'Modular Kitchen Estimator — Cost Calculator India | Varada Nexus',description:'Free modular kitchen cost estimator. Calculate modular kitchen budget by linear feet, material (HDF, plywood, PVC) and hardware level.',keywords:['modular kitchen cost calculator','modular kitchen estimate india','kitchen cabinet cost per linear foot']},
 inputs:[
  {id:'linear_ft',label:'Total linear feet of cabinets',type:'number',default:20,min:4},
  {id:'material',label:'Cabinet material',type:'select',default:'plywood',options:[{v:'hdf',t:'HDF / MDF (₹1,200–1,800/L ft)'},{v:'plywood',t:'Marine plywood (₹1,800–2,500/L ft)'},{v:'pvc',t:'PVC / WPC (₹1,500–2,200/L ft)'},{v:'solid',t:'Solid wood (₹3,500–5,000/L ft)'}]},
  {id:'shutter',label:'Shutter finish',type:'select',default:'acrylic',options:[{v:'laminate',t:'Laminate'},{v:'acrylic',t:'Acrylic / high-gloss'},{v:'membrane',t:'PU / membrane'},{v:'glass',t:'Glass / aluminium frame'}]},
  {id:'countertop',label:'Countertop',type:'select',default:'granite',options:[{v:'granite',t:'Granite (₹150–250/sq ft)'},{v:'quartz',t:'Quartz / engineered (₹300–500/sq ft)'},{v:'ss',t:'Stainless steel (₹250–400/sq ft)'}]}],
 results:{rowFmt:'raw',columns:['Component','','Cost'],kpis:[{key:'k1',label:'Total kitchen cost',format:'text'},{key:'k2',label:'Per linear foot',format:'text'},{key:'k3',label:'Countertop cost',format:'text'}]},
 assumptions:'Cabinet rates include carcass + shutter. Counter area ~ linear feet × 2 sq ft. Sink, fittings, chimney, hob and appliances excluded.',
 faq:[
  {q:'What is the cost of a modular kitchen in India per linear foot?',a:'Marine plywood kitchens with acrylic shutters cost ₹2,000–3,000 per linear foot; MDF with laminate starts at ₹1,200; solid wood premium kitchens ₹4,000–6,000.'},
  {q:'How many linear feet is a typical Indian kitchen?',a:'A standard 2BHK kitchen is typically 10–14 linear feet; 3BHK kitchens are 14–20 linear feet of cabinetry (base + wall units combined).'},
  {q:'Are appliances included in modular kitchen cost?',a:'No — modular kitchen estimates cover cabinetry, shutters, countertop and hardware. Chimney, hob, dishwasher and refrigerator are separate budgets.'}],
 logic:`const CAB={hdf:1500,plywood:2200,pvc:1800,solid:4200};
const SHUT={laminate:0,acrylic:300,membrane:200,glass:400};
const CTOP={granite:200,quartz:400,ss:300};
const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const lf=+v.linear_ft||20,mat=v.material||'plywood',shut=v.shutter||'acrylic',ct=v.countertop||'granite';
  const ratePerLf=(CAB[mat]||2200)+(SHUT[shut]||300);
  const cabCost=lf*ratePerLf;
  const ctArea=lf*2;
  const ctCost=ctArea*(CTOP[ct]||200);
  const hardware=cabCost*0.15;
  const total=cabCost+ctCost+hardware;
  const rows=[['Carcass & shutters ('+lf+' L ft)','',inr(cabCost)],['Countertop (~'+ctArea+' sq ft)','',inr(ctCost)],['Handles, hinges & hardware','~15%',inr(Math.round(hardware))],['Total','',inr(Math.round(total))]];
  return{rows,k1:inr(Math.round(total)),k2:inr(Math.round(total/lf))+'/L ft',k3:inr(ctCost)};}`});

/* 5. Wardrobe Cost Calculator */
push({id:'wardrobe-cost-calculator',name:'Wardrobe Cost Calculator',
 short:'Wardrobe cost by size, material and fitting type.',
 intro:'Estimate the cost of a custom wardrobe based on size, material and internal fittings.',
 seo:{title:'Wardrobe Cost Calculator — Custom Built-in Wardrobe Estimate | Varada Nexus',description:'Free wardrobe cost calculator. Estimate built-in wardrobe cost by size, material, shutter type and internal accessories for homes in India.',keywords:['wardrobe cost calculator','built in wardrobe cost india','almirah cost estimate']},
 inputs:[
  {id:'width',label:'Wardrobe width (ft)',type:'number',default:6,min:1},
  {id:'height',label:'Height (ft)',type:'number',default:8,min:4},
  {id:'depth',label:'Depth (ft)',type:'number',default:2,min:1},
  {id:'material',label:'Material',type:'select',default:'plywood',options:[{v:'hdf',t:'HDF/MDF'},{v:'plywood',t:'Marine plywood'},{v:'solid',t:'Solid wood'}]},
  {id:'shutter',label:'Shutter type',type:'select',default:'sliding',options:[{v:'swing',t:'Swing door'},{v:'sliding',t:'Sliding door'},{v:'glass',t:'Glass / mirror sliding'}]}],
 results:{rowFmt:'raw',columns:['Item','','Cost'],kpis:[{key:'k1',label:'Total wardrobe cost',format:'text'},{key:'k2',label:'Per sq ft (face)',format:'text'},{key:'k3',label:'Face area',format:'text'}]},
 assumptions:'Cost = face area × rate/sq ft. HDF swing ~₹1,000/sq ft, plywood sliding ~₹1,600, solid glass ~₹2,800. Internal fittings (loft, drawers, trouser rack) add 20%.',
 faq:[
  {q:'What is the cost of a 6 ft wardrobe in India?',a:'A 6×8 ft plywood wardrobe with sliding doors costs ₹55,000–90,000; MDF with swing doors ₹35,000–55,000; solid wood ₹1,20,000–2,00,000 depending on internal fittings.'},
  {q:'Sliding vs swing wardrobe — which is better for small rooms?',a:'Sliding wardrobes are better for rooms with limited floor space in front of the wardrobe; swing doors need 2–2.5 ft of clearance.'},
  {q:'Should I choose plywood or MDF for a wardrobe?',a:'Plywood is more durable and moisture-resistant, recommended in humid climates. MDF gives a smoother finish but is heavier and less moisture-tolerant.'}],
 logic:`const RATES={hdf:{swing:1000,sliding:1200,glass:1600},plywood:{swing:1400,sliding:1700,glass:2200},solid:{swing:2200,sliding:2600,glass:3200}};
const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const w=+v.width||6,h=+v.height||8,mat=v.material||'plywood',shut=v.shutter||'sliding';
  const face=w*h;
  const rate=(RATES[mat]||RATES.plywood)[shut]||1700;
  const base=face*rate;
  const fittings=base*0.20;
  const total=base+fittings;
  const rows=[['Face area',w+'×'+h+' ft',face+' sq ft'],['Base rate','',inr(rate)+'/sq ft'],['Carcass & shutters','',inr(base)],['Internal fittings','~20%',inr(Math.round(fittings))],['Total','',inr(Math.round(total))]];
  return{rows,k1:inr(Math.round(total)),k2:inr(rate)+'/sq ft',k3:face+' sq ft'};}`});

/* 6. Lighting Planner */
push({id:'interior-lighting-planner',name:'Interior Lighting Planner',
 short:'Lux, wattage and fixture count for any room.',
 intro:'Calculate the number of light fixtures, total wattage and electricity cost for any room based on area, ceiling height and usage type.',
 seo:{title:'Interior Lighting Planner — Lux, Fixtures & Wattage Calculator | Varada Nexus',description:'Free interior lighting planner. Calculate number of fixtures, total wattage and light budget for rooms based on lux requirements and area.',keywords:['interior lighting calculator','lux calculator room','light fixture planner india']},
 inputs:[
  {id:'length',label:'Room length (ft)',type:'number',default:15,min:1},
  {id:'width',label:'Room width (ft)',type:'number',default:12,min:1},
  {id:'height',label:'Ceiling height (ft)',type:'number',default:10,min:7},
  {id:'usage',label:'Room usage',type:'select',default:'living',options:[{v:'bedroom',t:'Bedroom (150 lux)'},{v:'living',t:'Living room (200 lux)'},{v:'kitchen',t:'Kitchen (300 lux)'},{v:'office',t:'Office / Study (500 lux)'},{v:'hospital',t:'Hospital corridor (200 lux)'},{v:'ot',t:'OT / Exam room (1000 lux)'}]},
  {id:'fixture_w',label:'Fixture wattage (W)',type:'number',default:12,min:1,hint:'LED downlight: 9–15W typical'}],
 results:{rowFmt:'raw',columns:['Parameter','','Value'],kpis:[{key:'k1',label:'Fixtures required',format:'text'},{key:'k2',label:'Total wattage',format:'text'},{key:'k3',label:'Annual electricity cost',format:'text'}]},
 assumptions:'Lumens per watt for LED: 90 lm/W. Room index used for utilisation coefficient (0.6–0.8). Lumens required = lux × area ÷ coefficient. Annual cost at ₹8/unit, 8 hrs/day, 300 days.',
 faq:[
  {q:'How many lights does a 12×15 room need?',a:'For a living room (200 lux), a 12×15 ft room needs roughly 8–12 LED downlights of 9–12W each, depending on ceiling height and lumen output.'},
  {q:'What is the right lux level for different rooms?',a:'Bedrooms: 100–150 lux; living rooms: 200–300 lux; kitchens: 300–500 lux; offices: 300–500 lux; OTs and exam rooms: 500–1,000 lux.'},
  {q:'Should I use warm white or cool white LEDs?',a:'Warm white (2700–3000K) suits bedrooms and living rooms; cool white (4000–5000K) is better for kitchens, offices and healthcare spaces.'}],
 logic:`const LUX={bedroom:150,living:200,kitchen:300,office:500,hospital:200,ot:1000};
const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const L=+v.length||15,W=+v.width||12,H=+v.height||10,fw=+v.fixture_w||12;
  const usage=v.usage||'living';
  const lux=LUX[usage]||200;
  const area=L*W;
  const lmPerW=90,uc=H>12?0.6:H>9?0.7:0.75;
  const totalLm=lux*area/uc;
  const perFixture=fw*lmPerW;
  const count=Math.ceil(totalLm/perFixture);
  const totalW=count*fw;
  const annualKwh=totalW/1000*8*300;
  const annualCost=annualKwh*8;
  const rows=[['Room area','',area+' sq ft'],['Required lumens','',Math.round(totalLm).toLocaleString('en-IN')+' lm'],['Lumens per fixture ('+fw+'W)','',Math.round(perFixture)+' lm'],['Fixtures needed','',count],['Total wattage','',totalW+' W'],['Annual electricity','8hr/day 300 days',inr(Math.round(annualCost))]];
  return{rows,k1:count+' fixtures',k2:totalW+' W',k3:inr(Math.round(annualCost))+'/yr'};}`});

/* 7. Furniture Budget Planner */
push({id:'furniture-budget-planner',name:'Furniture Budget Planner',
 short:'Room-by-room furniture budget for a home or office.',
 intro:'Plan a room-by-room furniture budget for a complete home or office fit-out, with indicative cost ranges by quality tier.',
 seo:{title:'Furniture Budget Planner — Room-by-Room Cost Estimator | Varada Nexus',description:'Free furniture budget planner. Estimate furniture costs room by room for a complete home or office fit-out — budget, standard or premium.',keywords:['furniture budget planner','home furniture cost india','furniture cost estimator']},
 inputs:[
  {id:'bhk',label:'Configuration',type:'select',default:'3bhk',options:[{v:'1bhk',t:'1 BHK'},{v:'2bhk',t:'2 BHK'},{v:'3bhk',t:'3 BHK'},{v:'villa',t:'4 BHK / Villa'},{v:'office_sm',t:'Small office (<20 seats)'},{v:'office_lg',t:'Large office (>50 seats)'}]},
  {id:'tier',label:'Quality tier',type:'select',default:'standard',options:[{v:'budget',t:'Budget / Economy'},{v:'standard',t:'Standard / Mid-range'},{v:'premium',t:'Premium'},{v:'luxury',t:'Luxury'}]}],
 results:{rowFmt:'raw',columns:['Room / Area','Items','Budget'],kpis:[{key:'k1',label:'Total furniture cost',format:'text'},{key:'k2',label:'Living room',format:'text'},{key:'k3',label:'Per room average',format:'text'}]},
 assumptions:'Indicative room budgets based on Indian market 2024. Includes essential furniture only; soft furnishings, lighting and décor accessories are separate.',
 faq:[
  {q:'What is the average furniture cost for a 3BHK in India?',a:'A standard mid-range 3BHK furniture budget runs ₹4–7 lakh; premium ₹8–15 lakh; luxury ₹18 lakh and above, excluding modular kitchen.'},
  {q:'Should I buy ready-made or custom furniture?',a:'Custom furniture gives better space utilisation for irregular rooms; ready-made is faster and easier to replace. Many homeowners combine both.'},
  {q:'Does this include mattresses and bed linen?',a:'Furniture estimates cover structural pieces. Mattresses, curtains, cushions, rugs and linen are soft-furnishing budgets estimated separately.'}],
 logic:`const PLANS={
'1bhk':{rooms:[['Living room','Sofa, TV unit, coffee table'],['Bedroom (1)','Bed, wardrobe, study table'],['Dining','Table + 4 chairs']],mult:[1.0,1.0,0.6]},
'2bhk':{rooms:[['Living room','Sofa set, TV unit, coffee table'],['Master bedroom','Bed, wardrobe'],['Bedroom 2','Bed, wardrobe'],['Dining','Table + 6 chairs']],mult:[1.0,1.0,0.8,0.7]},
'3bhk':{rooms:[['Living room','Sofa, TV unit, center table'],['Master bedroom','Bed, wardrobe, dresser'],['Bedroom 2','Bed, wardrobe'],['Bedroom 3','Bed, wardrobe'],['Dining','Table + 8 chairs'],['Pooja / study','Shelving, chair']],mult:[1.2,1.0,0.8,0.7,0.8,0.3]},
'villa':{rooms:[['Living room','Premium sofa, entertainment unit'],['Master bedroom','King bed, walk-in wardrobe'],['Bedroom 2-3 (each)','Beds, wardrobes'],['Bedroom 4','Bed, wardrobe'],['Dining','Table + 10 chairs'],['Study / library','Desk, bookshelf'],['Staff quarters','Basic']],mult:[2.0,1.5,1.2,1.0,1.2,0.8,0.3]},
'office_sm':{rooms:[['Director cabin','Exec desk, chair, meeting'],['Workstations (15)','Desks, chairs, pedestals'],['Meeting room','Table + 8 chairs'],['Reception','Desk, seating']],mult:[1.2,3.0,0.8,0.6]},
'office_lg':{rooms:[['Director + GM cabins','Executive furniture'],['Workstations (50+)','Desks, chairs'],['Board room','Premium table + chairs'],['Meeting rooms (3)','Tables + chairs'],['Reception / lobby','Designer furniture'],['Cafeteria','Tables, chairs']],mult:[2.5,8.0,2.0,1.5,1.5,1.0]}};
const BASE={budget:30000,standard:60000,premium:120000,luxury:250000};
const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const cfg=v.bhk||'3bhk',tier=v.tier||'standard';
  const P=PLANS[cfg]||PLANS['3bhk'];
  const base=BASE[tier]||60000;
  const items=P.rooms.map(([rm,desc],i)=>[rm,desc,inr(Math.round(base*P.mult[i]))]);
  const total=P.mult.reduce((s,m)=>s+base*m,0);
  return{rows:items,k1:inr(Math.round(total)),k2:inr(Math.round(base*P.mult[0])),k3:inr(Math.round(total/P.rooms.length))};}`});

/* 8. Flooring Cost Estimator */
push({id:'flooring-cost-estimator',name:'Flooring Cost Estimator',
 short:'Flooring material and installation cost by area.',
 intro:'Calculate total flooring cost for any space based on area, flooring type and subfloor condition.',
 seo:{title:'Flooring Cost Estimator — Tiles, Marble, Wood & Vinyl | Varada Nexus',description:'Free flooring cost calculator. Estimate material and installation cost for tiles, marble, hardwood, laminate and vinyl flooring.',keywords:['flooring cost calculator','tile flooring cost india','wood flooring estimate']},
 inputs:[
  {id:'area',label:'Floor area (sq ft)',type:'number',default:500,min:10},
  {id:'material',label:'Flooring material',type:'select',default:'vitrified',options:[{v:'ceramic',t:'Ceramic tile (₹40–80/sq ft)'},{v:'vitrified',t:'Vitrified tile (₹70–130/sq ft)'},{v:'marble',t:'Marble (₹120–400/sq ft)'},{v:'granite',t:'Granite (₹100–250/sq ft)'},{v:'laminate',t:'Laminate wood (₹80–150/sq ft)'},{v:'engineered',t:'Engineered wood (₹150–300/sq ft)'},{v:'vinyl',t:'Vinyl / SPC (₹60–120/sq ft)'}]},
  {id:'grade',label:'Grade',type:'select',default:'standard',options:[{v:'economy',t:'Economy'},{v:'standard',t:'Standard'},{v:'premium',t:'Premium'}]},
  {id:'wastage',label:'Wastage allowance (%)',type:'number',default:10,min:5,max:20}],
 results:{rowFmt:'raw',columns:['Item','','Cost'],kpis:[{key:'k1',label:'Total flooring cost',format:'text'},{key:'k2',label:'Per sq ft (all-in)',format:'text'},{key:'k3',label:'Material to order',format:'text'}]},
 assumptions:'Material cost: ceramic ₹55, vitrified ₹100, marble ₹250, granite ₹180, laminate ₹120, engineered ₹220, vinyl ₹90 (standard grade). Labour: ₹25–60/sq ft. Premium grade +50%.',
 faq:[
  {q:'What is the best flooring for Indian homes?',a:'Vitrified tiles are the most popular for durability, low maintenance and cost. Marble is preferred for luxury homes; engineered wood for bedrooms where warmth is desired.'},
  {q:'What is the labour cost for tile flooring in India?',a:'Labour for tile laying runs ₹25–50 per sq ft depending on tile size and design complexity; large format tiles (80×80 cm and above) cost more to lay.'},
  {q:'Why order 10% extra flooring?',a:'Wastage from cuts, breakage during installation and matching future repairs means ordering 10–15% extra is standard practice.'}],
 logic:`const MAT={ceramic:55,vitrified:100,marble:250,granite:180,laminate:120,engineered:220,vinyl:90};
const LAB={ceramic:30,vitrified:35,marble:55,granite:50,laminate:40,engineered:45,vinyl:25};
const GM={economy:0.75,standard:1.0,premium:1.5};
const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const a=+v.area||500,mat=v.material||'vitrified',grade=v.grade||'standard',waste=+v.wastage||10;
  const gm=GM[grade]||1;
  const matRate=(MAT[mat]||100)*gm;
  const labRate=(LAB[mat]||35);
  const orderArea=Math.ceil(a*(1+waste/100));
  const matCost=orderArea*matRate;
  const labCost=a*labRate;
  const total=matCost+labCost;
  const rows=[['Floor area','',a+' sq ft'],['Material to order (incl. '+waste+'% waste)','',orderArea+' sq ft'],['Material cost ('+inr(matRate)+'/sq ft)','',inr(matCost)],['Installation labour','',inr(labCost)],['Total','',inr(total)]];
  return{rows,k1:inr(total),k2:inr(Math.round(total/a))+'/sq ft',k3:orderArea+' sq ft'};}`});

/* 9. Curtain Fabric Calculator */
push({id:'curtain-fabric-calculator',name:'Curtain Fabric Calculator',
 short:'Fabric quantity and cost for curtains by window size.',
 intro:'Calculate the fabric yardage and cost for curtains based on window dimensions, fullness ratio and lining choice.',
 seo:{title:'Curtain Fabric Calculator — Fabric Quantity & Cost Estimator | Varada Nexus',description:'Free curtain fabric calculator. Estimate fabric quantity and total cost for curtains by window size, fullness and lining.',keywords:['curtain fabric calculator','curtain material estimator','curtain cost calculator india']},
 inputs:[
  {id:'windows',label:'Number of windows',type:'number',default:4,min:1},
  {id:'win_w',label:'Window width (ft)',type:'number',default:5,min:1},
  {id:'win_h',label:'Drop / length (ft)',type:'number',default:8,min:1},
  {id:'fullness',label:'Fullness ratio',type:'select',default:'2',options:[{v:'1.5',t:'1.5× (sheer, light)'},{v:'2',t:'2× (standard)'},{v:'2.5',t:'2.5× (pleated, full)'}]},
  {id:'lining',label:'Lining',type:'select',default:'yes',options:[{v:'no',t:'No lining'},{v:'yes',t:'Lining included'}]},
  {id:'fabric_price',label:'Fabric price per metre (₹)',type:'number',default:350,min:50}],
 results:{rowFmt:'raw',columns:['Item','','Value'],kpis:[{key:'k1',label:'Total fabric (metres)',format:'text'},{key:'k2',label:'Total cost',format:'text'},{key:'k3',label:'Per window cost',format:'text'}]},
 assumptions:'Fabric width assumed 54 inches (4.5 ft). Panels per window = 2. Fabric metres = (windows × 2 × width × fullness) ÷ fabric-width-in-ft × drop. Lining adds 25% to fabric cost. Stitching ~₹150/metre.',
 faq:[
  {q:'How much fabric do I need for a 5 ft wide window?',a:'For a 5 ft window with 2× fullness and 8 ft drop, you need about 4–4.5 metres of 54-inch wide fabric per pair of curtains.'},
  {q:'What is a fullness ratio for curtains?',a:'Fullness is how much wider the fabric is compared to the window. 1.5× is minimal; 2× is standard; 2.5–3× gives a luxurious gathered look.'},
  {q:'What is the average stitching cost for curtains in India?',a:'Curtain stitching costs ₹100–200 per metre for plain curtains; eyelet/pinch-pleat work costs ₹150–250 per metre depending on complexity.'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const wins=+v.windows||4,ww=+v.win_w||5,wh=+v.win_h||8;
  const full=+v.fullness||2,lined=v.lining==='yes',fp=+v.fabric_price||350;
  const fabricWidthFt=4.5;
  const panelsPerWin=2;
  const metresPerPanel=(ww/fabricWidthFt)*full*(wh/3.28);
  const totalMetres=Math.ceil(wins*panelsPerWin*metresPerPanel*1.05);
  const fabricCost=totalMetres*fp;
  const liningCost=lined?fabricCost*0.25:0;
  const stitching=totalMetres*150;
  const total=fabricCost+liningCost+stitching;
  const rows=[['Fabric required','',totalMetres+' metres'],['Fabric cost','',inr(fabricCost)],['Lining cost',lined?'incl.':'none',inr(liningCost)],['Stitching (~₹150/m)','',inr(stitching)],['Total','',inr(total)]];
  return{rows,k1:totalMetres+' m',k2:inr(total),k3:inr(Math.round(total/wins))};}`});

/* 10. Room Area Calculator */
push({id:'room-area-calculator',name:'Room Area & Material Calculator',
 short:'Floor, wall and ceiling area with material quantities.',
 intro:'Calculate floor area, total wall area, ceiling area and derived material quantities (tiles, paint, false ceiling) for any rectangular room.',
 seo:{title:'Room Area Calculator — Floor, Wall & Ceiling Area | Varada Nexus',description:'Free room area calculator. Calculate floor, wall and ceiling area and derive material quantities for tiles, paint and false ceiling.',keywords:['room area calculator','floor area calculator','wall area calculator india']},
 inputs:[
  {id:'length',label:'Room length (ft)',type:'number',default:15,min:1},
  {id:'width',label:'Room width (ft)',type:'number',default:12,min:1},
  {id:'height',label:'Height (ft)',type:'number',default:10,min:6},
  {id:'doors',label:'Door openings',type:'number',default:1,min:0},
  {id:'windows',label:'Window openings',type:'number',default:2,min:0}],
 results:{rowFmt:'raw',columns:['Surface','Area','Notes'],kpis:[{key:'k1',label:'Floor area',format:'text'},{key:'k2',label:'Net wall area',format:'text'},{key:'k3',label:'Ceiling area',format:'text'}]},
 assumptions:'Door opening ~21 sq ft (3×7 ft). Window opening ~12 sq ft (4×3 ft). Wall area = perimeter × height − openings. Paint coverage ~120 sq ft/litre (2 coats).',
 faq:[
  {q:'How do I calculate wall area for a room?',a:'Wall area = (2 × (length + width)) × height. Subtract door and window areas to get the net paintable or tile-able wall area.'},
  {q:'How much paint do I need for a 12×15 room?',a:'A 12×15 ft room with 10 ft ceiling has about 460 sq ft of net wall area. At 120 sq ft/litre for 2 coats, you need about 4 litres of wall paint plus separate ceiling paint.'},
  {q:'What is the difference between carpet area and floor area?',a:'In interior planning, floor area = length × width of the room. Carpet area (as defined by RERA) deducts wall thickness from built-up area — a different measurement.'}],
 logic:`export function compute(v){
  const L=+v.length||15,W=+v.width||12,H=+v.height||10,d=+v.doors||1,w=+v.windows||2;
  const floor=L*W,ceil=L*W;
  const grossWall=2*(L+W)*H;
  const openings=d*21+w*12;
  const netWall=Math.max(0,grossWall-openings);
  const paintLitres=Math.ceil(netWall/120);
  const tilesSqFt=Math.ceil(floor*1.10);
  const rows=[['Floor area','',floor+' sq ft'],['Ceiling area','',ceil+' sq ft'],['Gross wall area','',Math.round(grossWall)+' sq ft'],['Door + window openings','',openings+' sq ft'],['Net wall area','',Math.round(netWall)+' sq ft'],['Paint needed (2 coats)','@120 sq ft/L',paintLitres+' litres'],['Floor tiles to order','10% waste',tilesSqFt+' sq ft']];
  return{rows,k1:floor+' sq ft',k2:Math.round(netWall)+' sq ft',k3:ceil+' sq ft'};}`});

/* 11. Wood / Timber Requirement Calculator */
push({id:'wood-requirement-calculator',name:'Wood & Timber Requirement Calculator',
 short:'Timber volume and cost for furniture or construction.',
 intro:'Calculate the volume of wood or timber required for a carpentry project and estimate material cost based on wood type and grade.',
 seo:{title:'Wood & Timber Requirement Calculator — CFT & Cost Estimator | Varada Nexus',description:'Free wood requirement calculator. Estimate timber volume in cubic feet and cost for furniture, doors or structural wood work.',keywords:['wood requirement calculator','timber cost calculator india','cft wood calculator']},
 inputs:[
  {id:'pieces',label:'Number of pieces',type:'number',default:10,min:1},
  {id:'length',label:'Piece length (ft)',type:'number',default:7,min:0.5},
  {id:'width',label:'Piece width (inches)',type:'number',default:4,min:1},
  {id:'thickness',label:'Thickness (inches)',type:'number',default:2,min:0.5},
  {id:'wood',label:'Wood type',type:'select',default:'teak',options:[{v:'teak',t:'Teak (₹3,500–5,000/CFT)'},{v:'sal',t:'Sal / Shisham (₹1,800–2,800/CFT)'},{v:'pine',t:'Pine / Deodar (₹800–1,200/CFT)'},{v:'plywood',t:'Plywood sheet (₹90–180/sq ft)'},{v:'mdf',t:'MDF sheet (₹60–100/sq ft)'}]},
  {id:'price',label:'Price per CFT (₹)',type:'number',default:4000,min:100,hint:'1 CFT = 1 ft × 1 ft × 1 ft'}],
 results:{rowFmt:'raw',columns:['Item','','Value'],kpis:[{key:'k1',label:'Total volume (CFT)',format:'text'},{key:'k2',label:'Total wood cost',format:'text'},{key:'k3',label:'Per piece',format:'text'}]},
 assumptions:'1 CFT = 1 ft × 1 ft × 1 ft. Volume per piece = length × (width/12) × (thickness/12). Wastage 15% added for cutting. Sheet materials billed per sq ft.',
 faq:[
  {q:'How is timber volume calculated in CFT?',a:'Volume (CFT) = length (ft) × width (ft) × thickness (ft). For a 7 ft × 4 inch × 2 inch piece: 7 × (4/12) × (2/12) = 0.389 CFT.'},
  {q:'What is the price of teak wood in India?',a:'Teak (Sagwan) typically costs ₹3,000–6,000 per CFT depending on grade and region; premium Burma teak can go up to ₹8,000–12,000 per CFT.'},
  {q:'Why add 15% wastage for timber?',a:'Sawing, planning, defect removal and joint cutting typically waste 10–20% of rough timber volume; 15% is a standard allowance for carpentry work.'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const n=+v.pieces||10,L=+v.length||7,W=+v.width||4,T=+v.thickness||2,price=+v.price||4000;
  const volPer=L*(W/12)*(T/12);
  const netVol=volPer*n;
  const orderVol=netVol*1.15;
  const cost=orderVol*price;
  const rows=[['Volume per piece','',Math.round(volPer*1000)/1000+' CFT'],['Net volume ('+n+' pcs)','',Math.round(netVol*100)/100+' CFT'],['Order qty (15% waste)','',Math.round(orderVol*100)/100+' CFT'],['Unit price','',inr(price)+'/CFT'],['Total wood cost','',inr(Math.round(cost))]];
  return{rows,k1:Math.round(orderVol*10)/10+' CFT',k2:inr(Math.round(cost)),k3:inr(Math.round(cost/n))};}`});

/* 12. Office Interior Cost Calculator */
push({id:'office-interior-cost-calculator',name:'Office Interior Cost Calculator',
 short:'Office fit-out budget by area, seats and finish level.',
 intro:'Estimate the total interior fit-out cost for a commercial office space based on carpet area, number of seats and finish level.',
 seo:{title:'Office Interior Cost Calculator — Commercial Fit-out Budget | Varada Nexus',description:'Free office interior cost calculator. Estimate commercial office fit-out cost per sq ft and per seat for turnkey office interiors in India.',keywords:['office interior cost calculator','office fit out cost india','commercial interior cost per sq ft']},
 inputs:[
  {id:'area',label:'Office area (sq ft)',type:'number',default:2000,min:200},
  {id:'seats',label:'Number of workstations',type:'number',default:30,min:1},
  {id:'finish',label:'Finish level',type:'select',default:'standard',options:[{v:'basic',t:'Basic (₹700–900/sq ft)'},{v:'standard',t:'Standard (₹1,200–1,800/sq ft)'},{v:'premium',t:'Premium (₹2,000–3,000/sq ft)'}]},
  {id:'type',label:'Office type',type:'select',default:'mixed',options:[{v:'open',t:'Open plan'},{v:'mixed',t:'Mixed (open + cabins)'},{v:'cabin',t:'Full cabin layout'}]}],
 results:{rowFmt:'raw',columns:['Category','Share','Cost'],kpis:[{key:'k1',label:'Total fit-out cost',format:'text'},{key:'k2',label:'Per seat cost',format:'text'},{key:'k3',label:'Per sq ft',format:'text'}]},
 assumptions:'Rates: basic ₹800, standard ₹1,500, premium ₹2,500/sq ft. Cabin layout adds 20% over open plan. Category split: civil & flooring 25%, MEP & lighting 20%, furniture 30%, false ceiling 10%, IT infra 10%, misc 5%.',
 faq:[
  {q:'What is the cost to fit out an office in India per sq ft?',a:'Standard commercial office fit-out costs ₹1,200–1,800 per sq ft; premium Grade-A finish runs ₹2,000–3,500; basic fit-out ₹700–1,000.'},
  {q:'How much does one workstation cost in an office fit-out?',a:'A fully fitted workstation (desk, chair, partition, lighting, flooring share) costs ₹40,000–1,20,000 depending on finish level.'},
  {q:'What is included in an office fit-out?',a:'Typically: civil modifications, flooring, false ceiling, MEP (mechanical/electrical/plumbing), partition walls, furniture, IT cabling and lighting. Loose appliances and AV systems are usually separate.'}],
 logic:`const RATES={basic:800,standard:1500,premium:2500};
const TYPE_MULT={open:1.0,mixed:1.15,cabin:1.20};
const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const a=+v.area||2000,seats=+v.seats||30,f=v.finish||'standard',t=v.type||'mixed';
  const rate=(RATES[f]||1500)*(TYPE_MULT[t]||1.15);
  const total=a*rate;
  const cats=[['Civil & flooring',0.25],['MEP & lighting',0.20],['Furniture & workstations',0.30],['False ceiling',0.10],['IT infra & cabling',0.10],['Miscellaneous',0.05]];
  const rows=cats.map(([n,p])=>[n,Math.round(p*100)+'%',inr(Math.round(total*p))]);
  rows.push(['Total','',inr(Math.round(total))]);
  return{rows,k1:inr(Math.round(total)),k2:inr(Math.round(total/seats)),k3:inr(Math.round(rate))+'/sq ft'};}`});

/* 13. Hospital Interior Planner */
push({id:'hospital-interior-planner',name:'Hospital Interior Planner',
 short:'Interior fit-out cost for hospital zones by area.',
 intro:'Estimate the interior fit-out cost for different hospital zones (OPD, IPD wards, OT, reception, corridors) with healthcare-grade materials and compliance requirements.',
 seo:{title:'Hospital Interior Planner — Healthcare Fit-out Cost Calculator | Varada Nexus',description:'Free hospital interior planner. Estimate fit-out costs for OPD, IPD wards, OT and reception areas with healthcare-grade materials.',keywords:['hospital interior cost','healthcare interior fit out','hospital interior design cost india']},
 inputs:[
  {id:'opd_area',label:'OPD & consultation area (sq ft)',type:'number',default:3000,min:0},
  {id:'ward_area',label:'IPD wards & rooms (sq ft)',type:'number',default:5000,min:0},
  {id:'ot_area',label:'OT complex & ICU (sq ft)',type:'number',default:2000,min:0},
  {id:'reception',label:'Reception & lobby (sq ft)',type:'number',default:1000,min:0},
  {id:'corridor',label:'Corridors & common areas (sq ft)',type:'number',default:2000,min:0},
  {id:'finish',label:'Finish level',type:'select',default:'standard',options:[{v:'standard',t:'Standard NABH-compliant'},{v:'premium',t:'Premium (JCI / boutique hospital)'}]}],
 results:{rowFmt:'raw',columns:['Zone','Area','Cost'],kpis:[{key:'k1',label:'Total interior cost',format:'text'},{key:'k2',label:'OT complex cost',format:'text'},{key:'k3',label:'Per sq ft average',format:'text'}]},
 assumptions:'Zone rates (standard): OPD ₹1,400, ward ₹1,200, OT/ICU ₹3,500 (modular panels, epoxy, AHU provisions), reception ₹2,200, corridor ₹900/sq ft. Premium 1.5×.',
 faq:[
  {q:'What is the interior cost for a hospital OT in India?',a:'A modular OT fit-out including stainless steel panels, epoxy flooring, clean room provisions and AHU integration costs ₹3,000–6,000 per sq ft depending on specification.'},
  {q:'What makes hospital interiors more expensive than offices?',a:'Infection control requirements (seamless flooring, coving, antimicrobial surfaces), medical gas outlets, higher MEP density and compliance with NABH/AERB standards all add cost.'},
  {q:'Is epoxy flooring mandatory for hospitals?',a:'Not mandatory everywhere, but epoxy or polyurethane seamless flooring is strongly recommended for OTs, ICUs and sterile areas; regular tiles are acceptable for wards and OPD.'}],
 logic:`const RATES={standard:{opd:1400,ward:1200,ot:3500,reception:2200,corridor:900},premium:{opd:2100,ward:1800,ot:5200,reception:3300,corridor:1350}};
const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const f=v.finish||'standard';
  const R=RATES[f]||RATES.standard;
  const zones=[['OPD & consultation',+v.opd_area||3000,R.opd],['IPD wards & rooms',+v.ward_area||5000,R.ward],['OT complex & ICU',+v.ot_area||2000,R.ot],['Reception & lobby',+v.reception||1000,R.reception],['Corridors & common',+v.corridor||2000,R.corridor]];
  const rows=zones.map(([n,a,r])=>[n,a+' sq ft',inr(Math.round(a*r))]);
  const total=zones.reduce((s,[,a,r])=>s+a*r,0);
  const totalArea=zones.reduce((s,[,a])=>s+a,0);
  const otCost=(+v.ot_area||2000)*R.ot;
  rows.push(['Total','',inr(Math.round(total))]);
  return{rows,k1:inr(Math.round(total)),k2:inr(Math.round(otCost)),k3:inr(Math.round(total/totalArea))+'/sq ft'};}`});

/* 14. Home Renovation Budget Planner */
push({id:'home-renovation-budget',name:'Home Renovation Budget Planner',
 short:'Room-by-room renovation cost for an existing home.',
 intro:'Plan a renovation budget for an existing home, room by room, covering civil repairs, new flooring, paint, kitchen and bathroom upgrades.',
 seo:{title:'Home Renovation Budget Planner — Room-by-Room Estimate | Varada Nexus',description:'Free home renovation budget planner. Estimate room-by-room renovation costs for existing homes in India including civil, flooring and wet areas.',keywords:['home renovation budget','house renovation cost india','renovation cost calculator']},
 inputs:[
  {id:'area',label:'Total home area (sq ft)',type:'number',default:1200,min:200},
  {id:'bhk',label:'Configuration',type:'select',default:'2bhk',options:[{v:'1bhk',t:'1 BHK'},{v:'2bhk',t:'2 BHK'},{v:'3bhk',t:'3 BHK'},{v:'villa',t:'4 BHK / Villa'}]},
  {id:'scope',label:'Renovation scope',type:'select',default:'partial',options:[{v:'cosmetic',t:'Cosmetic (paint + minor fixes)'},{v:'partial',t:'Partial (flooring + kitchen + baths)'},{v:'full',t:'Full gut renovation'}]},
  {id:'age',label:'Home age (years)',type:'number',default:10,min:1}],
 results:{rowFmt:'raw',columns:['Work Item','','Budget'],kpis:[{key:'k1',label:'Total renovation cost',format:'text'},{key:'k2',label:'Per sq ft',format:'text'},{key:'k3',label:'Contingency (15%)',format:'text'}]},
 assumptions:'Cosmetic: ₹200–400/sq ft; partial: ₹500–900/sq ft; full gut: ₹1,000–1,800/sq ft. Old homes (>15 years) add 20% for hidden civil work.',
 faq:[
  {q:'What is the cost of full home renovation in India?',a:'Full gut renovation of a 1,200 sq ft apartment runs ₹12–22 lakh; partial renovation ₹6–11 lakh; cosmetic freshening ₹2–5 lakh.'},
  {q:'Why do renovation costs exceed estimates?',a:'Hidden plumbing and electrical issues, waterproofing failures and material price changes are common cost escalators in renovation projects — always keep a 15–20% contingency.'},
  {q:'Should I renovate before or after buying furniture?',a:'Always renovate first — civil work, flooring and paint must be done before furniture and soft furnishings are placed, as dust and debris will damage them.'}],
 logic:`const RATES={cosmetic:300,partial:700,full:1400};
const AGE_ADJ=age=>age>20?1.25:age>15?1.20:age>10?1.10:1.0;
const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
const ITEMS={cosmetic:[['Painting (walls + ceiling)',0.45],['Minor civil repairs',0.30],['Electrical fixes',0.15],['Plumbing fixes',0.10]],
partial:[['Flooring replacement',0.30],['Kitchen upgrade',0.25],['Bathroom renovation',0.20],['Painting',0.15],['Civil repairs',0.10]],
full:[['Civil demolition & rebuilding',0.25],['New flooring (all rooms)',0.20],['Kitchen (modular)',0.15],['Bathrooms (both)',0.15],['Electrical rewiring',0.10],['Plumbing',0.08],['Painting & finishing',0.07]]};
export function compute(v){
  const a=+v.area||1200,scope=v.scope||'partial',age=+v.age||10;
  const rate=(RATES[scope]||700)*AGE_ADJ(age);
  const total=a*rate;
  const contingency=total*0.15;
  const cats=ITEMS[scope]||ITEMS.partial;
  const rows=cats.map(([n,p])=>[n,'',inr(Math.round(total*p))]);
  rows.push(['Contingency (15%)','',inr(Math.round(contingency))]);
  return{rows,k1:inr(Math.round(total)),k2:inr(Math.round(rate))+'/sq ft',k3:inr(Math.round(contingency))};}`});

/* 15. Interior ROI Calculator */
push({id:'interior-roi-calculator',name:'Interior Design ROI Calculator',
 short:'Return on investment from a home or office interior upgrade.',
 intro:'Estimate the financial return on an interior design investment — whether for rental income increase, property value uplift or productivity gains from an office redesign.',
 seo:{title:'Interior Design ROI Calculator — Return on Investment | Varada Nexus',description:'Free interior ROI calculator. Estimate return on investment from home or office interior upgrades through rental yield, property value or productivity gains.',keywords:['interior design roi','home renovation return on investment','interior upgrade value calculator']},
 inputs:[
  {id:'investment',label:'Interior investment (₹ lakhs)',type:'number',default:15,min:1},
  {id:'type',label:'Property type',type:'select',default:'rental',options:[{v:'rental',t:'Rental property'},{v:'resale',t:'Resale / flip'},{v:'office',t:'Office (productivity)'}]},
  {id:'value_before',label:'Property value / rent before (₹ lakhs / month)',type:'number',default:80,min:1,hint:'For rental, enter monthly rent in ₹ lakhs'},
  {id:'value_after',label:'Expected value / rent after (₹ lakhs / month)',type:'number',default:95,min:1}],
 results:{rowFmt:'raw',columns:['Metric','','Value'],kpis:[{key:'k1',label:'Net value gain',format:'text'},{key:'k2',label:'ROI',format:'text'},{key:'k3',label:'Payback period',format:'text'}]},
 assumptions:'Rental ROI: annual rent increase × 20-year value. Resale ROI: direct uplift net of investment. Office ROI based on 10% productivity gain on assumed staff cost of ₹12L/seat/yr.',
 faq:[
  {q:'Does interior design increase property value?',a:'A well-executed premium interior can increase resale value by 10–20% for residential and 15–25% for commercial spaces, though market conditions dominate.'},
  {q:'What is the ROI of renovating a rental property?',a:'If interior investment increases monthly rent by ₹10,000 on a ₹15 lakh spend, payback is 12.5 years (rental basis); but property value uplift often makes total ROI positive in 5–7 years.'},
  {q:'Does office interior affect productivity?',a:'Research suggests a well-designed workplace (lighting, acoustics, ergonomics) can improve employee productivity by 5–15%, with measurable impact on retention and recruitment.'}],
 logic:`const inr=n=>'₹'+Math.round(n*100)/100+' L';
export function compute(v){
  const inv=+v.investment||15,t=v.type||'rental',vb=+v.value_before||80,va=+v.value_after||95;
  const gain=va-vb;
  let roi,payback,annualGain,rows;
  if(t==='rental'){
    annualGain=gain*12;
    roi=annualGain*15/inv*100;
    payback=inv/annualGain;
    rows=[['Monthly rent before','',inr(vb/100)+'L/mo'],['Monthly rent after','',inr(va/100)+'L/mo'],['Monthly rent increase','',inr(gain/100)+'L/mo'],['Annual rent increase','',inr(annualGain/100)],['Capitalised value gain (15× rent)','',inr(annualGain*15/100)],['Net ROI','',Math.round(roi)+'%']];
  }else if(t==='resale'){
    roi=(gain-inv)/inv*100;
    payback=inv/gain;
    rows=[['Value before','',inr(vb)],['Value after','',inr(va)],['Gross uplift','',inr(gain)],['Interior investment','',inr(inv)],['Net gain','',inr(gain-inv)],['ROI','',Math.round(roi)+'%']];
  }else{
    const productivity=inv*0.10*5;
    roi=productivity/inv*100;
    payback=inv/productivity*5;
    rows=[['Investment','',inr(inv)],['Productivity gain (10% × 5yr)','',inr(productivity)],['Net ROI over 5 years','',Math.round(roi)+'%']];
  }
  return{rows,k1:inr(gain),k2:Math.round(roi)+'%',k3:Math.round(payback*10)/10+' yrs'};}`});

/* 16. Design Timeline Planner */
push({id:'interior-design-timeline',name:'Interior Design Timeline Planner',
 short:'Week-by-week timeline for a home or office interior project.',
 intro:'Plan a realistic week-by-week timeline for a home or office interior design and fit-out project based on area and scope.',
 seo:{title:'Interior Design Timeline Planner — Project Schedule | Varada Nexus',description:'Free interior design timeline planner. Generate a week-by-week schedule for home or office interior projects from design to handover.',keywords:['interior design timeline','interior project schedule','home interior project plan']},
 inputs:[
  {id:'area',label:'Project area (sq ft)',type:'number',default:1500,min:100},
  {id:'type',label:'Project type',type:'select',default:'home',options:[{v:'home',t:'Home (new fit-out)'},{v:'reno',t:'Home renovation'},{v:'office',t:'Office fit-out'},{v:'hospital',t:'Hospital / healthcare'}]},
  {id:'scope',label:'Scope',type:'select',default:'full',options:[{v:'partial',t:'Partial (1–2 rooms)'},{v:'full',t:'Full home/office'},{v:'turnkey',t:'Turnkey (design + execution)'}]}],
 results:{rowFmt:'raw',columns:['Phase','Start','Duration'],kpis:[{key:'k1',label:'Total duration',format:'text'},{key:'k2',label:'On-site construction',format:'text'},{key:'k3',label:'Design phase',format:'text'}]},
 assumptions:'Timeline scales with area: +1 week per 500 sq ft above base. Hospital projects add 4 weeks for compliance documentation. Renovation adds 2 weeks for demolition.',
 faq:[
  {q:'How long does interior design take for a 1,500 sq ft home?',a:'A full turnkey interior for 1,500 sq ft typically takes 3–5 months — design 4–6 weeks, approvals/procurement 2–4 weeks, civil and carpentry 8–12 weeks, finishing 2–4 weeks.'},
  {q:'Why does interior design take so long?',a:'Custom furniture has 4–8 week lead times, tile and material selection adds 1–2 weeks, on-site work depends on crew size, and painting/finishing cannot be rushed due to drying time.'},
  {q:'How can I speed up my interior project?',a:'Finalise design decisions early, pay material advances upfront for faster delivery, run parallel workstreams (flooring, electrical, carpentry) where safe, and avoid design changes mid-execution.'}],
 logic:`const PHASES={home:{partial:[['Design & concept',1,3],['Procurement',4,2],['Civil & carpentry',6,6],['Painting & finishing',12,2],['Handover & styling',14,1]],full:[['Design & concept',1,4],['Procurement & material selection',5,3],['Civil & flooring',8,5],['Carpentry & joinery',8,6],['MEP & false ceiling',10,3],['Painting',14,2],['Furnishing & handover',16,2]],turnkey:[['Design & 3D visualisation',1,6],['Material finalisation',7,2],['Civil & structural',9,5],['Carpentry (custom)',9,8],['MEP & false ceiling',12,4],['Tile / flooring',14,3],['Painting',17,2],['Furniture & soft furnishings',19,3],['Snag fixing & handover',22,1]]},
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
  return{rows,k1:total+' weeks (~'+Math.round(total/4)+' months)',k2:onsite+' weeks',k3:design+' weeks'};}`});

/* 17. Interior Project Budget Planner */
push({id:'interior-project-budget-planner',name:'Interior Project Budget Planner',
 short:'Comprehensive interior project budget with all cost heads.',
 intro:'Create a complete interior project budget covering design fees, civil work, material, labour, furniture, MEP and contingency for a home or commercial project.',
 seo:{title:'Interior Project Budget Planner — Complete Cost Breakdown | Varada Nexus',description:'Free interior project budget planner. Create a comprehensive budget covering design fees, civil, material, furniture, MEP and contingency.',keywords:['interior project budget','interior design budget planner','home interior cost breakdown']},
 inputs:[
  {id:'area',label:'Project area (sq ft)',type:'number',default:1500,min:100},
  {id:'rate',label:'Base fit-out rate (₹/sq ft)',type:'number',default:1800,min:300,hint:'Use the Interior Design Cost Estimator to get this figure'},
  {id:'design_fee_pct',label:'Design fee (%)',type:'number',default:10,min:5,max:20},
  {id:'contingency_pct',label:'Contingency (%)',type:'number',default:12,min:5,max:25}],
 results:{rowFmt:'raw',columns:['Budget Head','%','Amount'],kpis:[{key:'k1',label:'Total project budget',format:'text'},{key:'k2',label:'Execution cost',format:'text'},{key:'k3',label:'Contingency reserved',format:'text'}]},
 assumptions:'Execution split: civil & flooring 28%, carpentry & joinery 25%, furniture 20%, MEP 15%, false ceiling 7%, décor & accessories 5%. Design fee and contingency calculated on execution cost.',
 faq:[
  {q:'How much contingency should I keep for an interior project?',a:'A 10–15% contingency is standard for interior projects; renovation projects on old buildings should keep 15–20% due to higher hidden-work risk.'},
  {q:'What is included in an interior design fee?',a:'Design fees cover concept drawings, 3D visualisation, working drawings for contractors, material specifications and supervision. Turnkey execution may be charged as a percentage of project cost.'},
  {q:'How do I control costs in an interior project?',a:'Lock in designs before execution begins, specify materials precisely in the BOQ, get 3 quotes from contractors, agree on a variation-order process and track spending weekly against budget.'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
const CATS=[['Civil work & flooring',0.28],['Carpentry & joinery',0.25],['Furniture (loose)',0.20],['MEP (electrical, plumbing)',0.15],['False ceiling',0.07],['Décor & accessories',0.05]];
export function compute(v){
  const a=+v.area||1500,rate=+v.rate||1800,dfp=+v.design_fee_pct||10,cp=+v.contingency_pct||12;
  const exec=a*rate;
  const designFee=exec*dfp/100;
  const contingency=exec*cp/100;
  const total=exec+designFee+contingency;
  const rows=CATS.map(([n,p])=>[n,Math.round(p*100)+'%',inr(Math.round(exec*p))]);
  rows.push(['Execution subtotal','100%',inr(Math.round(exec))]);
  rows.push(['Design fee',dfp+'%',inr(Math.round(designFee))]);
  rows.push(['Contingency',cp+'%',inr(Math.round(contingency))]);
  rows.push(['Total project budget','',inr(Math.round(total))]);
  return{rows,k1:inr(Math.round(total)),k2:inr(Math.round(exec)),k3:inr(Math.round(contingency))};}`});

/* 18. Material Quantity Estimator */
push({id:'material-quantity-estimator',name:'Interior Material Quantity Estimator',
 short:'Paint, tile, cement and sand quantities for a room.',
 intro:'Estimate the quantities of key interior materials — paint, tiles, cement, sand and putty — needed for a room renovation or new fit-out.',
 seo:{title:'Interior Material Quantity Estimator — Paint, Tile & Cement | Varada Nexus',description:'Free interior material quantity estimator. Calculate paint litres, tiles, cement bags and sand needed for room renovation or interior fit-out.',keywords:['interior material calculator','paint quantity calculator','tile cement sand estimator india']},
 inputs:[
  {id:'length',label:'Room length (ft)',type:'number',default:14,min:1},
  {id:'width',label:'Room width (ft)',type:'number',default:12,min:1},
  {id:'height',label:'Height (ft)',type:'number',default:10,min:6},
  {id:'doors',label:'Door openings',type:'number',default:1,min:0},
  {id:'windows',label:'Window openings',type:'number',default:2,min:0},
  {id:'tile_size',label:'Floor tile size',type:'select',default:'2x2',options:[{v:'1x1',t:'1×1 ft (small mosaic)'},{v:'2x2',t:'2×2 ft (standard)'},{v:'2x4',t:'2×4 ft (large format)'}]}],
 results:{rowFmt:'raw',columns:['Material','Quantity','Coverage basis'],kpis:[{key:'k1',label:'Wall paint (litres)',format:'text'},{key:'k2',label:'Floor tiles',format:'text'},{key:'k3',label:'Cement bags',format:'text'}]},
 assumptions:'Paint: 120 sq ft/litre (2 coats). Tiles: floor area +10% waste. Cement for tile laying: 1 bag per 10 sq ft floor, 1 bag per 8 sq ft wall. Sand: 0.5 cft per sq ft.',
 faq:[
  {q:'How many paint litres are needed for a 12×14 room?',a:'A 12×14 ft room at 10 ft height has ~460 sq ft of net wall area. At 120 sq ft per litre (2 coats), you need ~4 litres of wall paint plus ceiling paint.'},
  {q:'How do I calculate tile quantity for a room?',a:'Tiles needed = floor area ÷ tile area × 1.10 (10% waste). For a 12×14 ft room with 2×2 ft tiles: (168 sq ft ÷ 4 sq ft) × 1.10 = 47 tiles.'},
  {q:'How many cement bags are needed for tile flooring?',a:'For tile laying, roughly 1 bag of cement (50 kg) per 10 sq ft of floor and 1 bag per 8 sq ft of wall tiles is a standard estimate.'}],
 logic:`const TILE_AREA={'1x1':1,'2x2':4,'2x4':8};
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
  return{rows,k1:paintLitres+' L',k2:tilesNeeded+' tiles',k3:totalCement+' bags'};}`});

const n=writeTools(T);
console.log('Interior tools written:',n);
