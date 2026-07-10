import { writeTools, CHECKLIST_LOGIC, CHECKLIST_RESULTS, D } from './_seedlib.mjs';
const REL=[{label:'Import & Export Services',url:'/import-export.html'},{label:'Contact Us',url:'/contact.html'}];
const T=[];
const push=o=>{o.cat='import-export';o.related=o.related||REL;T.push(o);};

const inr=`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');`;

/* 1. Import Duty Calculator */
push({id:'import-duty-calculator',name:'Import Duty Calculator',
 short:'Calculate BCD, SWS and IGST on any import shipment',
 intro:'Estimate the complete import duty burden — Basic Customs Duty (BCD), Social Welfare Surcharge (SWS) and IGST — so you can plan pricing and cash flow before goods arrive.',
 seo:{title:'Import Duty Calculator India – BCD SWS IGST Estimator',description:'Calculate import duty, Social Welfare Surcharge and IGST on imported goods in India. Enter CIF value, BCD rate and IGST rate to get total duty payable.',keywords:['import duty calculator','BCD calculator India','IGST on imports','customs duty estimator','import tax India']},
 inputs:[
  {id:'cif_inr',label:'CIF Value (₹)',type:'number',default:500000,min:1000,hint:'Cost + Insurance + Freight in Indian Rupees (assessable value)'},
  {id:'bcd_rate',label:'Basic Customs Duty (%)',type:'number',default:10,min:0,max:150,hint:'BCD % as per HS code'},
  {id:'igst_rate',label:'IGST Rate (%)',type:'number',default:18,min:0,max:28,hint:'0, 5, 12, 18 or 28%'},
  {id:'quantity',label:'Quantity (units)',type:'number',default:100,min:1,hint:'For per-unit duty breakup'}],
 results:{rowFmt:'raw',columns:['Duty Component','Rate / Basis','Amount (₹)'],kpis:[{key:'k1',label:'Total Duty Payable',format:'text'},{key:'k2',label:'Effective Duty %',format:'text'},{key:'k3',label:'Duty Per Unit',format:'text'}]},
 assumptions:'SWS = 10% of BCD. IGST base = CIF + BCD + SWS. No exemptions or FTA benefits applied.',
 faq:[
  {q:'What is the assessable value for import duty?',a:'The assessable value is the CIF value of goods converted to INR at the applicable exchange rate declared by Customs.'},
  {q:'Is IGST on imports refundable?',a:'Yes. IGST paid on imports is available as ITC for GST-registered importers and can be offset against output GST.'},
  {q:'What is Social Welfare Surcharge?',a:'SWS is 10% of BCD, levied in addition to BCD. Are there exemptions from BCD? Yes — under FTAs and certain notifications BCD may be nil or concessional.'},
  {q:'Are there exemptions from BCD?',a:'Yes — under FTAs (ASEAN, UAE CEPA etc.), certain capital goods notifications and project imports, BCD may be nil or concessional. Check DGFT and Customs Tariff.'}],
 logic:`${inr}
export function compute(v){
  const cif=+v.cif_inr||500000,bcdR=+v.bcd_rate||10,igstR=+v.igst_rate||18,qty=+v.quantity||1;
  const bcd=Math.round(cif*bcdR/100);
  const sws=Math.round(bcd*0.10);
  const igstBase=cif+bcd+sws;
  const igst=Math.round(igstBase*igstR/100);
  const total=bcd+sws+igst;
  const effPct=Math.round(total/cif*1000)/10;
  const perUnit=Math.round(total/qty);
  return{
    rows:[
      ['Basic Customs Duty (BCD)',bcdR+'% of CIF',inr(bcd)],
      ['Social Welfare Surcharge (SWS)','10% of BCD',inr(sws)],
      ['IGST',igstR+'% of (CIF+BCD+SWS)',inr(igst)],
      ['Total Duty','',inr(total)]],
    k1:inr(total),k2:effPct+'%',k3:inr(perUnit)+'/unit'};
}`});

/* 2. Export Pricing Calculator */
push({id:'export-pricing-calculator',name:'Export Pricing Calculator',
 short:'Build FOB, CFR and CIF export prices from factory cost',
 intro:'Arrive at a competitive export price by stacking all costs — factory gate, inland freight, export clearance, sea freight and insurance — to arrive at FOB, CFR and CIF quotation values.',
 seo:{title:'Export Pricing Calculator – FOB CFR CIF Price Builder India',description:'Calculate FOB, CFR and CIF export prices from your factory cost. Add inland freight, customs clearance, sea freight and insurance for the right quotation.',keywords:['export pricing calculator','FOB price calculator','CIF price India','CFR export calculator','export quotation tool']},
 inputs:[
  {id:'exw',label:'Ex-Works Price per Unit (₹)',type:'number',default:1000,min:1},
  {id:'quantity',label:'Quantity (units)',type:'number',default:1000,min:1},
  {id:'inland_freight',label:'Inland Freight to Port (₹ total)',type:'number',default:15000,min:0},
  {id:'export_clearance',label:'Export Clearance & CHA (₹)',type:'number',default:8000,min:0},
  {id:'sea_freight',label:'Sea / Air Freight (₹ total)',type:'number',default:35000,min:0},
  {id:'insurance_pct',label:'Insurance (% of CIF)',type:'number',default:0.5,min:0,max:5}],
 results:{rowFmt:'raw',columns:['Component','Total (₹)','Per Unit (₹)'],kpis:[{key:'k1',label:'FOB / Unit',format:'text'},{key:'k2',label:'CFR / Unit',format:'text'},{key:'k3',label:'CIF / Unit',format:'text'}]},
 assumptions:'Insurance calculated on CIF value (single-pass approx). All amounts in INR.',
 faq:[
  {q:'What is the difference between FOB, CFR and CIF?',a:'FOB — seller pays until goods are on vessel. CFR — seller also pays sea freight. CIF — seller additionally covers marine insurance to destination port.'},
  {q:'How do I convert the CIF price to USD?',a:'Divide CIF (₹) by the prevailing USD/INR TT exchange rate. Add 1–2% buffer for bank charges.'},
  {q:'What costs go into export customs clearance?',a:'CHA fees, Shipping Bill filing, port handling, and any regulatory certificate costs (FSSAI, BIS, phytosanitary).'}],
 logic:`${inr}
export function compute(v){
  const exw=+v.exw||1000,qty=+v.quantity||1000;
  const inland=+v.inland_freight||15000,clear=+v.export_clearance||8000;
  const freight=+v.sea_freight||35000,insR=+v.insurance_pct||0.5;
  const fobTotal=exw*qty+inland+clear;
  const cfrTotal=fobTotal+freight;
  const cifTotal=cfrTotal/(1-insR/100);
  const ins=cifTotal-cfrTotal;
  return{
    rows:[
      ['EXW (factory)',inr(exw)+'/unit',inr(exw*qty)],
      ['Inland Freight','',inr(inland)],
      ['Export Clearance / CHA','',inr(clear)],
      ['Sea / Air Freight','',inr(freight)],
      ['Insurance',insR+'% of CIF',inr(ins)],
      ['CIF Total','',inr(cifTotal)]],
    k1:inr(fobTotal/qty)+'/unit',k2:inr(cfrTotal/qty)+'/unit',k3:inr(cifTotal/qty)+'/unit'};
}`});

/* 3. Customs Duty Estimator */
push({id:'customs-duty-estimator',name:'Customs Duty Estimator',
 short:'Quick customs cost including anti-dumping duty and compensation cess',
 intro:'Get a comprehensive customs duty estimate covering BCD, SWS, Anti-Dumping Duty and Compensation Cess to budget accurately for any import shipment.',
 seo:{title:'Customs Duty Estimator India – BCD ADD Cess Calculator',description:'Estimate total customs duty in India including BCD, SWS, Anti-Dumping Duty, Compensation Cess and IGST. Comprehensive import customs cost calculator.',keywords:['customs duty estimator','anti dumping duty calculator','compensation cess imports','total customs cost India','import customs calculator']},
 inputs:[
  {id:'cif_inr',label:'CIF Value (₹)',type:'number',default:800000,min:1000},
  {id:'bcd',label:'Basic Customs Duty (%)',type:'number',default:10,min:0,max:150},
  {id:'add_rate',label:'Anti-Dumping Duty (%)',type:'number',default:0,min:0,max:100,hint:'Enter 0 if not applicable'},
  {id:'cess_rate',label:'Compensation Cess (%)',type:'number',default:0,min:0,max:290,hint:'Applicable on sin / luxury goods'},
  {id:'igst_rate',label:'IGST Rate (%)',type:'number',default:18,min:0,max:28}],
 results:{rowFmt:'raw',columns:['Duty Head','Basis','Amount (₹)'],kpis:[{key:'k1',label:'Total Duty Payable',format:'text'},{key:'k2',label:'Effective Duty Rate',format:'text'},{key:'k3',label:'Landed Value',format:'text'}]},
 assumptions:'SWS = 10% of BCD. ADD on CIF value. Cess base = CIF + BCD + SWS. IGST base includes all duties.',
 faq:[
  {q:'What is Anti-Dumping Duty?',a:'ADD is imposed on imports sold below fair market value, harming domestic industry. It is notified by Ministry of Finance based on DGTR recommendations.'},
  {q:'When does Compensation Cess apply?',a:'Compensation Cess applies to coal, tobacco, aerated drinks, luxury cars and paan masala. Rates range from 5% to 290%.'},
  {q:'Is ADD the same for all countries?',a:'No. ADD rates vary by country of origin and exporter. Always check the latest DGTR notification for product-specific rates.'}],
 logic:`${inr}
export function compute(v){
  const cif=+v.cif_inr||800000,bcdR=+v.bcd||10,addR=+v.add_rate||0,cessR=+v.cess_rate||0,igstR=+v.igst_rate||18;
  const bcd=Math.round(cif*bcdR/100);
  const sws=Math.round(bcd*0.10);
  const add=Math.round(cif*addR/100);
  const cessBase=cif+bcd+sws;
  const cess=Math.round(cessBase*cessR/100);
  const igstBase=cif+bcd+sws+add+cess;
  const igst=Math.round(igstBase*igstR/100);
  const total=bcd+sws+add+cess+igst;
  const eff=Math.round(total/cif*1000)/10;
  return{
    rows:[
      ['BCD',bcdR+'%',inr(bcd)],
      ['SWS','10% of BCD',inr(sws)],
      ['Anti-Dumping Duty',addR+'%',inr(add)],
      ['Compensation Cess',cessR+'%',inr(cess)],
      ['IGST',igstR+'%',inr(igst)],
      ['Total Duty','',inr(total)]],
    k1:inr(total),k2:eff+'%',k3:inr(cif+total)};
}`});

/* 4. Container Utilization Calculator */
push({id:'container-utilization-calculator',name:'Container Utilization Calculator',
 short:'Maximise container fill and minimise dead freight costs',
 intro:'Calculate how efficiently you are filling a shipping container by comparing cargo CBM and weight against container capacity. Avoid under-loading and over-stuffing risks.',
 seo:{title:'Container Utilization Calculator – CBM Weight Fill Rate',description:'Calculate container utilization by CBM and weight. Supports 20ft, 40ft and 40ft HC containers. Determine if you need FCL or LCL shipping.',keywords:['container utilization calculator','CBM calculator shipping','20ft 40ft container capacity','FCL LCL calculator','container fill rate']},
 inputs:[
  {id:'container_type',label:'Container Type',type:'select',default:'40ft',options:[{v:'20ft',t:'20ft Standard (25 CBM / 21,700 kg)'},{v:'40ft',t:'40ft Standard (55 CBM / 26,500 kg)'},{v:'40hc',t:'40ft High Cube (67 CBM / 26,500 kg)'}]},
  {id:'cargo_cbm',label:'Cargo Volume (CBM)',type:'number',default:40,min:0.1},
  {id:'cargo_weight',label:'Cargo Weight (kg)',type:'number',default:15000,min:1},
  {id:'freight_rate',label:'Container Freight Rate (₹)',type:'number',default:120000,min:0}],
 results:{rowFmt:'raw',columns:['Metric','Your Cargo','Container Limit'],kpis:[{key:'k1',label:'Volume Utilization',format:'text'},{key:'k2',label:'Weight Utilization',format:'text'},{key:'k3',label:'Freight / CBM',format:'text'}]},
 assumptions:'Capacities: 20ft=25CBM/21,700kg; 40ft=55CBM/26,500kg; 40HC=67CBM/26,500kg. 85%+ utilization recommended for FCL.',
 faq:[
  {q:'What is the difference between FCL and LCL?',a:'FCL — you book the entire container. LCL — cargo is consolidated with others. FCL is generally cheaper per CBM above ~12–15 CBM.'},
  {q:'How do I calculate CBM?',a:'Measure length × width × height of each carton in metres, multiply by number of cartons. Add 5–10% buffer for pallets.'},
  {q:'What happens if I exceed the weight limit?',a:'Overloaded containers are rejected at port or attract heavy fines. Shipping lines strictly enforce payload limits.'}],
 logic:`${inr}
const CAP={
  '20ft':{cbm:25,kg:21700},
  '40ft':{cbm:55,kg:26500},
  '40hc':{cbm:67,kg:26500}};
export function compute(v){
  const ct=v.container_type||'40ft',cap=CAP[ct]||CAP['40ft'];
  const cbm=+v.cargo_cbm||40,wt=+v.cargo_weight||15000,fr=+v.freight_rate||120000;
  const vUtil=Math.round(cbm/cap.cbm*1000)/10;
  const wUtil=Math.round(wt/cap.kg*1000)/10;
  const perCbm=cbm>0?Math.round(fr/cbm):0;
  const status=vUtil>100||wUtil>100?'OVER LIMIT':vUtil>=85&&wUtil<=100?'Optimal':'Under-utilized';
  return{
    rows:[
      ['Volume (CBM)',cbm+' CBM',cap.cbm+' CBM'],
      ['Weight (kg)',Math.round(wt).toLocaleString('en-IN')+' kg',cap.kg.toLocaleString('en-IN')+' kg'],
      ['Volume Utilization',vUtil+'%','100% max'],
      ['Weight Utilization',wUtil+'%','100% max'],
      ['Status',status,'']],
    k1:vUtil+'%',k2:wUtil+'%',k3:inr(perCbm)+'/CBM'};
}`});

/* 5. Currency Conversion Calculator */
push({id:'currency-conversion-calculator',name:'Currency Conversion Calculator',
 short:'Convert trade currencies with bank charges for import/export payments',
 intro:'Convert foreign currency to INR for trade invoices and payment planning, factoring in bank spread, TT charges and GST on bank fees.',
 seo:{title:'Currency Conversion Calculator for Importers Exporters – INR Trade',description:'Calculate INR equivalent of foreign currency payments with bank spread, TT charges and GST. For import LC and export realisation planning.',keywords:['currency conversion trade India','forex calculator exporter','LC value INR conversion','TT charges bank forex','USD to INR import payment']},
 inputs:[
  {id:'foreign_amount',label:'Foreign Currency Amount',type:'number',default:10000,min:1},
  {id:'currency',label:'Currency',type:'select',default:'USD',options:[{v:'USD',t:'USD – US Dollar'},{v:'EUR',t:'EUR – Euro'},{v:'GBP',t:'GBP – British Pound'},{v:'AED',t:'AED – UAE Dirham'},{v:'SGD',t:'SGD – Singapore Dollar'}]},
  {id:'exchange_rate',label:'Exchange Rate (₹ per unit)',type:'number',default:83.5,min:0.1,hint:'Bank TT rate'},
  {id:'bank_spread',label:'Bank Spread / Commission (%)',type:'number',default:0.25,min:0,max:5},
  {id:'tt_charges',label:'TT / Wire Charges (₹)',type:'number',default:500,min:0},
  {id:'direction',label:'Direction',type:'select',default:'import',options:[{v:'import',t:'Import — paying (buying foreign currency)'},{v:'export',t:'Export — receiving (selling foreign currency)'}]}],
 results:{rowFmt:'raw',columns:['Item','Rate / Detail','Amount (₹)'],kpis:[{key:'k1',label:'Net INR Amount',format:'text'},{key:'k2',label:'Effective Rate',format:'text'},{key:'k3',label:'Total Bank Charges',format:'text'}]},
 assumptions:'GST 18% on bank commission only. TT charges fixed per transaction. Spread applied to gross INR.',
 faq:[
  {q:'What is TT rate vs card rate?',a:'TT (Telegraphic Transfer) rate is used for wire transfers, closer to interbank rate. Card rate is for retail forex with a wider spread. Always use TT rate for trade payments.'},
  {q:'How does bank spread affect import payment?',a:'At 0.25% spread over ₹83.50, you pay ₹83.71/dollar. On $10,000 this costs ₹210 extra. Negotiate the spread for large or regular transactions.'},
  {q:'What is an LC and when to use it?',a:'A Letter of Credit is a bank guarantee of payment for large import/export transactions. It costs 0.5–1% of LC value but significantly reduces payment risk.'}],
 logic:`${inr}
export function compute(v){
  const amt=+v.foreign_amount||10000,rate=+v.exchange_rate||83.5,spread=+v.bank_spread||0.25;
  const ttChg=+v.tt_charges||500,dir=v.direction||'import';
  const grossInr=amt*rate;
  const spreadAmt=Math.round(grossInr*spread/100);
  const gstOnSpread=Math.round(spreadAmt*0.18);
  const bankCharges=spreadAmt+gstOnSpread+ttChg;
  const netInr=dir==='export'?Math.round(grossInr-bankCharges):Math.round(grossInr+bankCharges);
  const effRate=Math.round(netInr/amt*100)/100;
  return{
    rows:[
      ['Foreign Amount',v.currency||'USD',Math.round(amt).toLocaleString('en-IN')],
      ['Gross INR',rate+' × '+Math.round(amt),inr(grossInr)],
      ['Bank Spread',spread+'%',inr(spreadAmt)],
      ['GST on Commission','18%',inr(gstOnSpread)],
      ['TT / Wire Charges','',inr(ttChg)],
      ['Net INR '+(dir==='export'?'Received':'Paid'),'',inr(netInr)]],
    k1:inr(netInr),k2:'₹'+effRate+'/'+v.currency,k3:inr(bankCharges)};
}`});

/* 6. Export Profit Calculator */
push({id:'export-profit-calculator',name:'Export Profit Calculator',
 short:'Find net export profit after all costs, duty drawback and incentives',
 intro:'Calculate the real profitability of your export order from production through freight, insurance, customs and bank charges, adding duty drawback or RoDTEP incentives.',
 seo:{title:'Export Profit Calculator India – Net Export Margin RoDTEP',description:'Calculate net export profit after deducting freight, insurance, bank charges and adding duty drawback/RoDTEP incentives. Know your true export margin.',keywords:['export profit calculator','net export margin India','duty drawback calculator','RoDTEP benefit calculator','export order profitability']},
 inputs:[
  {id:'fob_value',label:'FOB Export Value (₹)',type:'number',default:500000,min:1000,hint:'Total FOB value of the export order'},
  {id:'production_cost',label:'Production / Purchase Cost (₹)',type:'number',default:300000,min:0},
  {id:'inland_freight',label:'Inland Freight (₹)',type:'number',default:8000,min:0},
  {id:'sea_freight',label:'Sea / Air Freight (₹)',type:'number',default:25000,min:0},
  {id:'insurance',label:'Marine Insurance (₹)',type:'number',default:2500,min:0},
  {id:'clearance_charges',label:'Export Clearance & CHA (₹)',type:'number',default:7000,min:0},
  {id:'bank_charges',label:'Bank / LC Charges (₹)',type:'number',default:5000,min:0},
  {id:'drawback_pct',label:'Duty Drawback / RoDTEP Rate (%)',type:'number',default:1.5,min:0,max:20,hint:'Enter 0 if not applicable'}],
 results:{rowFmt:'raw',columns:['Item','Details','Amount (₹)'],kpis:[{key:'k1',label:'Net Profit',format:'text'},{key:'k2',label:'Profit Margin %',format:'text'},{key:'k3',label:'Incentive Received',format:'text'}]},
 assumptions:'Drawback / RoDTEP on FOB value. Net profit = FOB − all costs + incentive.',
 faq:[
  {q:'What is RoDTEP?',a:'Remission of Duties and Taxes on Exported Products refunds embedded taxes not rebated through other schemes. It replaced MEIS in 2021; rates vary by HS code (0.3%–4.3% of FOB).'},
  {q:'Is duty drawback different from RoDTEP?',a:'Yes. DBK refunds customs duty on imported inputs. RoDTEP refunds other embedded taxes. Both can be claimed simultaneously if eligible.'},
  {q:'How do I improve export profit margin?',a:'Negotiate better freight rates, consolidate shipments, use scheme benefits (advance licence, EPCG), reduce packing waste and optimise duty drawback claims.'}],
 logic:`${inr}
export function compute(v){
  const fob=+v.fob_value||500000,prod=+v.production_cost||300000;
  const inlandF=+v.inland_freight||8000,seaF=+v.sea_freight||25000;
  const ins=+v.insurance||2500,clear=+v.clearance_charges||7000,bank=+v.bank_charges||5000;
  const dbkR=+v.drawback_pct||1.5;
  const totalCost=prod+inlandF+seaF+ins+clear+bank;
  const incentive=Math.round(fob*dbkR/100);
  const profit=fob-totalCost+incentive;
  const margin=Math.round(profit/fob*1000)/10;
  return{
    rows:[
      ['FOB Export Value','',inr(fob)],
      ['Production / Purchase Cost','',inr(prod)],
      ['Freight & Logistics','Inland+Sea',inr(inlandF+seaF)],
      ['Insurance & Clearance','',inr(ins+clear)],
      ['Bank Charges','',inr(bank)],
      ['Total Cost','',inr(totalCost)],
      ['Duty Drawback / RoDTEP',dbkR+'% of FOB',inr(incentive)],
      ['Net Profit','',inr(profit)]],
    k1:inr(profit),k2:margin+'%',k3:inr(incentive)};
}`});

/* 7. Shipping Cost Calculator */
push({id:'shipping-cost-calculator',name:'Shipping Cost Calculator',
 short:'Compare sea vs air freight costs for your cargo',
 intro:'Estimate total shipping costs by sea or air, factoring in base freight, fuel surcharges, THC, BL fees and destination charges.',
 seo:{title:'Shipping Cost Calculator India – Sea vs Air Freight Estimator',description:'Calculate sea freight or air freight cost for exports/imports. Includes fuel surcharge, THC, BL fees and destination charges. Compare shipping modes.',keywords:['shipping cost calculator India','sea freight cost estimator','air freight calculator','THC charges calculator','container freight rate India']},
 inputs:[
  {id:'mode',label:'Shipping Mode',type:'select',default:'sea',options:[{v:'sea',t:'Sea Freight (per CBM)'},{v:'air',t:'Air Freight (per kg)'}]},
  {id:'cargo_cbm',label:'Cargo Volume (CBM)',type:'number',default:10,min:0.1,hint:'For sea freight'},
  {id:'cargo_weight',label:'Cargo Weight (kg)',type:'number',default:500,min:1,hint:'For air freight'},
  {id:'base_rate',label:'Base Freight Rate (₹/CBM or ₹/kg)',type:'number',default:8000,min:0},
  {id:'fuel_surcharge_pct',label:'Fuel Surcharge (%)',type:'number',default:15,min:0,max:100},
  {id:'thc',label:'THC / Handling Charges (₹)',type:'number',default:6500,min:0},
  {id:'bl_fee',label:'BL / AWB Fee (₹)',type:'number',default:2500,min:0},
  {id:'destination_charges',label:'Destination Charges (₹)',type:'number',default:8000,min:0}],
 results:{rowFmt:'raw',columns:['Charge Component','Basis','Amount (₹)'],kpis:[{key:'k1',label:'Total Freight Cost',format:'text'},{key:'k2',label:'Cost per CBM / kg',format:'text'},{key:'k3',label:'Chargeable Units',format:'text'}]},
 assumptions:'Air chargeable weight = max(actual kg, CBM×167). Sea: base × CBM. Fuel surcharge on base freight only.',
 faq:[
  {q:'What is chargeable weight in air freight?',a:'Air freight is charged on whichever is higher — actual weight or volumetric weight (CBM × 167). Lightweight bulky cargo is billed on volumetric weight.'},
  {q:'What is THC in shipping?',a:'Terminal Handling Charges are levied by the port for handling containers. Charged per container (FCL) or per CBM (LCL), separate from ocean freight rate.'},
  {q:'How can I reduce shipping costs?',a:'Consolidate shipments to fill containers, negotiate long-term contracts with shipping lines, use less congested ports, and plan shipments to avoid peak season surcharges.'}],
 logic:`${inr}
export function compute(v){
  const mode=v.mode||'sea',cbm=+v.cargo_cbm||10,wt=+v.cargo_weight||500;
  const rate=+v.base_rate||8000,fuelPct=+v.fuel_surcharge_pct||15;
  const thc=+v.thc||6500,bl=+v.bl_fee||2500,dest=+v.destination_charges||8000;
  let chargeable,baseFreight,unitLabel;
  if(mode==='air'){
    const volWt=Math.round(cbm*167);
    chargeable=Math.max(wt,volWt);
    baseFreight=Math.round(chargeable*rate);
    unitLabel=chargeable+' kg (chargeable)';
  } else {
    chargeable=cbm;
    baseFreight=Math.round(cbm*rate);
    unitLabel=cbm+' CBM';
  }
  const fuelSurcharge=Math.round(baseFreight*fuelPct/100);
  const total=baseFreight+fuelSurcharge+thc+bl+dest;
  const perUnit=mode==='air'?Math.round(total/wt):Math.round(total/cbm);
  return{
    rows:[
      ['Base Freight',unitLabel,inr(baseFreight)],
      ['Fuel Surcharge',fuelPct+'%',inr(fuelSurcharge)],
      ['THC / Handling','',inr(thc)],
      ['BL / AWB Fee','',inr(bl)],
      ['Destination Charges','',inr(dest)],
      ['Total Freight','',inr(total)]],
    k1:inr(total),k2:inr(perUnit)+'/'+(mode==='air'?'kg':'CBM'),k3:unitLabel};
}`});

/* 8. FOB Price Calculator */
push({id:'fob-price-calculator',name:'FOB Price Calculator',
 short:'Build your FOB export quotation step by step from factory cost',
 intro:'Systematically build your Free on Board export price from ex-works cost, adding inland transport, packaging, export licence fees, CHA charges and port dues.',
 seo:{title:'FOB Price Calculator – Free on Board Export Quotation Builder',description:'Calculate your FOB export price step by step. Add factory cost, packaging, inland transport, export clearance and port charges. Get FOB per unit and total.',keywords:['FOB price calculator','FOB export price India','free on board calculator','export quotation builder','FOB per unit calculator']},
 inputs:[
  {id:'exw_unit',label:'Ex-Works Price per Unit (₹)',type:'number',default:850,min:1},
  {id:'quantity',label:'Quantity (units)',type:'number',default:500,min:1},
  {id:'packing_cost',label:'Export Packing Cost (₹ total)',type:'number',default:12000,min:0},
  {id:'inland_transport',label:'Inland Transport to Port (₹)',type:'number',default:10000,min:0},
  {id:'cha_charges',label:'CHA & Shipping Bill Charges (₹)',type:'number',default:6500,min:0},
  {id:'port_charges',label:'Port / THC Charges (₹)',type:'number',default:5000,min:0},
  {id:'other_charges',label:'Other Charges (₹)',type:'number',default:2000,min:0,hint:'Inspection, fumigation, COO, etc.'}],
 results:{rowFmt:'raw',columns:['Cost Component','Total (₹)','Per Unit (₹)'],kpis:[{key:'k1',label:'FOB / Unit',format:'text'},{key:'k2',label:'Total FOB Value',format:'text'},{key:'k3',label:'Charges above EXW',format:'text'}]},
 assumptions:'FOB = EXW + packing + inland transport + CHA + port + other. Convert to USD at prevailing TT rate for quotation.',
 faq:[
  {q:"When does seller's responsibility end under FOB?",a:"Under FOB, seller's responsibility ends when goods pass the ship's rail at the named port of shipment. After that, the buyer bears all costs and risks."},
  {q:'Should I quote FOB or CIF to foreign buyers?',a:'FOB is simpler for the seller. However, some buyers prefer CIF as it gives a single landed price. Offering both builds credibility.'},
  {q:'What documents are needed for FOB export clearance?',a:'Shipping Bill, Commercial Invoice, Packing List, Certificate of Origin, L/C or PO, and any product-specific certificates (phytosanitary, quality inspection).'}],
 logic:`${inr}
export function compute(v){
  const exw=+v.exw_unit||850,qty=+v.quantity||500;
  const pack=+v.packing_cost||12000,inland=+v.inland_transport||10000;
  const cha=+v.cha_charges||6500,port=+v.port_charges||5000,other=+v.other_charges||2000;
  const exwTotal=exw*qty;
  const addons=pack+inland+cha+port+other;
  const fobTotal=exwTotal+addons;
  const fobUnit=Math.round(fobTotal/qty);
  return{
    rows:[
      ['EXW (factory)',qty+' units @ ₹'+exw,inr(exwTotal)],
      ['Export Packing','',inr(pack)],
      ['Inland Transport','',inr(inland)],
      ['CHA / Shipping Bill','',inr(cha)],
      ['Port / THC Charges','',inr(port)],
      ['Other Charges','',inr(other)],
      ['FOB Total','',inr(fobTotal)]],
    k1:inr(fobUnit)+'/unit',k2:inr(fobTotal),k3:inr(addons)};
}`});

/* 9. CIF Price Calculator */
push({id:'cif-price-calculator',name:'CIF Price Calculator',
 short:'Add freight and insurance to FOB for complete CIF quotation',
 intro:'Add ocean freight and marine insurance to your FOB value to arrive at the CIF quotation — the standard basis for import duty assessment in India and most importing countries.',
 seo:{title:'CIF Price Calculator – Cost Insurance Freight Export Calculator',description:'Calculate CIF price by adding ocean freight and marine insurance to your FOB value. CIF is the basis for Indian customs duty assessment.',keywords:['CIF price calculator','cost insurance freight calculator','CIF export India','CIF vs FOB','CIF quotation calculator']},
 inputs:[
  {id:'fob_total',label:'FOB Value (₹ total)',type:'number',default:500000,min:1000},
  {id:'sea_freight',label:'Ocean Freight (₹)',type:'number',default:35000,min:0},
  {id:'insurance_rate',label:'Insurance Rate (% of CIF)',type:'number',default:0.5,min:0,max:5,hint:'Marine insurance: typically 0.3–0.5%'},
  {id:'quantity',label:'Quantity (units)',type:'number',default:500,min:1}],
 results:{rowFmt:'raw',columns:['Component','Total (₹)','Per Unit (₹)'],kpis:[{key:'k1',label:'CIF Total',format:'text'},{key:'k2',label:'CIF / Unit',format:'text'},{key:'k3',label:'Insurance Premium',format:'text'}]},
 assumptions:'CIF = (FOB + Freight) / (1 − insurance rate/100). Single-pass iterative approximation.',
 faq:[
  {q:'Why is CIF used as basis for Indian import duty?',a:'India uses CIF as the assessable value for customs duty because it includes the cost of landing goods at the Indian port, giving a more accurate duty base than EXW or FOB.'},
  {q:'What is the standard marine insurance rate?',a:'Marine cargo insurance typically costs 0.3–0.5% of CIF value. Fragile or high-value goods may attract higher rates up to 1–2%.'},
  {q:'Is CIF the same as landed cost?',a:'No. CIF is the value at destination port before customs duty, port handling and inland freight. Landed cost = CIF + all import duties + local transport.'}],
 logic:`${inr}
export function compute(v){
  const fob=+v.fob_total||500000,freight=+v.sea_freight||35000;
  const insR=+v.insurance_rate||0.5,qty=+v.quantity||500;
  const cfr=fob+freight;
  const cif=Math.round(cfr/(1-insR/100));
  const ins=cif-cfr;
  const cifUnit=Math.round(cif/qty);
  return{
    rows:[
      ['FOB Value','',inr(fob)],
      ['Ocean Freight','',inr(freight)],
      ['CFR Value','FOB + Freight',inr(cfr)],
      ['Marine Insurance',insR+'% of CIF',inr(ins)],
      ['CIF Value','CFR + Insurance',inr(cif)]],
    k1:inr(cif),k2:inr(cifUnit)+'/unit',k3:inr(ins)};
}`});

/* 10. Import/Export Documentation Checklist */
push({id:'import-export-documentation-checklist',name:'Import / Export Documentation Checklist',
 kind:'checklist',
 short:'Verify all trade documents before shipment to avoid customs delays',
 intro:'Use this comprehensive checklist to ensure every import or export shipment is backed by the correct documents — preventing costly delays at customs.',
 seo:{title:'Import Export Documentation Checklist India – Trade Docs Guide',description:'Complete checklist of import and export documents required in India. Commercial invoice, packing list, BL, LC, COO, and regulatory certificates.',keywords:['import export documentation checklist','trade documents India','customs clearance documents','export documents list','import documents required India']},
 inputs:[],
 checklist:[
  {name:'Core Shipping Documents',items:[
   {id:'d1',text:'Commercial Invoice (with HS code, unit price, total value, INCOTERM)',critical:true},
   {id:'d2',text:'Packing List (carton-wise weight, dimensions, content)',critical:true},
   {id:'d3',text:'Bill of Lading / Airway Bill (original or telex release)',critical:true},
   {id:'d4',text:'Purchase Order / Sales Contract',critical:true},
   {id:'d5',text:'Letter of Credit — confirmed and operative (if LC terms)'}]},
  {name:'Customs & Regulatory Documents',items:[
   {id:'d6',text:'Certificate of Origin — notarised and legalised if required',critical:true},
   {id:'d7',text:'Shipping Bill (export) / Bill of Entry (import)',critical:true},
   {id:'d8',text:'IEC (Import Export Code) — active and valid',critical:true},
   {id:'d9',text:'GST Registration for imports under IGST credit scheme'},
   {id:'d10',text:'AD Code registered at port for export realization'}]},
  {name:'Quality & Compliance Certificates',items:[
   {id:'d11',text:'Phytosanitary Certificate (for agricultural / food products)',critical:true},
   {id:'d12',text:'Fumigation Certificate if required by importing country'},
   {id:'d13',text:'Quality Inspection Certificate / Pre-shipment Inspection Report'},
   {id:'d14',text:'BIS / FSSAI / Drug licence for regulated products'},
   {id:'d15',text:'MSDS for chemicals / hazardous goods'}]},
  {name:'Financial & Insurance Documents',items:[
   {id:'d16',text:'Marine Insurance Certificate / Open Cover Policy',critical:true},
   {id:'d17',text:'Bank Realisation Certificate (BRC) for DGFT benefits'},
   {id:'d18',text:'FIRC (Foreign Inward Remittance Certificate) for advance payment'},
   {id:'d19',text:'SWIFT copy of payment for TT advance cases'},
   {id:'d20',text:'GR Form (Export Declaration Form) — RBI requirement'}]}],
 buttonLabel:'Check Documentation Readiness',
 results:CHECKLIST_RESULTS,
 logic:CHECKLIST_LOGIC,
 assumptions:"Requirements vary by product and importing country. Always verify with your CHA.",
 faq:[
  {q:'What is an IEC code and who needs it?',a:'Importer Exporter Code is a 10-digit number from DGFT, mandatory for any business importing or exporting goods from India. One-time registration.'},
  {q:'What is a Certificate of Origin?',a:'A COO certifies the country where goods were produced. Required for customs clearance, FTA preferential duty claims, and importing country compliance.'},
  {q:'What happens if documents are missing at customs?',a:'Missing documents lead to demurrage, customs hold and potential auction of goods. Having all documents ready prevents costly delays.'}]});

/* 11. Import ROI Calculator */
push({id:'import-roi-calculator',name:'Import ROI Calculator',
 short:'Evaluate return on investment for import trading ventures',
 intro:'Assess the profitability of an import deal by comparing total landed cost against the selling price in the Indian market to calculate ROI and profit margin.',
 seo:{title:'Import ROI Calculator – Return on Import Investment India',description:'Calculate ROI on import business deals. Compare total landed cost with selling price in India. Factor in duty, freight, overheads and working capital cost.',keywords:['import ROI calculator','import business profitability','import profit margin India','landed cost vs selling price','import return on investment']},
 inputs:[
  {id:'landed_cost',label:'Landed Cost per Unit (₹)',type:'number',default:1200,min:1,hint:'CIF + all duties + port clearing + local transport'},
  {id:'selling_price',label:'Selling Price per Unit (₹)',type:'number',default:1800,min:1},
  {id:'quantity',label:'Quantity (units)',type:'number',default:500,min:1},
  {id:'overheads',label:'Overheads per Unit (₹)',type:'number',default:100,min:0,hint:'Storage, distribution, commission'},
  {id:'working_capital_cost',label:'Working Capital Finance Cost (₹)',type:'number',default:30000,min:0},
  {id:'finance_days',label:'Import Finance Cycle (days)',type:'number',default:90,min:1}],
 results:{rowFmt:'raw',columns:['Metric','Calculation','Value'],kpis:[{key:'k1',label:'Net Profit',format:'text'},{key:'k2',label:'ROI %',format:'text'},{key:'k3',label:'Profit Margin %',format:'text'}]},
 assumptions:'ROI = Net Profit / Total Investment × 100. Annualised ROI = ROI × (365 / finance cycle days).',
 faq:[
  {q:'What should be included in landed cost for ROI?',a:'Landed cost = CIF value + BCD + SWS + IGST (non-recoverable) + port handling + CHA + inland freight to warehouse. Recoverable IGST should be excluded.'},
  {q:'What is a good ROI for an import deal?',a:'A minimum 25–30% ROI is considered viable for most import deals accounting for the 90–120 day cycle. Higher-value goods with lower duties can achieve 40–60% ROI.'},
  {q:'How does the finance period affect ROI?',a:'A longer import cycle ties up working capital longer, increasing interest cost and reducing effective ROI. Faster-moving goods with shorter credit terms improve annualised returns.'}],
 logic:`${inr}
export function compute(v){
  const lc=+v.landed_cost||1200,sp=+v.selling_price||1800,qty=+v.quantity||500;
  const oh=+v.overheads||100,wcc=+v.working_capital_cost||30000,days=+v.finance_days||90;
  const revenue=sp*qty;
  const totalCost=lc*qty+oh*qty+wcc;
  const profit=revenue-totalCost;
  const roi=Math.round(profit/totalCost*1000)/10;
  const margin=Math.round(profit/revenue*1000)/10;
  const annRoi=Math.round(roi*(365/days)*10)/10;
  return{
    rows:[
      ['Revenue',qty+' × ₹'+sp,inr(revenue)],
      ['Landed Cost',qty+' × ₹'+lc,inr(lc*qty)],
      ['Overheads',qty+' × ₹'+oh,inr(oh*qty)],
      ['Working Capital Finance Cost','',inr(wcc)],
      ['Total Investment','',inr(totalCost)],
      ['Net Profit','',inr(profit)],
      ['Annualised ROI','('+days+' day cycle)',annRoi+'%']],
    k1:inr(profit),k2:roi+'%',k3:margin+'%'};
}`});

/* 12. Export Budget Planner */
push({id:'export-budget-planner',name:'Export Budget Planner',
 short:'Plan your complete annual export operation budget',
 intro:'Build a comprehensive annual export budget covering production, packaging, freight, certifications, trade fairs, agent commissions and finance costs.',
 seo:{title:'Export Budget Planner – Annual Export Cost Planning Tool India',description:'Plan your annual export budget: production, freight, certification, trade fairs, agent commission and finance costs. Know your capital requirement and break-even.',keywords:['export budget planner','export cost planning India','annual export budget','export working capital','export business budget template']},
 inputs:[
  {id:'annual_export_value',label:'Target Annual Export Value (₹)',type:'number',default:10000000,min:100000},
  {id:'cogs_pct',label:'Production / Purchase Cost (%)',type:'number',default:55,min:1,max:95},
  {id:'freight_pct',label:'Freight & Insurance (%)',type:'number',default:6,min:0,max:20},
  {id:'agent_commission_pct',label:'Agent / Distributor Commission (%)',type:'number',default:5,min:0,max:25},
  {id:'certification_cost',label:'Annual Certification & Compliance (₹)',type:'number',default:150000,min:0,hint:'ISO, BIS, phytosanitary, CE marks'},
  {id:'trade_fair_cost',label:'Trade Fair & Marketing (₹)',type:'number',default:200000,min:0},
  {id:'finance_cost_pct',label:'Export Finance Cost (%)',type:'number',default:2,min:0,max:10},
  {id:'overhead_pct',label:'Overhead Allocation (%)',type:'number',default:5,min:0,max:20}],
 results:{rowFmt:'raw',columns:['Budget Head','Rate / Details','Annual Amount (₹)'],kpis:[{key:'k1',label:'Total Export Budget',format:'text'},{key:'k2',label:'Expected Net Profit',format:'text'},{key:'k3',label:'Net Profit Margin',format:'text'}]},
 assumptions:'Fixed costs distributed across full-year export value. Finance cost on full export value. Incentives not included.',
 faq:[
  {q:'What export finance options are available in India?',a:'ECGC-backed pre-shipment credit (PCFC) and post-shipment credit at concessional rates (7–9% p.a.), export bills discounting, and buyers credit under SOFR-linked rates for large exporters.'},
  {q:'How do I account for exchange rate risk?',a:'Build a 2–3% forex buffer in your budget. Use forward contracts or options to hedge USD/EUR receivables for shipments beyond 30 days.'},
  {q:'What certifications are mandatory for export?',a:'Depends on product and destination: FSSAI (food), BIS (electronics/toys), phytosanitary (agriculture), RCMC from Export Promotion Council, and destination-specific marks (CE for Europe, FCC for US).'}],
 logic:`${inr}
export function compute(v){
  const ev=+v.annual_export_value||10000000;
  const cogs=Math.round(ev*(+v.cogs_pct||55)/100);
  const freight=Math.round(ev*(+v.freight_pct||6)/100);
  const commission=Math.round(ev*(+v.agent_commission_pct||5)/100);
  const cert=+v.certification_cost||150000;
  const fair=+v.trade_fair_cost||200000;
  const finance=Math.round(ev*(+v.finance_cost_pct||2)/100);
  const overhead=Math.round(ev*(+v.overhead_pct||5)/100);
  const totalCost=cogs+freight+commission+cert+fair+finance+overhead;
  const profit=ev-totalCost;
  const margin=Math.round(profit/ev*1000)/10;
  return{
    rows:[
      ['Production / COGS',(+v.cogs_pct||55)+'%',inr(cogs)],
      ['Freight & Insurance',(+v.freight_pct||6)+'%',inr(freight)],
      ['Agent Commission',(+v.agent_commission_pct||5)+'%',inr(commission)],
      ['Certifications & Compliance','Fixed',inr(cert)],
      ['Trade Fair & Marketing','Fixed',inr(fair)],
      ['Export Finance',(+v.finance_cost_pct||2)+'%',inr(finance)],
      ['Overheads',(+v.overhead_pct||5)+'%',inr(overhead)],
      ['Total Export Budget','',inr(totalCost)]],
    k1:inr(totalCost),k2:inr(profit),k3:margin+'%'};
}`});

/* 13. Trade Compliance Checklist */
push({id:'trade-compliance-checklist',name:'Trade Compliance Checklist',
 kind:'checklist',
 short:'Ensure exports meet all regulatory and legal compliance requirements',
 intro:'Verify compliance across all dimensions of international trade — DGFT, RBI, customs, sanctions screening and end-use checks — before executing any export or import transaction.',
 seo:{title:'Trade Compliance Checklist India – Export Import Regulatory Check',description:'Comprehensive trade compliance checklist for Indian exporters and importers. Covers DGFT, RBI, customs, ECGC, sanctions, end-use certificates and dual-use checks.',keywords:['trade compliance checklist India','export compliance','DGFT compliance','RBI FEMA compliance','import export regulatory check']},
 inputs:[],
 checklist:[
  {name:'DGFT & Export Licensing',items:[
   {id:'tc1',text:'IEC code is active and updated with current bank / address details',critical:true},
   {id:'tc2',text:'Product is not on SCOMET restricted list without a valid licence',critical:true},
   {id:'tc3',text:'Export licence obtained where required (munitions, dual-use, SCOMET)',critical:true},
   {id:'tc4',text:'RCMC from relevant Export Promotion Council obtained for incentive claims'},
   {id:'tc5',text:'EPCG / Advance Licence obligations tracked and within export timeline'}]},
  {name:'RBI / FEMA Compliance',items:[
   {id:'tc6',text:'AD Code registered at port of shipment with authorised bank',critical:true},
   {id:'tc7',text:'Export realization expected within 9 months (FEMA timeline)',critical:true},
   {id:'tc8',text:'BRC (Bank Realisation Certificate) filed for previous shipments'},
   {id:'tc9',text:'No overdue export proceeds beyond 9 months without RBI extension'},
   {id:'tc10',text:'ODI/FDI compliance checked if exporting to a related party'}]},
  {name:'Sanctions & End-Use Screening',items:[
   {id:'tc11',text:'Buyer / country not on OFAC, EU, UN or Indian MEA sanctions list',critical:true},
   {id:'tc12',text:'End-use certificate obtained for dual-use or restricted goods',critical:true},
   {id:'tc13',text:'No diversion risk — destination not known for re-export to sanctioned nations'},
   {id:'tc14',text:'AML / KYC on foreign buyer completed'}]},
  {name:'Customs & Documentation',items:[
   {id:'tc15',text:'Correct HS code declared — classification verified, not guessed',critical:true},
   {id:'tc16',text:'Transaction value declared accurately — no under-invoicing',critical:true},
   {id:'tc17',text:'Packing list, invoice and BL values match exactly'},
   {id:'tc18',text:'Letter of Undertaking (LUT) filed for zero-rated GST exports'},
   {id:'tc19',text:'GSTR-1 export entries filed and matched with Shipping Bills'}]}],
 buttonLabel:'Check Trade Compliance',
 results:CHECKLIST_RESULTS,
 logic:CHECKLIST_LOGIC,
 assumptions:'Checklist covers general trade. Sector-specific rules (pharma, defence, chemicals) may require additional compliance. Consult a licensed CHA or trade compliance consultant.',
 faq:[
  {q:'What is SCOMET and why does it matter?',a:'SCOMET is India\'s dual-use export control list. Exporting SCOMET items without a licence from DGFT is a criminal offence under FTDR Act, 1992.'},
  {q:'What happens if export proceeds are not realised within 9 months?',a:'Apply to RBI/AD bank for extension with valid reasons. Non-realisation beyond permitted period attracts FEMA penalties and can affect IEC and credit facilities.'},
  {q:'Do I need to screen every buyer for sanctions?',a:'Yes. Exporting to a sanctioned entity — even unknowingly — can result in severe penalties, export privilege denial and criminal prosecution.'}]});

/* 14. Shipment Timeline Planner */
push({id:'shipment-timeline-planner',name:'Shipment Timeline Planner',
 short:'Plan end-to-end shipment timeline from order to delivery',
 intro:'Map out every phase of your shipment — from production through port clearance to delivery — to commit to realistic delivery dates and plan working capital.',
 seo:{title:'Shipment Timeline Planner – Export Import Schedule Calculator',description:'Plan your import/export shipment timeline: production, export clearance, transit, customs and delivery. Calculate total lead time and key milestone dates.',keywords:['shipment timeline planner','export delivery schedule','import lead time calculator','shipment schedule India','trade timeline planning tool']},
 inputs:[
  {id:'production_days',label:'Production / Procurement Lead Time (days)',type:'number',default:20,min:0},
  {id:'packing_days',label:'Packing & QC (days)',type:'number',default:3,min:0},
  {id:'inland_transport_days',label:'Inland Transport to Port (days)',type:'number',default:2,min:0},
  {id:'export_clearance_days',label:'Export Customs Clearance (days)',type:'number',default:2,min:0},
  {id:'vessel_booking_days',label:'Vessel Booking / CFS Buffer (days)',type:'number',default:3,min:0},
  {id:'transit_days',label:'Ocean / Air Transit (days)',type:'number',default:18,min:1},
  {id:'import_clearance_days',label:'Import Customs at Destination (days)',type:'number',default:5,min:0},
  {id:'local_delivery_days',label:'Local Delivery at Destination (days)',type:'number',default:2,min:0}],
 results:{rowFmt:'raw',columns:['Phase','Duration (days)','Cumulative (days)'],kpis:[{key:'k1',label:'Total Lead Time',format:'text'},{key:'k2',label:'Port-to-Door Time',format:'text'},{key:'k3',label:'Pre-Shipment Time',format:'text'}]},
 assumptions:'Phases run sequentially. No port strikes or vessel delays. Add 10–15% buffer for actual planning.',
 faq:[
  {q:'What is the typical sea transit time from India to Europe?',a:'India (JNPT) to Europe (Hamburg/Rotterdam) takes approximately 20–25 days by sea. Via Cape of Good Hope (if Suez congested) can be 30–35 days.'},
  {q:'What is CFS cut-off and why does it matter?',a:'CFS cut-off is the deadline for delivering LCL cargo before container sealing. Missing cut-off means waiting for the next vessel, delaying shipment by 7–14 days.'},
  {q:'How can I reduce total shipment lead time?',a:'Pre-book vessels for recurring shipments, maintain buffer stock at origin, use AEO status for faster customs, and choose direct routes over transshipment options.'}],
 logic:`${inr}
export function compute(v){
  const prod=+v.production_days||20,pack=+v.packing_days||3;
  const inland=+v.inland_transport_days||2,expClear=+v.export_clearance_days||2;
  const vessel=+v.vessel_booking_days||3,transit=+v.transit_days||18;
  const impClear=+v.import_clearance_days||5,localDel=+v.local_delivery_days||2;
  const preShip=prod+pack+inland+expClear+vessel;
  const portDoor=transit+impClear+localDel;
  const total=preShip+portDoor;
  const phases=[
    ['Production / Procurement',prod,prod],
    ['Packing & QC',pack,prod+pack],
    ['Inland Transport to Port',inland,prod+pack+inland],
    ['Export Customs Clearance',expClear,prod+pack+inland+expClear],
    ['Vessel Booking Buffer',vessel,preShip],
    ['Ocean / Air Transit',transit,preShip+transit],
    ['Import Customs',impClear,preShip+transit+impClear],
    ['Local Delivery',localDel,total]];
  return{
    rows:phases.map(p=>[p[0],p[1]+' days',p[2]+' days']),
    k1:total+' days',k2:portDoor+' days',k3:preShip+' days'};
}`});

/* 15. Port Handling Cost Estimator */
push({id:'port-handling-cost-estimator',name:'Port Handling Cost Estimator',
 short:'Estimate THC, demurrage and port charges for import/export shipments',
 intro:'Calculate the complete set of port-side costs including THC, documentation fees, scanning charges and demurrage to budget accurately for shipment execution.',
 seo:{title:'Port Handling Cost Estimator – THC Port Charges Calculator India',description:'Estimate port handling charges for imports and exports in India. Includes THC, stevedoring, documentation, container scanning and demurrage calculation.',keywords:['port handling cost India','THC charges calculator','demurrage calculator shipping','port charges estimator','container port fees India']},
 inputs:[
  {id:'container_type',label:'Container Type',type:'select',default:'20ft',options:[{v:'20ft',t:'20ft Standard'},{v:'40ft',t:'40ft Standard'},{v:'40hc',t:'40ft High Cube'}]},
  {id:'direction',label:'Direction',type:'select',default:'export',options:[{v:'export',t:'Export (Origin Port)'},{v:'import',t:'Import (Destination Port)'}]},
  {id:'port',label:'Port',type:'select',default:'jnpt',options:[{v:'jnpt',t:'JNPT Mumbai'},{v:'chennai',t:'Chennai Port'},{v:'mundra',t:'Mundra Port'},{v:'kolkata',t:'Kolkata Port'}]},
  {id:'extra_days',label:'Days Beyond Free Period',type:'number',default:0,min:0,hint:'Demurrage days (typical free: 7 export, 3 import)'},
  {id:'lcl_cbm',label:'LCL Cargo Volume (CBM)',type:'number',default:0,min:0,hint:'Enter 0 for FCL shipment'}],
 results:{rowFmt:'raw',columns:['Charge Type','Basis','Amount (₹)'],kpis:[{key:'k1',label:'Total Port Charges',format:'text'},{key:'k2',label:'Demurrage / Detention',format:'text'},{key:'k3',label:'Cost per Day (if delayed)',format:'text'}]},
 assumptions:'THC (2024 ref): JNPT 20ft ₹6,250 / 40ft ₹9,375; Chennai -10%; Mundra -5%; Kolkata -8%. Demurrage ₹4,000/day. Scanning ₹1,200 flat. BL/SB fee ₹2,500. LCL ₹650/CBM.',
 faq:[
  {q:'What is THC in port charges?',a:'Terminal Handling Charges are fees levied by the port terminal for loading/unloading and moving containers. They are separate from ocean freight.'},
  {q:'What is demurrage vs detention?',a:'Demurrage is the charge for keeping a container inside the port terminal beyond the free period. Detention is for keeping it outside at your premises. Both can be ₹3,000–₹8,000/day.'},
  {q:'How do I avoid demurrage charges?',a:'Plan customs clearance before vessel arrival, submit import documents promptly, and choose ports with longer free periods for time-sensitive cargo.'}],
 logic:`${inr}
const THC={
  jnpt:{t20:6250,t40:9375,t40hc:10500},
  chennai:{t20:5600,t40:8400,t40hc:9400},
  mundra:{t20:5900,t40:8900,t40hc:9900},
  kolkata:{t20:5750,t40:8600,t40hc:9600}};
const DEMURRAGE=4000;
export function compute(v){
  const ct=v.container_type||'20ft',port=v.port||'jnpt';
  const dir=v.direction||'export',extraDays=+v.extra_days||0,lcl=+v.lcl_cbm||0;
  const rates=THC[port]||THC.jnpt;
  const thcKey=ct==='40hc'?'t40hc':ct==='40ft'?'t40':'t20';
  const thc=lcl>0?0:rates[thcKey];
  const lclCharge=Math.round(lcl*650);
  const scanning=1200,blFee=2500;
  const demurrage=Math.round(extraDays*DEMURRAGE);
  const total=thc+lclCharge+scanning+blFee+demurrage;
  return{
    rows:[
      ['THC / Terminal Handling',ct+(lcl>0?' (FCL N/A — LCL)':''),inr(thc)],
      ['LCL Handling',lcl>0?lcl+' CBM × ₹650':'N/A (FCL)',inr(lclCharge)],
      ['Container Scanning','Flat',inr(scanning)],
      ['BL / Shipping Bill Fee','Flat',inr(blFee)],
      ['Demurrage / Detention',extraDays+' day(s) × ₹'+DEMURRAGE,inr(demurrage)],
      ['Total Port Charges','',inr(total)]],
    k1:inr(total),k2:inr(demurrage),k3:inr(DEMURRAGE)+'/day'};
}`});

/* 16. International Trade Planner */
push({id:'international-trade-planner',name:'International Trade Planner',
 short:'Plan annual import/export trade volumes, costs and revenue targets',
 intro:'Set annual trade targets, allocate budgets, forecast revenue and profitability, and identify the working capital required to sustain your import/export business throughout the year.',
 seo:{title:'International Trade Planner – Annual Export Import Business Plan',description:'Plan your import/export business for the year. Set shipment targets, estimate costs, forecast revenue and calculate working capital requirement.',keywords:['international trade planner','export import business plan','annual export plan India','trade business forecast','import export capital planning']},
 inputs:[
  {id:'shipments_per_year',label:'Shipments per Year',type:'number',default:12,min:1},
  {id:'avg_shipment_value',label:'Average Shipment Value (₹)',type:'number',default:1500000,min:10000},
  {id:'avg_margin_pct',label:'Trade Margin (%)',type:'number',default:15,min:0,max:60},
  {id:'working_capital_days',label:'Working Capital Cycle (days)',type:'number',default:90,min:1,hint:'Days from paying supplier to collecting payment'},
  {id:'finance_rate',label:'Working Capital Finance Rate (% p.a.)',type:'number',default:10,min:0,max:30},
  {id:'fixed_overheads',label:'Annual Fixed Overheads (₹)',type:'number',default:1200000,min:0}],
 results:{rowFmt:'raw',columns:['Planning Parameter','Calculation','Annual Amount (₹)'],kpis:[{key:'k1',label:'Annual Turnover',format:'text'},{key:'k2',label:'Net Annual Profit',format:'text'},{key:'k3',label:'Working Capital Required',format:'text'}]},
 assumptions:'Working capital = avg shipment value × WC days / 365. Finance cost on working capital at given rate. Net profit after all costs including finance and overheads.',
 faq:[
  {q:'How much working capital do I need for an import business?',a:'Working capital = total annual trade value × (average cycle days / 365). For ₹1 crore annual trade with 90-day cycle, you need ~₹25 lakh in working capital at any time.'},
  {q:'What are key KPIs for a trade business?',a:'Trade turnover, gross margin %, net profit margin, working capital turnover, shipments per month, average shipment value, and return on working capital deployed.'},
  {q:'How do I scale an import/export business?',a:'Increase shipment frequency, add product lines, enter new markets, secure long-term supply agreements, improve credit terms, and use export credit insurance to reduce buyer default risk.'}],
 logic:`${inr}
export function compute(v){
  const spY=+v.shipments_per_year||12,asv=+v.avg_shipment_value||1500000;
  const marginPct=+v.avg_margin_pct||15,wcDays=+v.working_capital_days||90;
  const finRate=+v.finance_rate||10,fixOH=+v.fixed_overheads||1200000;
  const turnover=spY*asv;
  const grossProfit=Math.round(turnover*marginPct/100);
  const wc=Math.round(asv*wcDays/365);
  const financeCost=Math.round(wc*finRate/100);
  const netProfit=grossProfit-fixOH-financeCost;
  const netMargin=Math.round(netProfit/turnover*1000)/10;
  return{
    rows:[
      ['Annual Turnover',spY+' × ₹'+asv.toLocaleString('en-IN'),inr(turnover)],
      ['Gross Profit (Trade Margin)',marginPct+'%',inr(grossProfit)],
      ['Fixed Overheads','Annual',inr(fixOH)],
      ['Working Capital',asv.toLocaleString('en-IN')+' × '+wcDays+'/365',inr(wc)],
      ['Finance Cost on WC',finRate+'% p.a.',inr(financeCost)],
      ['Net Annual Profit','',inr(netProfit)]],
    k1:inr(turnover),k2:inr(netProfit),k3:inr(wc)};
}`});

/* 17. HS Code Classification Checklist */
push({id:'hs-code-classification-checklist',name:'HS Code Classification Checklist',
 kind:'checklist',
 short:'Systematically classify goods to the correct HS code for customs',
 intro:'Use this structured checklist to gather all the information needed for accurate HS code classification — preventing misclassification penalties and duty disputes.',
 seo:{title:'HS Code Classification Checklist – Harmonised System Code Finder India',description:'Checklist to classify goods under the correct HS code for Indian customs. Covers product description, material, end-use, processing stage and trade documentation.',keywords:['HS code classification checklist','harmonised system code India','customs tariff classification','HS code finder India','correct HS code export import']},
 inputs:[],
 checklist:[
  {name:'Product Information Gathering',items:[
   {id:'hs1',text:'Complete product name and trade name documented',critical:true},
   {id:'hs2',text:'Primary material / composition noted (e.g. cotton 80%, polyester 20%)',critical:true},
   {id:'hs3',text:'Stage of processing identified (raw, semi-processed, finished)',critical:true},
   {id:'hs4',text:'Principal function / end-use of the product clearly defined',critical:true},
   {id:'hs5',text:'Technical specifications, drawings or MSDS available'}]},
  {name:'Classification Research',items:[
   {id:'hs6',text:'Section and Chapter of ITC-HS tentatively identified',critical:true},
   {id:'hs7',text:'GRI (General Rules of Interpretation) Rules 1–6 applied',critical:true},
   {id:'hs8',text:'Customs Tariff Act 1975 — relevant chapter notes reviewed'},
   {id:'hs9',text:'WCO Explanatory Notes checked for ambiguous products'},
   {id:'hs10',text:'Previous CESTAT / advance ruling on similar product checked'}]},
  {name:'Duty & Compliance Verification',items:[
   {id:'hs11',text:'BCD rate confirmed from Customs Tariff (Basic + AIDC if any)',critical:true},
   {id:'hs12',text:'IGST rate on imports confirmed from GST schedule',critical:true},
   {id:'hs13',text:'SCOMET / export licensing requirement checked',critical:true},
   {id:'hs14',text:'Import policy (Free / Restricted / Prohibited / Canalized) confirmed'},
   {id:'hs15',text:'Anti-Dumping / CVD / Safeguard duty notification checked'}]},
  {name:'Documentation & Declaration',items:[
   {id:'hs16',text:'Same HS code used in Invoice, Packing List, BL and Shipping Bill',critical:true},
   {id:'hs17',text:'Advance Ruling obtained from CAAR if classification is uncertain'},
   {id:'hs18',text:'CHA has reviewed and agreed to the classification'},
   {id:'hs19',text:'Sample product retained for potential physical examination'}]}],
 buttonLabel:'Check Classification Readiness',
 results:CHECKLIST_RESULTS,
 logic:CHECKLIST_LOGIC,
 assumptions:'HS codes have 8 digits in India (ITC-HS). First 6 digits internationally harmonised. Digits 7–8 are India-specific. Classify fresh for each new product.',
 faq:[
  {q:'What is an HS code and why is it important?',a:'HS (Harmonised System) code is a 6–8 digit number classifying every traded product for customs. It determines duty rate, import policy, export incentives and trade statistics. Wrong classification attracts penalties up to 5× the duty evaded.'},
  {q:'What is an Advance Ruling for HS classification?',a:'An Advance Ruling from CAAR is a binding decision on correct HS classification, binding on all customs stations. It provides certainty and protects against retrospective classification disputes.'},
  {q:'Who can help with HS classification?',a:'A licensed CHA can advise on classification. For complex products, consult a trade compliance specialist or apply to CAAR for an Advance Ruling before importing/exporting for the first time.'}]});

writeTools(T);
const n=T.length;
console.log('Import & Export tools written:',n);
