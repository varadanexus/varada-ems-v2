import { writeTools, CHECKLIST_LOGIC, CHECKLIST_RESULTS, D } from './_seedlib.mjs';
const REL=[{label:'Trading & Commerce Services',url:'/trading.html'},{label:'Contact Us',url:'/contact.html'}];
const T=[];
const push=o=>{o.cat='trading-commerce';o.related=o.related||REL;T.push(o);};

const inr=`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');`;

/* 1. Trade Margin Calculator */
push({id:'trade-margin-calculator',name:'Trade Margin Calculator',
 short:'Calculate gross and net margin on any trading transaction',
 intro:'Analyse the profitability of any trading deal by computing gross margin, net margin and return on cost — covering purchase price, overheads and all direct expenses.',
 seo:{title:'Trade Margin Calculator – Gross Net Profit Margin Trading India',description:'Calculate gross and net profit margin for trading businesses. Enter purchase cost, selling price and overheads to get margin %, markup % and return on cost.',keywords:['trade margin calculator','trading profit margin India','gross margin calculator','net margin trading','markup vs margin calculator']},
 inputs:[
  {id:'purchase_price',label:'Purchase Price per Unit (₹)',type:'number',default:800,min:1},
  {id:'selling_price',label:'Selling Price per Unit (₹)',type:'number',default:1200,min:1},
  {id:'quantity',label:'Quantity (units)',type:'number',default:500,min:1},
  {id:'overhead_per_unit',label:'Overhead per Unit (₹)',type:'number',default:60,min:0,hint:'Storage, distribution, commission'},
  {id:'tax_rate',label:'Tax / GST Rate (%)',type:'number',default:18,min:0,max:28,hint:'Enter 0 if prices are GST-exclusive'}],
 results:{rowFmt:'raw',columns:['Metric','Calculation','Value'],kpis:[{key:'k1',label:'Gross Margin %',format:'text'},{key:'k2',label:'Net Margin %',format:'text'},{key:'k3',label:'Net Profit (Total)',format:'text'}]},
 assumptions:'Gross margin = (SP − PP) / SP × 100. Net margin after overheads. Tax on revenue for P&L clarity.',
 faq:[
  {q:'What is the difference between margin and markup?',a:'Margin is profit as a % of selling price. Markup is profit as a % of cost. A 25% margin equals a 33.3% markup. Always clarify which metric buyers or accountants are referring to.'},
  {q:'What is a healthy gross margin for traders?',a:'Depends on industry: commodity trading 2–8%, branded goods 20–40%, specialty/niche products 40–60%. Net margin after all costs is typically 5–15% for healthy trading businesses.'},
  {q:'How does GST affect trading margins?',a:'GST is a pass-through for GST-registered traders (input credit available). For unregistered businesses or B2C with no ITC, GST directly reduces effective margin.'}],
 logic:`${inr}
export function compute(v){
  const pp=+v.purchase_price||800,sp=+v.selling_price||1200,qty=+v.quantity||500;
  const oh=+v.overhead_per_unit||60,taxR=+v.tax_rate||18;
  const revenue=sp*qty;
  const cogs=pp*qty;
  const grossProfit=revenue-cogs;
  const grossMargin=Math.round(grossProfit/revenue*1000)/10;
  const markup=Math.round((sp-pp)/pp*1000)/10;
  const netProfit=grossProfit-oh*qty;
  const netMargin=Math.round(netProfit/revenue*1000)/10;
  const tax=Math.round(revenue*taxR/100);
  const roc=Math.round(netProfit/cogs*1000)/10;
  return{
    rows:[
      ['Revenue',qty+' × ₹'+sp,inr(revenue)],
      ['COGS',qty+' × ₹'+pp,inr(cogs)],
      ['Gross Profit','',inr(grossProfit)],
      ['Overheads',qty+' × ₹'+oh,inr(oh*qty)],
      ['Net Profit','',inr(netProfit)],
      ['Markup %','(SP−PP)/PP',markup+'%'],
      ['Return on Cost','Profit / COGS',roc+'%']],
    k1:grossMargin+'%',k2:netMargin+'%',k3:inr(netProfit)};
}`});

/* 2. Inventory Turnover Calculator */
push({id:'inventory-turnover-calculator',name:'Inventory Turnover Calculator',
 short:'Measure how fast your stock converts to sales',
 intro:'Calculate inventory turnover ratio and days sales in inventory to identify slow-moving stock, optimise ordering cycles and improve working capital efficiency.',
 seo:{title:'Inventory Turnover Calculator – Days Sales Inventory India',description:'Calculate inventory turnover ratio and days sales in inventory (DSI). Identify slow-moving stock and improve working capital for trading businesses.',keywords:['inventory turnover calculator','days sales inventory','stock turnover ratio India','inventory management calculator','working capital inventory']},
 inputs:[
  {id:'cogs_annual',label:'Annual Cost of Goods Sold (₹)',type:'number',default:5000000,min:10000,hint:'Total purchase cost of goods sold in the year'},
  {id:'opening_inventory',label:'Opening Inventory Value (₹)',type:'number',default:800000,min:0},
  {id:'closing_inventory',label:'Closing Inventory Value (₹)',type:'number',default:600000,min:0},
  {id:'holding_cost_pct',label:'Annual Inventory Holding Cost (%)',type:'number',default:20,min:0,max:50,hint:'Storage, insurance, obsolescence, finance cost'}],
 results:{rowFmt:'raw',columns:['KPI','Formula','Value'],kpis:[{key:'k1',label:'Turnover Ratio',format:'text'},{key:'k2',label:'Days Sales in Inventory',format:'text'},{key:'k3',label:'Annual Holding Cost',format:'text'}]},
 assumptions:'Average inventory = (opening + closing) / 2. DSI = 365 / turnover ratio. Holding cost on average inventory.',
 faq:[
  {q:'What is a good inventory turnover ratio?',a:'Varies by industry: grocery 12–24x, electronics 6–12x, furniture 4–6x, jewellery 2–4x. Higher turnover generally means better cash efficiency but watch for stockout risk.'},
  {q:'How do I improve inventory turnover?',a:'ABC analysis to prioritise fast movers, reduce reorder quantities for slow movers, use demand forecasting, negotiate just-in-time delivery, and run clearance promotions on dead stock.'},
  {q:'What is Dead Stock and how costly is it?',a:'Dead stock is inventory with no sales for 6+ months. The true cost includes purchase price, storage, finance cost, and opportunity cost — typically 25–40% of inventory value per year.'}],
 logic:`${inr}
export function compute(v){
  const cogs=+v.cogs_annual||5000000;
  const open=+v.opening_inventory||800000,close=+v.closing_inventory||600000;
  const holdR=+v.holding_cost_pct||20;
  const avgInv=(open+close)/2;
  const turnover=Math.round(cogs/avgInv*100)/100;
  const dsi=Math.round(365/turnover);
  const holdCost=Math.round(avgInv*holdR/100);
  const costPerDay=Math.round(holdCost/365);
  return{
    rows:[
      ['COGS (Annual)','',inr(cogs)],
      ['Average Inventory','('+inr(open)+'+'+inr(close)+')/2',inr(avgInv)],
      ['Turnover Ratio','COGS / Avg Inv',turnover+'x'],
      ['Days Sales in Inventory','365 / Turnover',dsi+' days'],
      ['Annual Holding Cost',holdR+'% of Avg Inv',inr(holdCost)],
      ['Daily Holding Cost','',inr(costPerDay)+'/day']],
    k1:turnover+'x',k2:dsi+' days',k3:inr(holdCost)};
}`});

/* 3. Purchase Order Cost Calculator */
push({id:'purchase-order-cost-calculator',name:'Purchase Order Cost Calculator',
 short:'Calculate total cost of a purchase order including all charges',
 intro:'Get the complete landed cost of a purchase order — covering supplier price, freight, insurance, taxes and handling — to make accurate bid pricing and margin decisions.',
 seo:{title:'Purchase Order Cost Calculator – Total PO Cost India',description:'Calculate complete purchase order cost including freight, insurance, taxes and handling. Get total PO value, cost per unit and landed cost for trading businesses.',keywords:['purchase order cost calculator','PO cost calculator India','landed cost calculator trading','total procurement cost','purchase cost per unit']},
 inputs:[
  {id:'unit_price',label:'Supplier Price per Unit (₹)',type:'number',default:450,min:1},
  {id:'quantity',label:'Order Quantity (units)',type:'number',default:1000,min:1},
  {id:'freight',label:'Freight Charges (₹)',type:'number',default:8000,min:0},
  {id:'insurance',label:'Insurance (₹)',type:'number',default:1500,min:0},
  {id:'gst_rate',label:'GST Rate (%)',type:'number',default:18,min:0,max:28},
  {id:'handling_charges',label:'Handling / Unloading (₹)',type:'number',default:2000,min:0},
  {id:'inspection_cost',label:'Inspection / QC Cost (₹)',type:'number',default:1000,min:0}],
 results:{rowFmt:'raw',columns:['Cost Component','Details','Amount (₹)'],kpis:[{key:'k1',label:'Total PO Value',format:'text'},{key:'k2',label:'Landed Cost / Unit',format:'text'},{key:'k3',label:'GST Paid (ITC)',format:'text'}]},
 assumptions:'GST on supplier price × quantity only. Freight, insurance, handling added to arrive at landed cost.',
 faq:[
  {q:'What is landed cost in trading?',a:'Landed cost is the total cost of goods at your warehouse — purchase price + all freight + insurance + taxes + handling. It is the true cost basis for margin calculations.'},
  {q:'Can I claim ITC on purchase GST?',a:'Yes, GST-registered traders can claim Input Tax Credit on GST paid on purchases, reducing the net GST liability against sales. Ensure supplier provides a valid GST invoice.'},
  {q:'When should I insure a purchase order?',a:'Insure shipments above ₹50,000 or any high-value / fragile goods. Marine / inland transit insurance costs 0.1–0.5% of goods value and protects against total loss.'}],
 logic:`${inr}
export function compute(v){
  const up=+v.unit_price||450,qty=+v.quantity||1000;
  const freight=+v.freight||8000,ins=+v.insurance||1500;
  const gstR=+v.gst_rate||18,handling=+v.handling_charges||2000,qc=+v.inspection_cost||1000;
  const base=up*qty;
  const gst=Math.round(base*gstR/100);
  const total=base+gst+freight+ins+handling+qc;
  const perUnit=Math.round(total/qty);
  return{
    rows:[
      ['Supplier Base Price',qty+' × ₹'+up,inr(base)],
      ['GST',gstR+'%',inr(gst)],
      ['Freight','',inr(freight)],
      ['Insurance','',inr(ins)],
      ['Handling / Unloading','',inr(handling)],
      ['Inspection / QC','',inr(qc)],
      ['Total PO Cost','',inr(total)]],
    k1:inr(total),k2:inr(perUnit)+'/unit',k3:inr(gst)};
}`});

/* 4. Sales Commission Calculator */
push({id:'sales-commission-calculator',name:'Sales Commission Calculator',
 short:'Calculate agent and team commissions on trade transactions',
 intro:'Compute sales commissions for agents, distributors or sales teams — supporting tiered structures, flat rates and volume bonuses to incentivise performance accurately.',
 seo:{title:'Sales Commission Calculator – Agent Distributor Commission India',description:'Calculate sales agent and distributor commissions for trading businesses. Supports tiered commission, flat rates and volume bonuses. Get net revenue after commission.',keywords:['sales commission calculator','agent commission calculator India','distributor commission trading','tiered commission calculator','sales incentive calculator']},
 inputs:[
  {id:'sales_value',label:'Total Sales Value (₹)',type:'number',default:1000000,min:1000},
  {id:'base_commission',label:'Base Commission Rate (%)',type:'number',default:3,min:0,max:30},
  {id:'target_value',label:'Target for Bonus Commission (₹)',type:'number',default:1000000,min:0,hint:'Sales target above which bonus applies'},
  {id:'bonus_rate',label:'Bonus Commission Rate (%)',type:'number',default:1,min:0,max:20,hint:'Extra % on sales above target'},
  {id:'gst_on_commission',label:'GST on Commission (%)',type:'number',default:18,min:0,max:18,hint:'18% GST on commission (TDS may also apply)'}],
 results:{rowFmt:'raw',columns:['Component','Calculation','Amount (₹)'],kpis:[{key:'k1',label:'Total Commission',format:'text'},{key:'k2',label:'Effective Rate',format:'text'},{key:'k3',label:'Net Revenue',format:'text'}]},
 assumptions:'Bonus commission applies on sales above target. GST on total commission payable.',
 faq:[
  {q:'What TDS applies on commissions?',a:'TDS under Section 194H is deducted at 5% on commission to agents (excluding employees) where annual payments exceed ₹15,000.'},
  {q:'What is a typical agent commission in India?',a:'Varies widely: consumer goods 2–5%, industrial products 3–8%, specialty products 5–15%, pharmaceutical/MedTech 5–10%. Higher margins allow higher commissions.'},
  {q:'Should I structure a tiered commission plan?',a:'Yes — tiered commissions drive growth by rewarding over-achievement. A base rate for standard volumes and a higher rate above target creates strong sales motivation.'}],
 logic:`${inr}
export function compute(v){
  const sv=+v.sales_value||1000000,baseR=+v.base_commission||3;
  const target=+v.target_value||1000000,bonusR=+v.bonus_rate||1,gstR=+v.gst_on_commission||18;
  const baseComm=Math.round(sv*baseR/100);
  const aboveTarget=Math.max(0,sv-target);
  const bonusComm=Math.round(aboveTarget*bonusR/100);
  const totalPreGst=baseComm+bonusComm;
  const gst=Math.round(totalPreGst*gstR/100);
  const totalComm=totalPreGst+gst;
  const effRate=Math.round(totalPreGst/sv*1000)/10;
  const netRevenue=sv-totalComm;
  return{
    rows:[
      ['Base Commission',baseR+'% of ₹'+sv.toLocaleString('en-IN'),inr(baseComm)],
      ['Bonus Commission',bonusR+'% of ₹'+aboveTarget.toLocaleString('en-IN'),inr(bonusComm)],
      ['Total Commission (pre-GST)','',inr(totalPreGst)],
      ['GST on Commission',gstR+'%',inr(gst)],
      ['Total Commission (incl GST)','',inr(totalComm)],
      ['Net Revenue after Commission','',inr(netRevenue)]],
    k1:inr(totalComm),k2:effRate+'%',k3:inr(netRevenue)};
}`});

/* 5. Wholesale Price Calculator */
push({id:'wholesale-price-calculator',name:'Wholesale Price Calculator',
 short:'Set competitive wholesale prices from cost to retail',
 intro:'Calculate optimal wholesale pricing by stacking all costs and desired margins, ensuring healthy returns while leaving room for your distributor and retailer to make a profit.',
 seo:{title:'Wholesale Price Calculator – Distributor Retail Price India',description:'Calculate wholesale, distributor and retailer prices from your cost. Set margins at each level to build a profitable pricing chain for your trading business.',keywords:['wholesale price calculator','distributor price calculator India','retail price calculator','pricing chain calculator','wholesale margin India']},
 inputs:[
  {id:'cogs_unit',label:'Cost of Goods per Unit (₹)',type:'number',default:300,min:1},
  {id:'overheads_unit',label:'Overheads per Unit (₹)',type:'number',default:40,min:0},
  {id:'mfg_margin',label:'Your (Manufacturer/Trader) Margin (%)',type:'number',default:20,min:0,max:100},
  {id:'distributor_margin',label:'Distributor Margin (%)',type:'number',default:15,min:0,max:100},
  {id:'retailer_margin',label:'Retailer Margin (%)',type:'number',default:30,min:0,max:100},
  {id:'gst_rate',label:'GST Rate (%)',type:'number',default:12,min:0,max:28}],
 results:{rowFmt:'raw',columns:['Price Level','Ex-GST (₹)','Incl GST (₹)'],kpis:[{key:'k1',label:'Your Selling Price',format:'text'},{key:'k2',label:'MRP (Consumer Price)',format:'text'},{key:'k3',label:'Your Profit / Unit',format:'text'}]},
 assumptions:'Each level margin applied on own selling price (not on cost). GST computed on each level.',
 faq:[
  {q:'What is MRP and is it mandatory?',a:'MRP (Maximum Retail Price) is the maximum price a retailer may charge consumers. Under Legal Metrology Act, it must be printed on pre-packaged goods. Selling above MRP is an offence.'},
  {q:'What is the difference between trade discount and margin?',a:'Margin is profit as % of selling price. Trade discount is % off MRP given to channel. A 30% margin = 30% trade discount off the MRP to arrive at retailer landing price.'},
  {q:'How do I set price bands for different channels?',a:'Set separate price lists: Manufacturer Selling Price (MSP) → Distributor Price (DP) → Retailer Price (RP) → Consumer Price (MRP). Each level should have 10–40% margin to stay motivated.'}],
 logic:`${inr}
export function compute(v){
  const cogs=+v.cogs_unit||300,oh=+v.overheads_unit||40;
  const mfgM=+v.mfg_margin||20,distM=+v.distributor_margin||15;
  const retM=+v.retailer_margin||30,gstR=+v.gst_rate||12;
  const cost=cogs+oh;
  const msp=Math.round(cost/(1-mfgM/100));
  const dp=Math.round(msp/(1-distM/100));
  const rp=Math.round(dp/(1-retM/100));
  const gst=r=>Math.round(r*gstR/100);
  const profit=msp-cost;
  return{
    rows:[
      ['Your Cost (COGS + OH)','',inr(cost)],
      ['Your Selling Price (MSP)',mfgM+'% margin',inr(msp)],
      ['Distributor Price (DP)',distM+'% margin',inr(dp)],
      ['Consumer Price (MRP)',retM+'% retail margin',inr(rp)],
      ['MSP incl GST',gstR+'%',inr(msp+gst(msp))],
      ['MRP incl GST',gstR+'%',inr(rp+gst(rp))]],
    k1:inr(msp)+'/unit',k2:inr(rp+gst(rp))+'/unit',k3:inr(profit)+'/unit'};
}`});

/* 6. Trade Finance Cost Calculator */
push({id:'trade-finance-cost-calculator',name:'Trade Finance Cost Calculator',
 short:'Calculate total cost of trade credit and working capital finance',
 intro:'Estimate the total cost of trade finance options — bank overdraft, CC limit, bill discounting or LC — to choose the cheapest funding for your trading cycle.',
 seo:{title:'Trade Finance Cost Calculator – CC OD Bill Discounting India',description:'Calculate trade finance cost: cash credit, overdraft, bill discounting and LC. Compare annualised costs to choose the cheapest working capital for your trade cycle.',keywords:['trade finance cost calculator','cash credit cost India','bill discounting calculator','working capital cost trading','LC cost calculator']},
 inputs:[
  {id:'finance_amount',label:'Finance Required (₹)',type:'number',default:2000000,min:10000},
  {id:'finance_type',label:'Finance Type',type:'select',default:'cc',options:[{v:'cc',t:'Cash Credit / OD (rotating)'},{v:'bill',t:'Bill Discounting'},{v:'lc',t:'Letter of Credit (LC)'},{v:'term',t:'Short-Term Loan'}]},
  {id:'interest_rate',label:'Interest / Discount Rate (% p.a.)',type:'number',default:10.5,min:1,max:30},
  {id:'utilization_days',label:'Utilization Period (days)',type:'number',default:90,min:1,max:365},
  {id:'processing_fee',label:'Processing / LC Opening Fee (₹)',type:'number',default:5000,min:0},
  {id:'other_charges',label:'Other Bank Charges (₹)',type:'number',default:2000,min:0}],
 results:{rowFmt:'raw',columns:['Cost Component','Basis','Amount (₹)'],kpis:[{key:'k1',label:'Total Finance Cost',format:'text'},{key:'k2',label:'Annualised Cost %',format:'text'},{key:'k3',label:'Cost per ₹1 Lakh',format:'text'}]},
 assumptions:'Interest = principal × rate × days / 365. Annualised cost = total cost / principal × (365 / days).',
 faq:[
  {q:'When is bill discounting better than CC?',a:'Bill discounting (against sales invoices) is typically cheaper (9–11%) and self-liquidating. CC is more flexible but carries higher non-utilization penalties. Use bill discounting for short, defined cycles.'},
  {q:'What is the effective cost of an LC?',a:'LC costs include opening commission (0.5–1% p.a.), advising fees, document handling, and any deferred payment premium. Total effective cost is typically 1–2% above plain bank rate.'},
  {q:'What is MCLR and how does it affect my rate?',a:'MCLR (Marginal Cost of Lending Rate) is the minimum rate below which banks cannot lend. CC/OD rates are MCLR + spread (1–3%). Always negotiate the spread and monitor MCLR resets quarterly.'}],
 logic:`${inr}
export function compute(v){
  const amt=+v.finance_amount||2000000,rate=+v.interest_rate||10.5;
  const days=+v.utilization_days||90,proc=+v.processing_fee||5000,other=+v.other_charges||2000;
  const ft=v.finance_type||'cc';
  const interest=Math.round(amt*rate/100*days/365);
  const gstOnInt=Math.round(interest*0.18);
  const totalCost=interest+gstOnInt+proc+other;
  const annCost=Math.round(totalCost/amt*(365/days)*1000)/10;
  const per1L=Math.round(totalCost/amt*100000);
  const typeLabel={'cc':'Cash Credit / OD','bill':'Bill Discounting','lc':'Letter of Credit','term':'Short-Term Loan'};
  return{
    rows:[
      ['Finance Type',typeLabel[ft]||ft,''],
      ['Finance Amount','',inr(amt)],
      ['Interest',rate+'% × '+days+' days / 365',inr(interest)],
      ['GST on Interest','18%',inr(gstOnInt)],
      ['Processing / LC Fee','',inr(proc)],
      ['Other Bank Charges','',inr(other)],
      ['Total Finance Cost','',inr(totalCost)]],
    k1:inr(totalCost),k2:annCost+'%',k3:inr(per1L)+'/₹1 lakh'};
}`});

/* 7. Stock Reorder Point Calculator */
push({id:'stock-reorder-point-calculator',name:'Stock Reorder Point Calculator',
 short:'Never stock out — calculate when to reorder and how much',
 intro:'Determine the precise reorder point and Economic Order Quantity for each product in your inventory to minimise stockouts and excess holding costs simultaneously.',
 seo:{title:'Stock Reorder Point Calculator – EOQ Safety Stock India',description:'Calculate stock reorder point, safety stock and Economic Order Quantity (EOQ). Prevent stockouts while minimising holding costs for trading businesses.',keywords:['reorder point calculator','EOQ calculator India','safety stock calculator','inventory reorder level','economic order quantity']},
 inputs:[
  {id:'daily_demand',label:'Average Daily Demand (units)',type:'number',default:50,min:1},
  {id:'lead_time_days',label:'Supplier Lead Time (days)',type:'number',default:7,min:1},
  {id:'max_daily_demand',label:'Maximum Daily Demand (units)',type:'number',default:80,min:1,hint:'For safety stock calculation'},
  {id:'annual_demand',label:'Annual Demand (units)',type:'number',default:18000,min:1},
  {id:'ordering_cost',label:'Cost per Order (₹)',type:'number',default:500,min:1,hint:'Purchase order processing cost'},
  {id:'unit_cost',label:'Unit Purchase Cost (₹)',type:'number',default:400,min:1},
  {id:'holding_rate',label:'Annual Holding Cost (% of unit cost)',type:'number',default:25,min:1,max:80}],
 results:{rowFmt:'raw',columns:['Parameter','Formula','Value'],kpis:[{key:'k1',label:'Reorder Point',format:'text'},{key:'k2',label:'Safety Stock',format:'text'},{key:'k3',label:'EOQ (units)',format:'text'}]},
 assumptions:'Safety stock = (Max daily demand − avg demand) × lead time. EOQ = √(2 × annual demand × ordering cost / holding cost per unit).',
 faq:[
  {q:'What happens if I reorder too late?',a:'Stockouts mean lost sales, emergency procurement at high cost, and damaged customer relationships. Missed deliveries can cause contract penalties in B2B trading.'},
  {q:'What is safety stock?',a:'Safety stock is buffer inventory held to absorb demand spikes and supplier delays. It is the minimum stock you should never go below before placing the next order.'},
  {q:'Should I use EOQ for all products?',a:'EOQ works best for items with relatively stable demand. For high-value, slow-moving items use Just-In-Time. For highly seasonal items, use seasonal demand profiles instead.'}],
 logic:`${inr}
export function compute(v){
  const daily=+v.daily_demand||50,lt=+v.lead_time_days||7;
  const maxDaily=+v.max_daily_demand||80,annDem=+v.annual_demand||18000;
  const orderCost=+v.ordering_cost||500,uc=+v.unit_cost||400,holdR=+v.holding_rate||25;
  const safetyStock=Math.round((maxDaily-daily)*lt);
  const rop=Math.round(daily*lt+safetyStock);
  const holdCostUnit=Math.round(uc*holdR/100);
  const eoq=Math.round(Math.sqrt(2*annDem*orderCost/holdCostUnit));
  const ordersPerYear=Math.round(annDem/eoq*10)/10;
  const totalHoldCost=Math.round(eoq/2*holdCostUnit);
  const totalOrderCost=Math.round(ordersPerYear*orderCost);
  return{
    rows:[
      ['Safety Stock','('+maxDaily+'−'+daily+') × '+lt+' days',safetyStock+' units'],
      ['Reorder Point (ROP)',daily+' × '+lt+' + '+safetyStock,rop+' units'],
      ['EOQ','√(2 × '+annDem+' × ₹'+orderCost+' / ₹'+holdCostUnit+')',eoq+' units'],
      ['Orders per Year',annDem+' / '+eoq,ordersPerYear],
      ['Annual Holding Cost (EOQ)','',inr(totalHoldCost)],
      ['Annual Ordering Cost','',inr(totalOrderCost)]],
    k1:rop+' units',k2:safetyStock+' units',k3:eoq+' units'};
}`});

/* 8. VAT / GST Payable Calculator */
push({id:'vat-gst-payable-calculator',name:'GST Payable Calculator',
 short:'Calculate net GST liability after input tax credit',
 intro:'Compute your net GST/VAT payable for any period by offsetting output tax on sales against input tax credit on purchases — for traders dealing in multiple GST slabs.',
 seo:{title:'GST Payable Calculator – Input Tax Credit Trading India',description:'Calculate net GST liability for traders. Offset input tax credit on purchases against output GST on sales. Supports multiple GST slabs and reverse charge.',keywords:['GST payable calculator India','input tax credit calculator','net GST liability trading','ITC offset calculator','GST for traders India']},
 inputs:[
  {id:'sales_5',label:'Sales at 5% GST (₹)',type:'number',default:0,min:0},
  {id:'sales_12',label:'Sales at 12% GST (₹)',type:'number',default:500000,min:0},
  {id:'sales_18',label:'Sales at 18% GST (₹)',type:'number',default:300000,min:0},
  {id:'sales_28',label:'Sales at 28% GST (₹)',type:'number',default:0,min:0},
  {id:'purchase_itc',label:'Total ITC Available on Purchases (₹)',type:'number',default:80000,min:0,hint:'From purchase invoices this period'},
  {id:'itc_reversal',label:'ITC Reversal (₹)',type:'number',default:0,min:0,hint:'Ineligible / blocked credits to reverse'}],
 results:{rowFmt:'raw',columns:['GST Component','Amount (₹)','Notes'],kpis:[{key:'k1',label:'Output GST',format:'text'},{key:'k2',label:'Net GST Payable',format:'text'},{key:'k3',label:'Effective GST Rate',format:'text'}]},
 assumptions:'Output GST = sum across all slabs. Net payable = Output GST − (ITC − ITC reversal). ITC hierarchy (IGST first, then CGST/SGST) not applied here.',
 faq:[
  {q:'What is Input Tax Credit (ITC)?',a:'ITC is the GST you paid on purchases that can be offset against GST payable on sales. Only GST-registered buyers with valid tax invoices can claim ITC.'},
  {q:'When is ITC blocked or reversed?',a:'ITC is blocked on motor vehicles (unless for resale/transport), food, beauty, employee perks, and goods used for exempt supply. It must be reversed if payment to supplier is not made within 180 days.'},
  {q:'What is the GST filing deadline for traders?',a:'Monthly GSTR-1 (sales): 11th of next month. GSTR-3B (payment): 20th of next month. Quarterly filers (turnover < ₹5 crore) follow quarterly deadlines under QRMP scheme.'}],
 logic:`${inr}
export function compute(v){
  const s5=+v.sales_5||0,s12=+v.sales_12||500000;
  const s18=+v.sales_18||300000,s28=+v.sales_28||0;
  const itc=+v.purchase_itc||80000,rev=+v.itc_reversal||0;
  const out5=Math.round(s5*5/100),out12=Math.round(s12*12/100);
  const out18=Math.round(s18*18/100),out28=Math.round(s28*28/100);
  const totalOut=out5+out12+out18+out28;
  const netItc=Math.max(0,itc-rev);
  const netPayable=Math.max(0,totalOut-netItc);
  const totalSales=s5+s12+s18+s28;
  const effRate=totalSales>0?Math.round(totalOut/totalSales*1000)/10:0;
  return{
    rows:[
      ['Output GST @ 5%',inr(s5)+' sales',inr(out5)],
      ['Output GST @ 12%',inr(s12)+' sales',inr(out12)],
      ['Output GST @ 18%',inr(s18)+' sales',inr(out18)],
      ['Output GST @ 28%',inr(s28)+' sales',inr(out28)],
      ['Total Output GST','',inr(totalOut)],
      ['Less: Net ITC','After reversal of '+inr(rev),inr(netItc)],
      ['Net GST Payable','',inr(netPayable)]],
    k1:inr(totalOut),k2:inr(netPayable),k3:effRate+'%'};
}`});

/* 9. Trade Receivables Ageing Calculator */
push({id:'trade-receivables-ageing-calculator',name:'Trade Receivables Ageing Calculator',
 short:'Analyse outstanding receivables and estimate bad debt exposure',
 intro:'Bucket your outstanding trade receivables by ageing — current, 30, 60, 90+ days — to assess collection health, estimate bad debt provisions and focus recovery efforts.',
 seo:{title:'Trade Receivables Ageing Calculator – Debtor Ageing India',description:'Analyse trade receivables by ageing buckets. Calculate bad debt provision and collection efficiency for trading businesses in India.',keywords:['trade receivables ageing India','debtor ageing calculator','bad debt provision calculator','accounts receivable ageing','collection efficiency trading']},
 inputs:[
  {id:'current',label:'Current (0–30 days) (₹)',type:'number',default:500000,min:0},
  {id:'days_30_60',label:'31–60 Days (₹)',type:'number',default:200000,min:0},
  {id:'days_60_90',label:'61–90 Days (₹)',type:'number',default:100000,min:0},
  {id:'days_90_plus',label:'91–180 Days (₹)',type:'number',default:80000,min:0},
  {id:'days_180_plus',label:'180+ Days (₹)',type:'number',default:40000,min:0},
  {id:'monthly_sales',label:'Average Monthly Sales (₹)',type:'number',default:600000,min:1}],
 results:{rowFmt:'raw',columns:['Ageing Bucket','Amount (₹)','Est. Bad Debt %'],kpis:[{key:'k1',label:'Total Receivables',format:'text'},{key:'k2',label:'Debtors Days (DSO)',format:'text'},{key:'k3',label:'Bad Debt Provision',format:'text'}]},
 assumptions:'Bad debt %: 0–30d: 0%, 31–60d: 2%, 61–90d: 10%, 91–180d: 25%, 180+d: 50%. DSO = total receivables / (monthly sales / 30).',
 faq:[
  {q:'What is Days Sales Outstanding (DSO)?',a:'DSO = (total receivables / annual sales) × 365. It measures average number of days to collect payment after a sale. Industry benchmark is typically 30–45 days for trading businesses.'},
  {q:'When should I write off a receivable?',a:'Receivables over 180 days require serious review. Under IT Act, bad debt deduction needs genuine write-off in books. Issue legal notice before writing off; engage a collection agency for large amounts.'},
  {q:'How to reduce overdue receivables?',a:'Credit check new customers before extending terms, enforce credit limits, send reminders at 15/30/45 days, incentivise early payment with 2% discount, and act fast on overdue accounts.'}],
 logic:`${inr}
export function compute(v){
  const c0=+v.current||500000,c30=+v.days_30_60||200000;
  const c60=+v.days_60_90||100000,c90=+v.days_90_plus||80000;
  const c180=+v.days_180_plus||40000,mSales=+v.monthly_sales||600000;
  const total=c0+c30+c60+c90+c180;
  const bd=Math.round(c0*0+c30*0.02+c60*0.10+c90*0.25+c180*0.50);
  const dso=Math.round(total/(mSales/30));
  const pct=r=>Math.round(r/total*1000)/10;
  return{
    rows:[
      ['0–30 days (Current)',inr(c0)+' ('+pct(c0)+'%)','0%'],
      ['31–60 days',inr(c30)+' ('+pct(c30)+'%)','2%'],
      ['61–90 days',inr(c60)+' ('+pct(c60)+'%)','10%'],
      ['91–180 days',inr(c90)+' ('+pct(c90)+'%)','25%'],
      ['180+ days',inr(c180)+' ('+pct(c180)+'%)','50%'],
      ['Bad Debt Provision','',inr(bd)]],
    k1:inr(total),k2:dso+' days',k3:inr(bd)};
}`});

/* 10. Discount & Rebate Calculator */
push({id:'discount-rebate-calculator',name:'Discount & Rebate Calculator',
 short:'Calculate trade discounts, cash discounts and annual rebates',
 intro:'Model different discount and rebate structures for buyers — trade discounts, cash discounts and annual volume rebates — to understand net price and true margin impact.',
 seo:{title:'Discount Rebate Calculator – Trade Cash Discount India',description:'Calculate trade discount, cash discount and annual volume rebates. Understand net effective price and margin impact for trading and wholesale businesses.',keywords:['trade discount calculator India','cash discount calculator','volume rebate calculator','discount rebate trading','net price after discount India']},
 inputs:[
  {id:'list_price',label:'List Price per Unit (₹)',type:'number',default:1000,min:1},
  {id:'quantity',label:'Quantity (units)',type:'number',default:200,min:1},
  {id:'trade_discount',label:'Trade Discount (%)',type:'number',default:10,min:0,max:80},
  {id:'cash_discount',label:'Cash Discount (%) — if paid early',type:'number',default:2,min:0,max:20},
  {id:'annual_rebate',label:'Annual Volume Rebate (%)',type:'number',default:1.5,min:0,max:20,hint:'End-of-year rebate on annual purchase value'},
  {id:'annual_purchase_value',label:'Expected Annual Purchase Value (₹)',type:'number',default:2000000,min:0}],
 results:{rowFmt:'raw',columns:['Discount Layer','On Amount (₹)','Savings (₹)'],kpis:[{key:'k1',label:'Net Price / Unit',format:'text'},{key:'k2',label:'Effective Discount %',format:'text'},{key:'k3',label:'Annual Rebate',format:'text'}]},
 assumptions:'Discounts applied sequentially: trade then cash. Annual rebate separate, credited at year end.',
 faq:[
  {q:'Should I offer cash discounts or better trade terms?',a:'Cash discounts (e.g., 2/10 net 30) improve collection and reduce financing cost — cost is typically lower than bank finance. Trade discounts build channel loyalty but directly reduce realisation.'},
  {q:'What is a volume rebate and how is it structured?',a:'A volume rebate is a credit given at year end when a buyer hits a purchase target. It can be flat (1.5% on all purchases above ₹10 lakh) or tiered (higher slabs for higher volumes).'},
  {q:'How do I set effective discount limits?',a:'Work backwards from your minimum acceptable margin. If minimum margin is 15% and COGS is ₹800, maximum net price is ₹800/(1−0.15) = ₹941. Any combination of discounts must still yield ≥₹941.'}],
 logic:`${inr}
export function compute(v){
  const lp=+v.list_price||1000,qty=+v.quantity||200;
  const tdR=+v.trade_discount||10,cdR=+v.cash_discount||2;
  const rebR=+v.annual_rebate||1.5,annPurch=+v.annual_purchase_value||2000000;
  const listTotal=lp*qty;
  const tradeDisc=Math.round(listTotal*tdR/100);
  const afterTrade=listTotal-tradeDisc;
  const cashDisc=Math.round(afterTrade*cdR/100);
  const netTotal=afterTrade-cashDisc;
  const netUnit=Math.round(netTotal/qty);
  const annRebate=Math.round(annPurch*rebR/100);
  const effDisc=Math.round((listTotal-netTotal)/listTotal*1000)/10;
  return{
    rows:[
      ['List Price',qty+' × ₹'+lp,inr(listTotal)],
      ['Trade Discount',tdR+'%','-'+inr(tradeDisc)],
      ['After Trade Discount','',inr(afterTrade)],
      ['Cash Discount (if taken)',cdR+'%','-'+inr(cashDisc)],
      ['Net Invoice Value','',inr(netTotal)],
      ['Annual Rebate (year-end)',rebR+'% on '+inr(annPurch),inr(annRebate)]],
    k1:inr(netUnit)+'/unit',k2:effDisc+'%',k3:inr(annRebate)};
}`});

/* 11. Shrinkage & Wastage Calculator */
push({id:'shrinkage-wastage-calculator',name:'Shrinkage & Wastage Calculator',
 short:'Measure stock shrinkage impact on profit and identify recovery needed',
 intro:'Quantify the profit impact of inventory shrinkage from theft, damage, spoilage and administrative errors — and calculate the extra sales needed to recover those losses.',
 seo:{title:'Shrinkage Wastage Calculator – Inventory Loss Retail Trading India',description:'Calculate inventory shrinkage and wastage cost impact for trading and retail businesses. Find extra sales needed to recover shrinkage losses.',keywords:['shrinkage calculator retail India','inventory wastage calculator','stock loss calculator','theft loss trading India','retail shrinkage rate']},
 inputs:[
  {id:'opening_stock_value',label:'Opening Stock Value (₹)',type:'number',default:2000000,min:1000},
  {id:'purchases',label:'Purchases during Period (₹)',type:'number',default:5000000,min:0},
  {id:'closing_stock_value',label:'Closing Stock Value (₹)',type:'number',default:1700000,min:0},
  {id:'cogs',label:'Actual Cost of Goods Sold (₹)',type:'number',default:5100000,min:0},
  {id:'gross_margin_pct',label:'Gross Margin (%)',type:'number',default:25,min:1,max:90}],
 results:{rowFmt:'raw',columns:['Metric','Calculation','Value'],kpis:[{key:'k1',label:'Shrinkage Amount',format:'text'},{key:'k2',label:'Shrinkage Rate %',format:'text'},{key:'k3',label:'Recovery Sales Needed',format:'text'}]},
 assumptions:'Expected closing stock = opening + purchases − COGS. Shrinkage = expected − actual closing. Recovery sales = shrinkage loss / gross margin.',
 faq:[
  {q:'What is a normal shrinkage rate?',a:'Retail industry average is 1.4–2% of sales. Grocery/food: 2–4% (spoilage). Electronics: 0.5–1%. Above 2% warrants investigation into theft, process failures or supplier short-shipments.'},
  {q:'How do I reduce shrinkage?',a:'Implement cycle counting, CCTV surveillance, staff background verification, two-person rules for inventory, supplier invoice reconciliation, and ERP-based real-time stock tracking.'},
  {q:'Is shrinkage tax deductible?',a:'Stock loss/shrinkage is deductible as a business expense under Income Tax Act when it is normal/expected loss. Abnormal loss (theft/fraud) requires police report and management approval for deduction.'}],
 logic:`${inr}
export function compute(v){
  const open=+v.opening_stock_value||2000000,purch=+v.purchases||5000000;
  const close=+v.closing_stock_value||1700000,cogs=+v.cogs||5100000,gm=+v.gross_margin_pct||25;
  const expectedClose=open+purch-cogs;
  const shrinkage=Math.max(0,expectedClose-close);
  const totalGoods=open+purch;
  const shrinkRate=Math.round(shrinkage/totalGoods*1000)/10;
  const recoverySales=gm>0?Math.round(shrinkage/(gm/100)):0;
  return{
    rows:[
      ['Opening Stock','',inr(open)],
      ['Purchases','',inr(purch)],
      ['COGS','',inr(cogs)],
      ['Expected Closing Stock','Open + Purch − COGS',inr(expectedClose)],
      ['Actual Closing Stock','',inr(close)],
      ['Shrinkage / Loss','Expected − Actual',inr(shrinkage)],
      ['Recovery Sales Needed','Shrinkage / '+gm+'% margin',inr(recoverySales)]],
    k1:inr(shrinkage),k2:shrinkRate+'%',k3:inr(recoverySales)};
}`});

/* 12. B2B Credit Limit Calculator */
push({id:'b2b-credit-limit-calculator',name:'B2B Credit Limit Calculator',
 short:'Set safe credit limits for wholesale buyers based on financial strength',
 intro:'Determine the maximum credit exposure for a business buyer by evaluating their monthly sales, payment history, net worth and industry risk — protecting your receivables book.',
 seo:{title:'B2B Credit Limit Calculator – Trade Credit Assessment India',description:'Calculate appropriate B2B credit limit for wholesale buyers. Based on monthly sales, payment history, net worth and industry risk for trading businesses.',keywords:['B2B credit limit calculator','trade credit assessment India','buyer credit limit trading','wholesale credit limit','credit risk calculator India']},
 inputs:[
  {id:'buyer_monthly_sales',label:"Buyer's Monthly Sales (₹)",type:'number',default:1000000,min:0},
  {id:'payment_history',label:'Payment History Score',type:'select',default:'good',options:[{v:'excellent',t:'Excellent (always on time)'},{v:'good',t:'Good (minor delays)'},{v:'average',t:'Average (occasional 30-day delays)'},{v:'poor',t:'Poor (frequent delays / disputes)'}]},
  {id:'years_in_business',label:"Buyer's Years in Business",type:'number',default:5,min:0},
  {id:'secured',label:'Security Available',type:'select',default:'none',options:[{v:'none',t:'No security'},{v:'partial',t:'Partial security (PDC / guarantee)'},{v:'full',t:'Full security (property / FD)'}]},
  {id:'industry_risk',label:'Industry Risk Level',type:'select',default:'medium',options:[{v:'low',t:'Low risk (FMCG, pharma, staples)'},{v:'medium',t:'Medium risk (industrial, B2B)'},{v:'high',t:'High risk (construction, hospitality)'}]}],
 results:{rowFmt:'raw',columns:['Factor','Score / Multiplier','Contribution'],kpis:[{key:'k1',label:'Recommended Credit Limit',format:'text'},{key:'k2',label:'Credit Period',format:'text'},{key:'k3',label:'Risk Band',format:'text'}]},
 assumptions:'Base limit = 20% of buyer monthly sales. Multipliers applied for payment history, tenure, security and industry risk.',
 faq:[
  {q:'How often should I review credit limits?',a:'Review annually or after any significant event — large order, late payment, change in buyer business, credit bureau alerts. For new buyers, start with 50% of calculated limit and review after 6 months.'},
  {q:'What payment security should I take?',a:'For B2B credit above ₹5 lakh: post-dated cheques or signed agreements. Above ₹20 lakh: personal guarantee of promoter. Above ₹50 lakh: property / FD / bank guarantee.'},
  {q:'Should I use a credit bureau report?',a:'Yes. CIBIL Commercial report (₹300–500) shows defaults, pending suits and bank exposure. Essential for first-time buyers and for limits above ₹5 lakh.'}],
 logic:`${inr}
export function compute(v){
  const mSales=+v.buyer_monthly_sales||1000000;
  const phMap={excellent:1.5,good:1.0,average:0.6,poor:0.3};
  const secMap={none:1.0,partial:1.3,full:1.8};
  const indMap={low:1.2,medium:1.0,high:0.7};
  const yearMult=+v.years_in_business>=10?1.3:+v.years_in_business>=5?1.1:+v.years_in_business>=2?0.9:0.6;
  const ph=phMap[v.payment_history]||1.0;
  const sec=secMap[v.secured]||1.0;
  const ind=indMap[v.industry_risk]||1.0;
  const baseLimit=mSales*0.20;
  const limit=Math.round(baseLimit*ph*sec*ind*yearMult/10000)*10000;
  const riskScore=ph*ind;
  const band=riskScore>=1.1?'Low Risk':riskScore>=0.7?'Medium Risk':'High Risk';
  const period=riskScore>=1.1?'45 days':riskScore>=0.7?'30 days':'Cash / 15 days';
  return{
    rows:[
      ['Base Limit (20% monthly sales)','₹'+mSales.toLocaleString('en-IN')+' × 20%',inr(baseLimit)],
      ['Payment History Multiplier',v.payment_history||'good','× '+ph],
      ['Security Multiplier',v.secured||'none','× '+sec],
      ['Industry Risk Multiplier',v.industry_risk||'medium','× '+ind],
      ['Tenure Multiplier',v.years_in_business+' years','× '+yearMult],
      ['Recommended Credit Limit','',inr(limit)]],
    k1:inr(limit),k2:period,k3:band};
}`});

/* 13. Return on Capital Employed Calculator */
push({id:'return-on-capital-employed-calculator',name:'Return on Capital Employed Calculator',
 short:'Measure how efficiently your trading business uses its capital',
 intro:'Calculate ROCE (Return on Capital Employed) to evaluate how effectively your trading operations generate profit from the total capital deployed in the business.',
 seo:{title:'Return on Capital Employed Calculator – ROCE Trading Business India',description:'Calculate ROCE for trading businesses. Measure profitability relative to capital deployed including fixed assets and working capital.',keywords:['ROCE calculator India','return on capital employed trading','capital efficiency calculator','EBIT capital employed','trading business profitability ratio']},
 inputs:[
  {id:'ebit',label:'EBIT (Operating Profit) (₹)',type:'number',default:1500000,min:0,hint:'Earnings Before Interest and Tax'},
  {id:'fixed_assets',label:'Fixed Assets (₹)',type:'number',default:3000000,min:0},
  {id:'current_assets',label:'Current Assets (₹)',type:'number',default:5000000,min:0,hint:'Inventory + receivables + cash'},
  {id:'current_liabilities',label:'Current Liabilities (₹)',type:'number',default:2000000,min:0,hint:'Trade payables + short-term debt'},
  {id:'annual_revenue',label:'Annual Revenue (₹)',type:'number',default:15000000,min:1}],
 results:{rowFmt:'raw',columns:['Metric','Formula','Value'],kpis:[{key:'k1',label:'ROCE',format:'text'},{key:'k2',label:'Asset Turnover',format:'text'},{key:'k3',label:'Capital Employed',format:'text'}]},
 assumptions:'Capital Employed = Fixed Assets + Net Working Capital. Net WC = Current Assets − Current Liabilities.',
 faq:[
  {q:'What is a good ROCE for a trading business?',a:'A ROCE above 15–20% is considered healthy for trading businesses. It should exceed the cost of capital (WACC). Compare against industry benchmarks and your own trend.'},
  {q:'How is ROCE different from ROE?',a:'ROCE uses total capital employed (debt + equity), giving a complete picture of business efficiency. ROE (Return on Equity) only measures returns to shareholders, inflated by high debt.'},
  {q:'How do I improve ROCE?',a:'Increase operating margin (reduce costs, improve pricing), reduce capital employed (sell idle assets, negotiate better supplier credit), or grow revenue faster than capital grows.'}],
 logic:`${inr}
export function compute(v){
  const ebit=+v.ebit||1500000,fa=+v.fixed_assets||3000000;
  const ca=+v.current_assets||5000000,cl=+v.current_liabilities||2000000;
  const rev=+v.annual_revenue||15000000;
  const nwc=ca-cl;
  const ce=fa+nwc;
  const roce=ce>0?Math.round(ebit/ce*1000)/10:0;
  const assetTurnover=Math.round(rev/ce*100)/100;
  const ebitMargin=Math.round(ebit/rev*1000)/10;
  return{
    rows:[
      ['Fixed Assets','',inr(fa)],
      ['Net Working Capital','CA '+inr(ca)+' − CL '+inr(cl),inr(nwc)],
      ['Capital Employed','FA + NWC',inr(ce)],
      ['EBIT','Operating Profit',inr(ebit)],
      ['EBIT Margin',ebit+' / '+rev,ebitMargin+'%'],
      ['ROCE','EBIT / Capital Employed',roce+'%'],
      ['Asset Turnover','Revenue / CE',assetTurnover+'x']],
    k1:roce+'%',k2:assetTurnover+'x',k3:inr(ce)};
}`});

/* 14. Trade Compliance Readiness Checklist */
push({id:'trade-business-compliance-checklist',name:'Trade Business Compliance Checklist',
 kind:'checklist',
 short:'Ensure your trading business meets all statutory and regulatory requirements',
 intro:'Verify that your trading enterprise is fully compliant across entity registration, tax filings, labour law, FSSAI (if food), BIS and trade-specific licences.',
 seo:{title:'Trade Business Compliance Checklist India – Statutory Regulatory',description:'Complete compliance checklist for trading businesses in India. Covers company registration, GST, income tax, labour law, FSSAI, Shops Act and trade licences.',keywords:['trade business compliance checklist India','trading company statutory compliance','GST compliance trading','labour law trading India','FSSAI trading compliance']},
 inputs:[],
 checklist:[
  {name:'Business Registration & Licences',items:[
   {id:'c1',text:'Business entity registered — company, LLP, partnership or proprietorship with PAN',critical:true},
   {id:'c2',text:'Shops & Establishment Act registration obtained from local municipality',critical:true},
   {id:'c3',text:'GST registration active; GSTIN displayed on premises and invoices',critical:true},
   {id:'c4',text:'Trade licence from local body / municipality renewed annually',critical:true},
   {id:'c5',text:'Import Export Code (IEC) from DGFT if doing cross-border trade'}]},
  {name:'Tax & Financial Compliance',items:[
   {id:'c6',text:'GST returns (GSTR-1 and GSTR-3B) filed monthly or quarterly',critical:true},
   {id:'c7',text:'Income Tax Return (ITR) filed annually; advance tax paid quarterly',critical:true},
   {id:'c8',text:'TDS deducted and deposited on rent, commission, professional fees',critical:true},
   {id:'c9',text:'Books of accounts maintained as per Companies Act / Income Tax Act'},
   {id:'c10',text:'Audit conducted by Chartered Accountant (if turnover > ₹1 crore / ₹10 crore digital)'}]},
  {name:'Labour & HR Compliance',items:[
   {id:'c11',text:'PF registration and monthly contributions if ≥ 20 employees',critical:true},
   {id:'c12',text:'ESI registration and contributions if ≥ 10 employees',critical:true},
   {id:'c13',text:'Professional Tax registration and deduction (state-wise)',critical:false},
   {id:'c14',text:'Minimum wages compliance as per state schedule'},
   {id:'c15',text:'Gratuity provisions for employees with 5+ years service'}]},
  {name:'Product & Sector-Specific Licences',items:[
   {id:'c16',text:'FSSAI licence if trading in food items (state or central based on turnover)',critical:true},
   {id:'c17',text:'Drug licence from State Drug Authority if trading in pharmaceuticals',critical:true},
   {id:'c18',text:'BIS dealer registration for products covered under Compulsory BIS (electronics, PPE, etc.)'},
   {id:'c19',text:'PESO licence if dealing in explosives, petroleum or pressurised products'}]}],
 buttonLabel:'Check Business Compliance',
 results:CHECKLIST_RESULTS,
 logic:CHECKLIST_LOGIC,
 assumptions:'Thresholds and requirements vary by state, product category and business turnover. Consult a CA or compliance consultant for your specific situation.',
 faq:[
  {q:'What is the penalty for non-filing of GST returns?',a:'Late fee of ₹50/day (₹20/day for nil returns) up to ₹5,000 per return, plus 18% interest on tax liability. Consistent non-filing can lead to GST registration cancellation.'},
  {q:'Is Shops Act registration mandatory for online trading businesses?',a:'Most states require S&E registration for any business with even one employee. Online / e-commerce businesses operating from an office or warehouse need this registration.'},
  {q:'When does a trading firm need a Statutory Audit?',a:'Companies (all sizes) need CA audit. Proprietorships/partnerships need tax audit if turnover exceeds ₹1 crore (or ₹10 crore if 95%+ digital transactions). LLPs need audit if turnover > ₹40 lakh.'}]});

/* 15. Net Profit After Tax Calculator */
push({id:'net-profit-after-tax-calculator',name:'Net Profit After Tax Calculator',
 short:'Calculate net profit after corporate tax and effective tax rate',
 intro:'Compute net profit after income tax for trading entities — covering gross profit, allowable deductions, taxable income, tax slab and final PAT for partnership firms, LLPs and companies.',
 seo:{title:'Net Profit After Tax Calculator – Corporate Tax Trading India',description:'Calculate net profit after tax for trading businesses. Supports proprietorship, partnership, LLP and private company tax rates. Get effective tax rate and PAT.',keywords:['net profit after tax calculator India','corporate tax calculator trading','PAT calculator India','effective tax rate business','income tax trading firm India']},
 inputs:[
  {id:'revenue',label:'Annual Revenue (₹)',type:'number',default:10000000,min:0},
  {id:'cogs',label:'Cost of Goods Sold (₹)',type:'number',default:7000000,min:0},
  {id:'operating_expenses',label:'Operating Expenses (₹)',type:'number',default:1200000,min:0},
  {id:'depreciation',label:'Depreciation (₹)',type:'number',default:150000,min:0},
  {id:'interest_expense',label:'Interest Expense (₹)',type:'number',default:200000,min:0},
  {id:'entity_type',label:'Business Entity Type',type:'select',default:'company',options:[{v:'proprietor',t:'Proprietor / Individual'},{v:'firm',t:'Partnership Firm / LLP'},{v:'company',t:'Private Limited Company'},{v:'company_concessional',t:'Company (concessional 22% rate)'}]}],
 results:{rowFmt:'raw',columns:['P&L Component','Amount (₹)','Notes'],kpis:[{key:'k1',label:'Net Profit (PAT)',format:'text'},{key:'k2',label:'Effective Tax Rate',format:'text'},{key:'k3',label:'PBT / Revenue',format:'text'}]},
 assumptions:'Surcharge and cess not modelled for simplicity. Concessional rate (22%) for existing companies opting Section 115BAA. Firm rate = 30% flat. Individual = 30% slab applied.',
 faq:[
  {q:'What is the tax rate for a Private Limited Company in India?',a:'Base rate: 25% for companies with turnover ≤ ₹400 crore, 30% above. Concessional rate 22% (Section 115BAA) for companies not claiming certain exemptions. Plus 4% health and education cess.'},
  {q:'What is the tax rate for a Partnership Firm / LLP?',a:'Partnership firms and LLPs are taxed at a flat 30% plus 4% cess = 31.2% effective. No benefit of slab rates like individuals.'},
  {q:'Should a trader operate as a company or proprietor?',a:'Company: lower tax at 22–25%, easier to raise capital, limited liability, but compliance heavy. Proprietor: simple, low compliance, but personal tax at 30% for profit > ₹10 lakh. LLP is a good middle ground.'}],
 logic:`${inr}
export function compute(v){
  const rev=+v.revenue||10000000,cogs=+v.cogs||7000000;
  const opex=+v.operating_expenses||1200000,dep=+v.depreciation||150000;
  const interest=+v.interest_expense||200000,et=v.entity_type||'company';
  const grossProfit=rev-cogs;
  const ebitda=grossProfit-opex;
  const ebit=ebitda-dep;
  const pbt=ebit-interest;
  const taxRates={proprietor:0.30,firm:0.312,company:0.2600,company_concessional:0.2288};
  const taxR=taxRates[et]||0.26;
  const tax=Math.max(0,Math.round(pbt*taxR));
  const pat=pbt-tax;
  const effR=pbt>0?Math.round(tax/pbt*1000)/10:0;
  const pbtPct=Math.round(pbt/rev*1000)/10;
  const labelMap={proprietor:'Individual (30%)',firm:'Firm/LLP (31.2%)',company:'Company (26% incl cess)',company_concessional:'Company conc. (22.88%)'};
  return{
    rows:[
      ['Revenue','',inr(rev)],
      ['Cost of Goods Sold','',inr(cogs)],
      ['Gross Profit','',inr(grossProfit)],
      ['Operating Expenses','',inr(opex)],
      ['EBITDA','',inr(ebitda)],
      ['Depreciation','',inr(dep)],
      ['Interest Expense','',inr(interest)],
      ['PBT','',inr(pbt)],
      ['Tax',labelMap[et]||et,inr(tax)],
      ['Net Profit (PAT)','',inr(pat)]],
    k1:inr(pat),k2:effR+'%',k3:pbtPct+'%'};
}`});

writeTools(T);
const n=T.length;
console.log('Trading & Commerce tools written:',n);
