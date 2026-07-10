/* Varada Nexus — bulk tool seeder. Writes tool.json + logic.js pairs into tools-src/.
   All tools are deterministic: they compute from static reference data baked into logic.js
   (no AI, no external/paid APIs). Run: node Varada-Nexus-Tools-OS/scripts/seed-tools.mjs
   then rebuild: node Varada-Nexus-Tools-OS/scripts/build.js */
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)),'..','tools-src');
const TOOLS = [];
const D = "This tool provides an indicative estimate for general planning only and is not professional, legal, financial, medical or engineering advice. Rates and reference values are editable defaults and may vary by location, vendor and date. Verify critical figures independently. Varada Nexus accepts no liability for decisions made using this tool.";
function add(t){ TOOLS.push(t); }

/* ===== GENERAL BUSINESS & PRODUCTIVITY ===== */
add({cat:'general-business-productivity',id:'gst-calculator',name:'GST Calculator',
 short:'Add or remove GST and split into CGST/SGST instantly.',
 intro:'Calculate GST for any amount under Indian GST slabs (5%, 12%, 18%, 28%). Add GST to a base price or extract GST from a GST-inclusive price, with automatic CGST/SGST split.',
 seo:{title:'GST Calculator India (2026) — Add & Remove GST, CGST/SGST Split | Varada Nexus',description:'Free online GST calculator for India. Add or remove GST at 5%, 12%, 18% or 28% and see the CGST and SGST split instantly. No signup.',keywords:['gst calculator','gst calculator india','cgst sgst calculator','reverse gst calculator']},
 inputs:[{id:'amount',label:'Amount (₹)',type:'number',default:10000,min:0},
   {id:'gstRate',label:'GST rate',type:'select',default:'18',options:[{v:'5',t:'5%'},{v:'12',t:'12%'},{v:'18',t:'18%'},{v:'28',t:'28%'}]},
   {id:'mode',label:'Mode',type:'select',default:'add',options:[{v:'add',t:'Add GST (exclusive amount)'},{v:'remove',t:'Remove GST (inclusive amount)'}]}],
 results:{rowFmt:'raw',columns:['Component','Rate','Amount'],kpis:[{key:'k1',label:'Total (incl. GST)',format:'text'},{key:'k2',label:'GST amount',format:'text'},{key:'k3',label:'Base amount',format:'text'}]},
 assumptions:'Uses standard Indian GST slabs. For intra-state supply GST splits equally into CGST and SGST; for inter-state supply the same total applies as IGST.',
 faq:[{q:'How is GST calculated on an amount?',a:'To add GST, GST = amount × rate ÷ 100 and total = amount + GST. To remove GST from an inclusive price, base = amount × 100 ÷ (100 + rate).'},
   {q:'What is the CGST and SGST split?',a:'For intra-state sales the GST is shared equally: CGST = SGST = half the total GST. For inter-state sales the full amount is charged as IGST.'},
   {q:'What are the GST slabs in India?',a:'The common GST rates are 5%, 12%, 18% and 28%, with some goods at 0% or special rates.'}],
 related:[{label:'Our Services',url:'/services.html'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const amt=+v.amount||0, rate=+v.gstRate||0, add=v.mode!=='remove';
  let base,gst,total;
  if(add){base=amt; gst=amt*rate/100; total=amt+gst;} else {base=amt*100/(100+rate); gst=amt-base; total=amt;}
  const rows=[['Base amount','',inr(base)],['CGST','@ '+(rate/2)+'%',inr(gst/2)],['SGST','@ '+(rate/2)+'%',inr(gst/2)],['Total GST','@ '+rate+'%',inr(gst)]];
  return {rows,total:inr(total),k1:inr(total),k2:inr(gst),k3:inr(base)};
}`});

add({cat:'general-business-productivity',id:'percentage-calculator',name:'Percentage Calculator',
 short:'Work out percentages, increases and decreases in one step.',
 intro:'A quick percentage calculator: find what a percentage of a value is, and the value after a percentage increase or decrease.',
 seo:{title:'Percentage Calculator — % of a Number, Increase & Decrease | Varada Nexus',description:'Free percentage calculator. Find X% of any number and the result after a percentage increase or decrease, instantly.',keywords:['percentage calculator','percent of a number','percentage increase calculator']},
 inputs:[{id:'value',label:'Value',type:'number',default:2500,min:0},{id:'percent',label:'Percentage (%)',type:'number',default:18}],
 results:{rowFmt:'raw',columns:['Calculation','',' Result'],kpis:[{key:'k1',label:'% of value',format:'text'},{key:'k2',label:'After increase',format:'text'},{key:'k3',label:'After decrease',format:'text'}]},
 assumptions:'Simple arithmetic percentages. Percentage-of = value × percent ÷ 100.',
 faq:[{q:'How do I calculate a percentage of a number?',a:'Multiply the number by the percentage and divide by 100. For example, 18% of 2500 = 2500 × 18 ÷ 100 = 450.'},
   {q:'How do I add a percentage to a number?',a:'Add the percentage amount to the original value: value + (value × percent ÷ 100).'},
   {q:'How do I calculate a percentage decrease?',a:'Subtract the percentage amount from the value: value − (value × percent ÷ 100).'}],
 related:[{label:'Our Services',url:'/services.html'}],
 logic:`const num=n=>(Math.round(n*100)/100).toLocaleString('en-IN');
export function compute(v){
  const val=+v.value||0, p=+v.percent||0, of=val*p/100;
  const rows=[[p+'% of '+num(val),'',num(of)],[num(val)+' increased by '+p+'%','',num(val+of)],[num(val)+' decreased by '+p+'%','',num(val-of)]];
  return {rows,k1:num(of),k2:num(val+of),k3:num(val-of)};
}`});

/* ===== FINANCE & BUSINESS ===== */
add({cat:'finance-business',id:'emi-calculator',name:'EMI Calculator',
 short:'Compute monthly EMI, total interest and total payment for any loan.',
 intro:'Calculate the Equated Monthly Instalment (EMI) for any loan from the principal, annual interest rate and tenure, with total interest and total repayment.',
 seo:{title:'EMI Calculator (2026) — Loan EMI, Interest & Total Payment | Varada Nexus',description:'Free EMI calculator for personal, car and business loans in India. Get monthly EMI, total interest payable and total repayment instantly.',keywords:['emi calculator','loan emi calculator','emi calculator india','monthly instalment calculator']},
 inputs:[{id:'principal',label:'Loan amount (₹)',type:'number',default:1000000,min:0},{id:'rate',label:'Interest rate (% p.a.)',type:'number',default:9.5,min:0},{id:'tenure',label:'Tenure (months)',type:'number',default:120,min:1}],
 results:{rowFmt:'raw',columns:['Component','','Amount'],kpis:[{key:'k1',label:'Monthly EMI',format:'text'},{key:'k2',label:'Total interest',format:'text'},{key:'k3',label:'Total payment',format:'text'}]},
 assumptions:'Uses the standard reducing-balance EMI formula EMI = P·i·(1+i)^n ÷ ((1+i)^n − 1), where i is the monthly rate and n the number of months.',
 faq:[{q:'How is EMI calculated?',a:'EMI = P × i × (1+i)^n ÷ ((1+i)^n − 1), where P is principal, i is the monthly interest rate (annual ÷ 12 ÷ 100) and n is the number of monthly instalments.'},
   {q:'Does a longer tenure reduce EMI?',a:'Yes, a longer tenure lowers the monthly EMI but increases the total interest paid over the loan.'},
   {q:'Is this EMI figure final?',a:'It is indicative. Actual EMI may include processing fees, insurance or a different compounding basis set by your lender.'}],
 related:[{label:'Our Services',url:'/services.html'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const P=+v.principal||0, i=(+v.rate||0)/1200, n=+v.tenure||1;
  const emi = i>0 ? P*i*Math.pow(1+i,n)/(Math.pow(1+i,n)-1) : P/n;
  const total=emi*n, interest=total-P;
  const rows=[['Loan amount','',inr(P)],['Monthly EMI','x '+n+' months',inr(emi)],['Total interest','',inr(interest)],['Total payment','',inr(total)]];
  return {rows,k1:inr(emi),k2:inr(interest),k3:inr(total)};
}`});

add({cat:'finance-business',id:'sip-calculator',name:'SIP Calculator',
 short:'Project the maturity value of a monthly SIP investment.',
 intro:'Estimate the future value of a monthly Systematic Investment Plan (SIP) from the monthly amount, expected annual return and duration, with total invested and estimated gains.',
 seo:{title:'SIP Calculator (2026) — Mutual Fund SIP Returns & Maturity | Varada Nexus',description:'Free SIP calculator. Project the maturity value, total invested and estimated gains of a monthly mutual-fund SIP in seconds.',keywords:['sip calculator','mutual fund sip calculator','sip returns calculator india']},
 inputs:[{id:'monthly',label:'Monthly investment (₹)',type:'number',default:10000,min:0},{id:'annualReturn',label:'Expected return (% p.a.)',type:'number',default:12,min:0},{id:'years',label:'Duration (years)',type:'number',default:10,min:1}],
 results:{rowFmt:'raw',columns:['Component','','Amount'],kpis:[{key:'k1',label:'Future value',format:'text'},{key:'k2',label:'Total invested',format:'text'},{key:'k3',label:'Estimated gains',format:'text'}]},
 assumptions:'Assumes a fixed monthly investment at the start of each month and a constant annual return compounded monthly. Actual market returns vary.',
 faq:[{q:'How is SIP maturity calculated?',a:'FV = P × (((1+i)^n − 1) ÷ i) × (1+i), where P is the monthly amount, i the monthly return (annual ÷ 12 ÷ 100) and n the number of months.'},
   {q:'Are SIP returns guaranteed?',a:'No. SIPs invest in market-linked instruments, so returns fluctuate. The figure here uses a constant assumed return for illustration only.'},
   {q:'Does a higher duration help?',a:'Yes, longer durations benefit more from compounding, so gains grow faster in later years.'}],
 related:[{label:'Our Services',url:'/services.html'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const P=+v.monthly||0, i=(+v.annualReturn||0)/1200, n=(+v.years||0)*12;
  const fv = i>0 ? P*((Math.pow(1+i,n)-1)/i)*(1+i) : P*n;
  const invested=P*n, gains=fv-invested;
  const rows=[['Monthly investment','x '+n+' months',inr(P)],['Total invested','',inr(invested)],['Estimated gains','',inr(gains)],['Maturity value','',inr(fv)]];
  return {rows,k1:inr(fv),k2:inr(invested),k3:inr(gains)};
}`});

add({cat:'finance-business',id:'fd-calculator',name:'FD Calculator',
 short:'Calculate fixed deposit maturity value and interest earned.',
 intro:'Work out the maturity amount and interest earned on a bank Fixed Deposit from the principal, interest rate, tenure and compounding frequency.',
 seo:{title:'FD Calculator (2026) — Fixed Deposit Maturity & Interest | Varada Nexus',description:'Free fixed deposit (FD) calculator for India. Compute FD maturity value and interest earned by tenure and compounding frequency.',keywords:['fd calculator','fixed deposit calculator','fd maturity calculator india']},
 inputs:[{id:'principal',label:'Deposit amount (₹)',type:'number',default:100000,min:0},{id:'rate',label:'Interest rate (% p.a.)',type:'number',default:7,min:0},{id:'years',label:'Tenure (years)',type:'number',default:5,min:0},
   {id:'comp',label:'Compounding',type:'select',default:'4',options:[{v:'1',t:'Yearly'},{v:'2',t:'Half-yearly'},{v:'4',t:'Quarterly'},{v:'12',t:'Monthly'}]}],
 results:{rowFmt:'raw',columns:['Component','','Amount'],kpis:[{key:'k1',label:'Maturity value',format:'text'},{key:'k2',label:'Interest earned',format:'text'},{key:'k3',label:'Principal',format:'text'}]},
 assumptions:'Uses compound interest A = P(1 + r/(100f))^(ft), where f is the compounding frequency per year. TDS and premature-withdrawal effects are not included.',
 faq:[{q:'How is FD maturity calculated?',a:'A = P × (1 + r/(100·f))^(f·t), where P is principal, r the annual rate, f the compounding frequency per year and t the tenure in years.'},
   {q:'Which compounding frequency is best?',a:'More frequent compounding (e.g. quarterly or monthly) yields slightly more interest than yearly compounding for the same rate.'},
   {q:'Is TDS included?',a:'No. Banks may deduct TDS on interest above the exemption limit; this calculator shows the gross maturity value.'}],
 related:[{label:'Our Services',url:'/services.html'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const P=+v.principal||0, r=+v.rate||0, t=+v.years||0, f=+v.comp||1;
  const A=P*Math.pow(1+r/(100*f), f*t), interest=A-P;
  const rows=[['Principal','',inr(P)],['Interest earned','@ '+r+'% p.a.',inr(interest)],['Maturity value','after '+t+' yr',inr(A)]];
  return {rows,k1:inr(A),k2:inr(interest),k3:inr(P)};
}`});

/* ===== TRADING & COMMERCE ===== */
add({cat:'trading-commerce',id:'profit-margin-calculator',name:'Profit Margin Calculator',
 short:'Turn cost and selling price into profit, margin % and markup %.',
 intro:'Calculate profit, profit margin and markup from cost price and selling price — essential for pricing decisions in trading and retail.',
 seo:{title:'Profit Margin Calculator — Margin % & Markup % from Cost & Price | Varada Nexus',description:'Free profit margin calculator. Enter cost and selling price to get profit, profit margin % and markup % instantly.',keywords:['profit margin calculator','markup calculator','margin vs markup calculator']},
 inputs:[{id:'cost',label:'Cost price (₹)',type:'number',default:800,min:0},{id:'sell',label:'Selling price (₹)',type:'number',default:1000,min:0}],
 results:{rowFmt:'raw',columns:['Metric','','Value'],kpis:[{key:'k1',label:'Profit',format:'text'},{key:'k2',label:'Margin %',format:'text'},{key:'k3',label:'Markup %',format:'text'}]},
 assumptions:'Margin is profit as a percentage of selling price; markup is profit as a percentage of cost. Taxes and overheads are not included.',
 faq:[{q:'What is the difference between margin and markup?',a:'Margin = profit ÷ selling price × 100 (share of the sale kept as profit). Markup = profit ÷ cost × 100 (mark-up over cost). Markup is always higher than margin.'},
   {q:'How do I calculate profit margin?',a:'Profit = selling price − cost. Margin % = profit ÷ selling price × 100.'},
   {q:'What is a good profit margin?',a:'It varies by industry — low-margin trading may run at 5–15% while services can exceed 40%. Compare against your sector benchmark.'}],
 related:[{label:'Our Services',url:'/services.html'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN'); const pc=n=>(Math.round(n*10)/10)+'%';
export function compute(v){
  const c=+v.cost||0, s=+v.sell||0, p=s-c;
  const margin = s>0 ? p/s*100 : 0, markup = c>0 ? p/c*100 : 0;
  const rows=[['Cost price','',inr(c)],['Selling price','',inr(s)],['Profit','',inr(p)],['Margin','of selling price',pc(margin)],['Markup','over cost',pc(markup)]];
  return {rows,k1:inr(p),k2:pc(margin),k3:pc(markup)};
}`});

add({cat:'trading-commerce',id:'break-even-calculator',name:'Break-Even Point Calculator',
 short:'Find the units and revenue needed to cover fixed costs.',
 intro:'Determine the break-even point in units and revenue from fixed costs, selling price per unit and variable cost per unit.',
 seo:{title:'Break-Even Point Calculator — Units & Revenue to Break Even | Varada Nexus',description:'Free break-even calculator. Enter fixed costs, price and variable cost per unit to find break-even units and revenue.',keywords:['break even calculator','break even point calculator','break even analysis']},
 inputs:[{id:'fixed',label:'Total fixed costs (₹)',type:'number',default:500000,min:0},{id:'price',label:'Selling price per unit (₹)',type:'number',default:500,min:0},{id:'variable',label:'Variable cost per unit (₹)',type:'number',default:300,min:0}],
 results:{rowFmt:'raw',columns:['Metric','','Value'],kpis:[{key:'k1',label:'Break-even units',format:'text'},{key:'k2',label:'Break-even revenue',format:'text'},{key:'k3',label:'Contribution / unit',format:'text'}]},
 assumptions:'Break-even units = fixed costs ÷ (price − variable cost per unit). Assumes constant price and variable cost.',
 faq:[{q:'How is the break-even point calculated?',a:'Break-even units = fixed costs ÷ contribution per unit, where contribution per unit = selling price − variable cost per unit.'},
   {q:'What is contribution margin?',a:'It is the amount each unit contributes towards fixed costs after covering its variable cost.'},
   {q:'What if price equals variable cost?',a:'Then contribution is zero and the business can never break even at that price — the price or cost must change.'}],
 related:[{label:'Our Services',url:'/services.html'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN'); const num=n=>Math.ceil(n).toLocaleString('en-IN');
export function compute(v){
  const F=+v.fixed||0, P=+v.price||0, VC=+v.variable||0, cm=P-VC;
  const units = cm>0 ? F/cm : 0, rev=units*P;
  const rows=[['Fixed costs','',inr(F)],['Contribution per unit','price - variable',inr(cm)],['Break-even units','',cm>0?num(units):'—'],['Break-even revenue','',cm>0?inr(rev):'—']];
  return {rows,k1:cm>0?num(units)+' units':'—',k2:cm>0?inr(rev):'—',k3:inr(cm)};
}`});

/* ===== HR & PUBLIC RELATIONS ===== */
add({cat:'hr-public-relations',id:'gratuity-calculator',name:'Gratuity Calculator',
 short:'Estimate gratuity payable under the Payment of Gratuity Act.',
 intro:'Estimate gratuity payable to an employee from last drawn salary (basic + DA) and years of service, as per the Payment of Gratuity Act, 1972.',
 seo:{title:'Gratuity Calculator India (2026) — Payment of Gratuity Act | Varada Nexus',description:'Free gratuity calculator for India. Estimate gratuity from last salary and years of service under the Payment of Gratuity Act, with the ₹20 lakh cap.',keywords:['gratuity calculator','gratuity calculator india','payment of gratuity act calculator']},
 inputs:[{id:'salary',label:'Last drawn monthly salary — Basic + DA (₹)',type:'number',default:50000,min:0},{id:'years',label:'Years of service',type:'number',default:10,min:0}],
 results:{rowFmt:'raw',columns:['Component','','Value'],kpis:[{key:'k1',label:'Gratuity payable',format:'text'},{key:'k2',label:'Years counted',format:'text'},{key:'k3',label:'Formula basis',format:'text'}]},
 assumptions:'Uses the covered-establishment formula: gratuity = 15 ÷ 26 × last salary (basic + DA) × years of service, capped at ₹20,00,000. Service beyond six months in the final year is commonly rounded up.',
 faq:[{q:'How is gratuity calculated in India?',a:'For establishments covered by the Act: gratuity = (15 ÷ 26) × last drawn salary (basic + DA) × completed years of service.'},
   {q:'Is there a maximum gratuity limit?',a:'Yes, tax-exempt gratuity is capped at ₹20,00,000 under current rules.'},
   {q:'Who is eligible for gratuity?',a:'Generally employees who complete five years of continuous service, with exceptions for death or disablement.'}],
 related:[{label:'HR & PR',url:'/hr.html'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const s=+v.salary||0, y=+v.years||0; let g=(15/26)*s*y; const capped=g>2000000; if(capped)g=2000000;
  const rows=[['Last salary (Basic+DA)','',inr(s)],['Years of service','',y+' yr'],['Gratuity (15/26 x salary x years)','',inr((15/26)*s*y)],['Payable (after ₹20L cap)','',inr(g)]];
  return {rows,k1:inr(g),k2:y+' yr',k3:'15/26 x salary x years'};
}`});

add({cat:'hr-public-relations',id:'salary-hike-calculator',name:'Salary Hike Calculator',
 short:'Work out a new salary after a hike, or the hike % between two salaries.',
 intro:'Calculate the new salary after a percentage hike, or the percentage increase between a current and a revised salary.',
 seo:{title:'Salary Hike Calculator — New Salary & Increment Percentage | Varada Nexus',description:'Free salary hike calculator. Find your new salary after a percentage increment, or the hike percentage between two salaries.',keywords:['salary hike calculator','increment calculator','salary increase percentage']},
 inputs:[{id:'current',label:'Current salary (₹)',type:'number',default:600000,min:0},{id:'hike',label:'Hike (%)',type:'number',default:15,min:0}],
 results:{rowFmt:'raw',columns:['Component','','Value'],kpis:[{key:'k1',label:'New salary',format:'text'},{key:'k2',label:'Increase amount',format:'text'},{key:'k3',label:'Hike %',format:'text'}]},
 assumptions:'New salary = current salary × (1 + hike ÷ 100). A flat percentage on the stated salary figure.',
 faq:[{q:'How do I calculate a salary hike?',a:'New salary = current salary × (1 + hike% ÷ 100). The increase amount is current salary × hike% ÷ 100.'},
   {q:'How do I find the hike percentage between two salaries?',a:'Hike % = (new − current) ÷ current × 100.'},
   {q:'Is the hike applied on CTC or in-hand?',a:'Usually on CTC. Use whichever figure your offer specifies for a consistent comparison.'}],
 related:[{label:'HR & PR',url:'/hr.html'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const c=+v.current||0, h=+v.hike||0, inc=c*h/100, nw=c+inc;
  const rows=[['Current salary','',inr(c)],['Increase','@ '+h+'%',inr(inc)],['New salary','',inr(nw)]];
  return {rows,k1:inr(nw),k2:inr(inc),k3:h+'%'};
}`});

/* ===== REAL ESTATE & INFRASTRUCTURE ===== */
add({cat:'real-estate-infrastructure',id:'home-loan-emi-calculator',name:'Home Loan EMI Calculator',
 short:'Monthly EMI, total interest and repayment for a home loan.',
 intro:'Calculate the EMI for a home loan from loan amount, interest rate and tenure, with total interest and total repayment over the loan.',
 seo:{title:'Home Loan EMI Calculator India (2026) — Monthly EMI & Interest | Varada Nexus',description:'Free home loan EMI calculator for India. Get monthly EMI, total interest and total repayment for any loan amount, rate and tenure.',keywords:['home loan emi calculator','housing loan emi','home loan calculator india']},
 inputs:[{id:'principal',label:'Loan amount (₹)',type:'number',default:5000000,min:0},{id:'rate',label:'Interest rate (% p.a.)',type:'number',default:8.5,min:0},{id:'tenureY',label:'Tenure (years)',type:'number',default:20,min:1}],
 results:{rowFmt:'raw',columns:['Component','','Amount'],kpis:[{key:'k1',label:'Monthly EMI',format:'text'},{key:'k2',label:'Total interest',format:'text'},{key:'k3',label:'Total payment',format:'text'}]},
 assumptions:'Reducing-balance EMI on the full sanctioned amount. Excludes processing fees, insurance and any moratorium period.',
 faq:[{q:'How is home loan EMI calculated?',a:'EMI = P × i × (1+i)^n ÷ ((1+i)^n − 1), where i is the monthly rate and n the number of months (years × 12).'},
   {q:'How can I reduce my home loan interest?',a:'A shorter tenure, part-prepayments or a lower interest rate all reduce total interest paid.'},
   {q:'Does this include registration and stamp duty?',a:'No. Those are one-time purchase costs and are separate from the loan EMI.'}],
 related:[{label:'Hospital Infrastructure',url:'/hospital.html'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const P=+v.principal||0, i=(+v.rate||0)/1200, n=(+v.tenureY||1)*12;
  const emi = i>0 ? P*i*Math.pow(1+i,n)/(Math.pow(1+i,n)-1) : P/n;
  const total=emi*n, interest=total-P;
  const rows=[['Loan amount','',inr(P)],['Monthly EMI','x '+n+' months',inr(emi)],['Total interest','',inr(interest)],['Total payment','',inr(total)]];
  return {rows,k1:inr(emi),k2:inr(interest),k3:inr(total)};
}`});

add({cat:'real-estate-infrastructure',id:'carpet-to-builtup-area-calculator',name:'Carpet to Built-up Area Calculator',
 short:'Convert carpet area to built-up and super built-up area.',
 intro:'Convert carpet area into built-up and super built-up area using a wall factor and a loading percentage — useful when comparing property quotes.',
 seo:{title:'Carpet to Built-up Area Calculator — Super Built-up & Loading | Varada Nexus',description:'Free carpet-to-built-up area calculator. Convert carpet area to built-up and super built-up area using loading %.',keywords:['carpet area calculator','built up area calculator','super built up area loading']},
 inputs:[{id:'carpet',label:'Carpet area (sq ft)',type:'number',default:1000,min:0},{id:'loading',label:'Loading factor (%)',type:'number',default:30,min:0}],
 results:{rowFmt:'raw',columns:['Area type','','Value'],kpis:[{key:'k1',label:'Super built-up',format:'text'},{key:'k2',label:'Built-up',format:'text'},{key:'k3',label:'Carpet',format:'text'}]},
 assumptions:'Built-up ≈ carpet × 1.10 (about 10% for walls). Super built-up = carpet × (1 + loading ÷ 100), where loading covers shared/common areas.',
 faq:[{q:'What is the difference between carpet, built-up and super built-up area?',a:'Carpet area is usable floor area; built-up adds wall thickness (~10%); super built-up adds a share of common areas via a loading factor.'},
   {q:'What is a loading factor?',a:'It is the percentage added to carpet area for common spaces like lobbies and stairs. Typical loading is 25–40%.'},
   {q:'Which area should I compare?',a:'RERA requires carpet area to be disclosed, so compare carpet area for a like-for-like price comparison.'}],
 related:[{label:'Hospital Infrastructure',url:'/hospital.html'}],
 logic:`const num=n=>Math.round(n).toLocaleString('en-IN')+' sq ft';
export function compute(v){
  const c=+v.carpet||0, L=+v.loading||0, bu=c*1.10, sbu=c*(1+L/100);
  const rows=[['Carpet area','',num(c)],['Built-up area','+10% walls',num(bu)],['Super built-up area','+'+L+'% loading',num(sbu)]];
  return {rows,k1:num(sbu),k2:num(bu),k3:num(c)};
}`});

/* ===== IMPORT & EXPORT ===== */
add({cat:'import-export',id:'landed-cost-calculator',name:'Landed Cost Calculator',
 short:'Total landed cost per unit including freight, duty and clearing.',
 intro:'Calculate the true landed cost of imported goods — product cost, freight, insurance, customs duty, IGST and clearing charges — and the cost per unit.',
 seo:{title:'Landed Cost Calculator (2026) — Import CIF, Duty & Per-Unit Cost | Varada Nexus',description:'Free landed cost calculator for imports. Add freight, insurance, customs duty, IGST and clearing to get total and per-unit landed cost.',keywords:['landed cost calculator','import cost calculator','cif duty calculator india']},
 inputs:[{id:'product',label:'Product cost / FOB (₹)',type:'number',default:500000,min:0},{id:'freight',label:'Freight (₹)',type:'number',default:40000,min:0},{id:'insurance',label:'Insurance (₹)',type:'number',default:5000,min:0},{id:'duty',label:'Customs duty (%)',type:'number',default:10,min:0},{id:'igst',label:'IGST (%)',type:'number',default:18,min:0},{id:'clearing',label:'Clearing & handling (₹)',type:'number',default:15000,min:0},{id:'qty',label:'Quantity (units)',type:'number',default:1000,min:1}],
 results:{rowFmt:'raw',columns:['Component','','Amount'],kpis:[{key:'k1',label:'Landed cost / unit',format:'text'},{key:'k2',label:'Total landed cost',format:'text'},{key:'k3',label:'IGST (creditable)',format:'text'}]},
 assumptions:'CIF = product + freight + insurance. Duty = CIF × duty%. IGST = (CIF + duty) × IGST% and is usually creditable, so per-unit landed cost is shown excluding IGST; the total including all outflows is also shown.',
 faq:[{q:'What is landed cost?',a:'Landed cost is the total cost of a product once it reaches your warehouse — product price plus freight, insurance, customs duty, taxes and clearing charges.'},
   {q:'Is IGST part of landed cost?',a:'IGST paid on imports is generally available as input tax credit, so it is often excluded from the costing base. This tool shows landed cost both with and without IGST.'},
   {q:'How is customs duty calculated?',a:'Basic customs duty is charged on the CIF value (cost + insurance + freight). Actual duty depends on the HS code of the product.'}],
 related:[{label:'Import & Export',url:'/import-export.html'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const prod=+v.product||0, fr=+v.freight||0, ins=+v.insurance||0, dR=+v.duty||0, gR=+v.igst||0, cl=+v.clearing||0, q=+v.qty||1;
  const cif=prod+fr+ins, duty=cif*dR/100, igst=(cif+duty)*gR/100;
  const landedExclIgst=cif+duty+cl, totalOutflow=landedExclIgst+igst;
  const rows=[['CIF value','product+freight+insurance',inr(cif)],['Customs duty','@ '+dR+'%',inr(duty)],['Clearing & handling','',inr(cl)],['Landed cost (excl. IGST)','',inr(landedExclIgst)],['IGST (creditable)','@ '+gR+'%',inr(igst)],['Total cash outflow','',inr(totalOutflow)]];
  return {rows,k1:inr(landedExclIgst/q),k2:inr(landedExclIgst),k3:inr(igst)};
}`});

add({cat:'import-export',id:'cbm-volumetric-weight-calculator',name:'CBM & Volumetric Weight Calculator',
 short:'Shipment volume (CBM), volumetric weight and chargeable weight.',
 intro:'Calculate cubic metres (CBM), volumetric (dimensional) weight and chargeable weight for a shipment from carton dimensions and quantity.',
 seo:{title:'CBM & Volumetric Weight Calculator — Chargeable Weight for Shipping | Varada Nexus',description:'Free CBM and volumetric weight calculator. Get shipment CBM, dimensional weight and chargeable weight for air and sea freight.',keywords:['cbm calculator','volumetric weight calculator','chargeable weight calculator']},
 inputs:[{id:'l',label:'Length per carton (cm)',type:'number',default:60,min:0},{id:'w',label:'Width per carton (cm)',type:'number',default:40,min:0},{id:'h',label:'Height per carton (cm)',type:'number',default:40,min:0},{id:'qty',label:'Number of cartons',type:'number',default:10,min:1},{id:'actual',label:'Actual weight per carton (kg)',type:'number',default:12,min:0},{id:'divisor',label:'Volumetric divisor',type:'select',default:'5000',options:[{v:'5000',t:'Air freight (5000)'},{v:'6000',t:'Courier (6000)'}]}],
 results:{rowFmt:'raw',columns:['Metric','','Value'],kpis:[{key:'k1',label:'Total CBM',format:'text'},{key:'k2',label:'Volumetric weight',format:'text'},{key:'k3',label:'Chargeable weight',format:'text'}]},
 assumptions:'CBM = L×W×H (cm) ÷ 1,000,000 × cartons. Volumetric weight (kg) = L×W×H ÷ divisor × cartons. Chargeable weight = the greater of actual and volumetric weight.',
 faq:[{q:'How is CBM calculated?',a:'CBM per carton = length × width × height in cm ÷ 1,000,000. Multiply by the number of cartons for total CBM.'},
   {q:'What is volumetric weight?',a:'It converts a shipment’s volume into a weight using a divisor (5000 for air, 6000 for courier), so bulky-but-light cargo is priced fairly.'},
   {q:'What is chargeable weight?',a:'Carriers charge on the higher of actual and volumetric weight — that higher figure is the chargeable weight.'}],
 related:[{label:'Import & Export',url:'/import-export.html'}],
 logic:`const num=(n,u)=>(Math.round(n*100)/100).toLocaleString('en-IN')+' '+u;
export function compute(v){
  const l=+v.l||0,w=+v.w||0,h=+v.h||0,q=+v.qty||1,act=(+v.actual||0)*q,div=+v.divisor||5000;
  const cbm=(l*w*h)/1e6*q, vol=(l*w*h)/div*q, charge=Math.max(act,vol);
  const rows=[['Total CBM','',num(cbm,'m³')],['Actual weight','',num(act,'kg')],['Volumetric weight','÷'+div,num(vol,'kg')],['Chargeable weight','greater of the two',num(charge,'kg')]];
  return {rows,k1:num(cbm,'m³'),k2:num(vol,'kg'),k3:num(charge,'kg')};
}`});

/* ===== INTERIOR DESIGN ===== */
add({cat:'interior-design',id:'paint-calculator',name:'Paint Calculator',
 short:'Litres of paint and cost from wall area and number of coats.',
 intro:'Estimate how many litres of paint you need and the cost, from the total wall area, number of coats and paint coverage.',
 seo:{title:'Paint Calculator — Litres of Paint & Cost by Wall Area | Varada Nexus',description:'Free paint calculator. Estimate litres of paint and cost from wall area, coats and coverage per litre.',keywords:['paint calculator','wall paint calculator','how much paint do i need']},
 inputs:[{id:'area',label:'Total wall area (sq ft)',type:'number',default:1200,min:0},{id:'coats',label:'Number of coats',type:'number',default:2,min:1},{id:'coverage',label:'Coverage per litre (sq ft/coat)',type:'number',default:120,min:1},{id:'price',label:'Paint price (₹/litre)',type:'number',default:350,min:0}],
 results:{rowFmt:'raw',columns:['Metric','','Value'],kpis:[{key:'k1',label:'Paint needed',format:'text'},{key:'k2',label:'Estimated cost',format:'text'},{key:'k3',label:'Area painted',format:'text'}]},
 assumptions:'Litres = wall area × coats ÷ coverage per litre. Typical emulsion covers ~110–140 sq ft per litre per coat; adjust for surface and colour.',
 faq:[{q:'How much paint do I need?',a:'Litres = total wall area × number of coats ÷ coverage per litre. For 1200 sq ft, 2 coats at 120 sq ft/litre you need about 20 litres.'},
   {q:'How many coats of paint are recommended?',a:'Two coats are standard for even colour; dark shades or fresh plaster may need a primer plus two coats.'},
   {q:'Does texture affect coverage?',a:'Yes, rough or porous surfaces absorb more paint, reducing coverage per litre.'}],
 related:[{label:'Interior Design',url:'/services.html'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN'); const L=n=>(Math.round(n*10)/10)+' L';
export function compute(v){
  const a=+v.area||0,c=+v.coats||1,cov=+v.coverage||1,p=+v.price||0;
  const litres=a*c/cov, cost=litres*p;
  const rows=[['Wall area','x '+c+' coats',a.toLocaleString('en-IN')+' sq ft'],['Paint needed','@ '+cov+' sq ft/L',L(litres)],['Estimated cost','@ ₹'+p+'/L',inr(cost)]];
  return {rows,k1:L(litres),k2:inr(cost),k3:a.toLocaleString('en-IN')+' sq ft'};
}`});

add({cat:'interior-design',id:'tile-calculator',name:'Tile Calculator',
 short:'Number of tiles, boxes and cost for a floor or wall area.',
 intro:'Work out how many tiles and boxes you need for a given area, including wastage, plus the estimated material cost.',
 seo:{title:'Tile Calculator — Tiles, Boxes & Cost by Area | Varada Nexus',description:'Free tile calculator. Get the number of tiles, boxes and cost for any floor or wall area, including wastage allowance.',keywords:['tile calculator','floor tile calculator','how many tiles do i need']},
 inputs:[{id:'area',label:'Area to tile (sq ft)',type:'number',default:400,min:0},{id:'size',label:'Tile size',type:'select',default:'4',options:[{v:'1',t:'1x1 ft (1 sq ft)'},{v:'4',t:'2x2 ft (4 sq ft)'},{v:'8',t:'2x4 ft (8 sq ft)'},{v:'2.67',t:'16x24 in (2.67 sq ft)'}]},{id:'wastage',label:'Wastage (%)',type:'number',default:10,min:0},{id:'perBox',label:'Tiles per box',type:'number',default:4,min:1},{id:'boxPrice',label:'Price per box (₹)',type:'number',default:800,min:0}],
 results:{rowFmt:'raw',columns:['Metric','','Value'],kpis:[{key:'k1',label:'Tiles needed',format:'text'},{key:'k2',label:'Boxes needed',format:'text'},{key:'k3',label:'Estimated cost',format:'text'}]},
 assumptions:'Tiles = ceil(area ÷ tile area × (1 + wastage%)). Boxes = ceil(tiles ÷ tiles per box). Add extra wastage for diagonal layouts or many cuts.',
 faq:[{q:'How many tiles do I need?',a:'Tiles = area ÷ tile area, then add wastage (typically 10%). Round up to whole tiles.'},
   {q:'Why add a wastage allowance?',a:'Cutting at edges, breakage and future replacements mean you should buy 5–15% extra.'},
   {q:'How many boxes should I buy?',a:'Divide the total tiles (including wastage) by tiles per box and round up to full boxes.'}],
 related:[{label:'Interior Design',url:'/services.html'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN'); const num=n=>Math.ceil(n).toLocaleString('en-IN');
export function compute(v){
  const a=+v.area||0,ts=+v.size||1,wst=+v.wastage||0,pb=+v.perBox||1,bp=+v.boxPrice||0;
  const tiles=Math.ceil(a/ts*(1+wst/100)), boxes=Math.ceil(tiles/pb), cost=boxes*bp;
  const rows=[['Area','tile '+ts+' sq ft',a.toLocaleString('en-IN')+' sq ft'],['Tiles needed','incl. '+wst+'% wastage',num(tiles)],['Boxes needed','@ '+pb+'/box',num(boxes)],['Estimated cost','@ ₹'+bp+'/box',inr(cost)]];
  return {rows,k1:num(tiles),k2:num(boxes)+' boxes',k3:inr(cost)};
}`});

/* ===== AGRICULTURE & AGRIBUSINESS ===== */
add({cat:'agriculture-agribusiness',id:'seed-rate-calculator',name:'Seed Rate Calculator',
 short:'Total seed quantity and cost for a field by area.',
 intro:'Calculate the total seed required and its cost from the field area and recommended seed rate per acre.',
 seo:{title:'Seed Rate Calculator — Seed Quantity & Cost by Acre | Varada Nexus',description:'Free seed rate calculator. Find the total seed needed and cost from field area and seed rate per acre.',keywords:['seed rate calculator','seed quantity calculator','seed per acre']},
 inputs:[{id:'area',label:'Field area (acres)',type:'number',default:5,min:0},{id:'rate',label:'Seed rate (kg/acre)',type:'number',default:20,min:0},{id:'price',label:'Seed price (₹/kg)',type:'number',default:80,min:0}],
 results:{rowFmt:'raw',columns:['Metric','','Value'],kpis:[{key:'k1',label:'Total seed',format:'text'},{key:'k2',label:'Seed cost',format:'text'},{key:'k3',label:'Area',format:'text'}]},
 assumptions:'Total seed = area × seed rate per acre. Recommended seed rate varies by crop, variety, spacing and sowing method.',
 faq:[{q:'How do I calculate seed rate?',a:'Total seed = field area (acres) × recommended seed rate (kg/acre). Multiply by price per kg for cost.'},
   {q:'What affects the seed rate?',a:'Crop type, seed size, germination rate, row spacing and sowing method all change the recommended seed rate.'},
   {q:'Should I add extra seed?',a:'A small buffer (5–10%) is common to allow for poor germination and gap filling.'}],
 related:[{label:'Our Services',url:'/services.html'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const a=+v.area||0,r=+v.rate||0,p=+v.price||0,total=a*r,cost=total*p;
  const rows=[['Field area','',a+' acres'],['Seed rate','per acre',r+' kg'],['Total seed','',total.toLocaleString('en-IN')+' kg'],['Seed cost','@ ₹'+p+'/kg',inr(cost)]];
  return {rows,k1:total.toLocaleString('en-IN')+' kg',k2:inr(cost),k3:a+' acres'};
}`});

add({cat:'agriculture-agribusiness',id:'npk-fertilizer-calculator',name:'NPK Fertilizer Calculator',
 short:'Convert N-P-K requirement into bags of Urea, DAP and MOP.',
 intro:'Convert your recommended nitrogen, phosphorus and potassium dose per acre into actual bags of Urea, DAP and MOP for your field.',
 seo:{title:'NPK Fertilizer Calculator — Urea, DAP & MOP Bags by Acre | Varada Nexus',description:'Free NPK fertilizer calculator. Convert N-P-K recommendation into bags of Urea, DAP and MOP for your field area.',keywords:['npk calculator','fertilizer calculator','urea dap mop calculator']},
 inputs:[{id:'area',label:'Area (acres)',type:'number',default:2,min:0},{id:'n',label:'Nitrogen N (kg/acre)',type:'number',default:40,min:0},{id:'p',label:'Phosphorus P₂O₅ (kg/acre)',type:'number',default:20,min:0},{id:'k',label:'Potassium K₂O (kg/acre)',type:'number',default:20,min:0}],
 results:{rowFmt:'raw',columns:['Fertilizer','nutrient basis','Quantity'],kpis:[{key:'k1',label:'Urea',format:'text'},{key:'k2',label:'DAP',format:'text'},{key:'k3',label:'MOP',format:'text'}]},
 assumptions:'Standard grades: Urea 46% N, DAP 46% P₂O₅ + 18% N, MOP 60% K₂O. Phosphorus is met via DAP first, the nitrogen it supplies is deducted, and the balance N is met with Urea. Bags are 50 kg.',
 faq:[{q:'How do I convert NPK recommendation to fertilizer bags?',a:'Meet P₂O₅ with DAP (46% P), subtract the N that DAP already supplies (18%), meet the remaining N with Urea (46% N) and K₂O with MOP (60% K).'},
   {q:'Why deduct nitrogen from DAP?',a:'DAP contains 18% nitrogen, so it already supplies part of your nitrogen need — ignoring it would over-apply urea.'},
   {q:'What is the bag size assumed?',a:'Urea, DAP and MOP bags are taken as 50 kg each.'}],
 related:[{label:'Our Services',url:'/services.html'}],
 logic:`const bags=kg=>{const b=kg/50; return (Math.round(b*10)/10)+' bags ('+Math.round(kg)+' kg)';};
export function compute(v){
  const a=+v.area||0, N=(+v.n||0)*a, P=(+v.p||0)*a, K=(+v.k||0)*a;
  const dap=P/0.46, nFromDap=dap*0.18, urea=Math.max(0,(N-nFromDap))/0.46, mop=K/0.60;
  const rows=[['DAP','P₂O₅ 46% + N 18%',bags(dap)],['Urea','N 46% (after DAP N)',bags(urea)],['MOP','K₂O 60%',bags(mop)]];
  return {rows,k1:bags(urea),k2:bags(dap),k3:bags(mop)};
}`});

/* ===== DIGITAL MARKETING ===== */
add({cat:'digital-marketing',id:'marketing-roi-calculator',name:'Marketing ROI Calculator',
 short:'ROI %, ROAS and net profit from spend and revenue.',
 intro:'Measure marketing return on investment: enter campaign spend and revenue to get ROI %, ROAS and net profit.',
 seo:{title:'Marketing ROI Calculator — ROI %, ROAS & Net Profit | Varada Nexus',description:'Free marketing ROI calculator. Enter spend and revenue to get ROI percentage, ROAS and net profit for any campaign.',keywords:['marketing roi calculator','roas calculator','campaign roi']},
 inputs:[{id:'revenue',label:'Revenue generated (₹)',type:'number',default:500000,min:0},{id:'cost',label:'Marketing spend (₹)',type:'number',default:100000,min:0}],
 results:{rowFmt:'raw',columns:['Metric','','Value'],kpis:[{key:'k1',label:'ROI %',format:'text'},{key:'k2',label:'ROAS',format:'text'},{key:'k3',label:'Net profit',format:'text'}]},
 assumptions:'ROI % = (revenue − cost) ÷ cost × 100. ROAS = revenue ÷ cost. Revenue should be attributable to the campaign for an accurate figure.',
 faq:[{q:'How is marketing ROI calculated?',a:'ROI % = (revenue − marketing cost) ÷ marketing cost × 100. A positive figure means the campaign earned more than it cost.'},
   {q:'What is the difference between ROI and ROAS?',a:'ROAS = revenue ÷ ad spend (a ratio); ROI factors in that the spend itself is subtracted, expressed as a percentage of cost.'},
   {q:'What is a good ROAS?',a:'It depends on margins, but many businesses target a ROAS of 3–4× or higher to stay profitable after costs.'}],
 related:[{label:'Digital Marketing',url:'/services.html'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN'); const pc=n=>(Math.round(n*10)/10)+'%'; const x=n=>(Math.round(n*100)/100)+'x';
export function compute(v){
  const rev=+v.revenue||0, cost=+v.cost||0, profit=rev-cost, roi=cost>0?profit/cost*100:0, roas=cost>0?rev/cost:0;
  const rows=[['Revenue','',inr(rev)],['Marketing spend','',inr(cost)],['Net profit','',inr(profit)],['ROI','',pc(roi)],['ROAS','',x(roas)]];
  return {rows,k1:pc(roi),k2:x(roas),k3:inr(profit)};
}`});

add({cat:'digital-marketing',id:'cpc-cpm-ctr-calculator',name:'CPC, CPM & CTR Calculator',
 short:'Ad metrics: CPC, CPM, CTR, conversion rate and CPA.',
 intro:'Turn ad spend, impressions, clicks and conversions into the core performance metrics: CPC, CPM, CTR, conversion rate and cost per acquisition.',
 seo:{title:'CPC, CPM & CTR Calculator — Ad Performance Metrics | Varada Nexus',description:'Free CPC, CPM, CTR and CPA calculator. Enter spend, impressions, clicks and conversions to get all key ad metrics.',keywords:['cpc calculator','cpm calculator','ctr calculator','cpa calculator']},
 inputs:[{id:'spend',label:'Ad spend (₹)',type:'number',default:50000,min:0},{id:'impressions',label:'Impressions',type:'number',default:500000,min:0},{id:'clicks',label:'Clicks',type:'number',default:8000,min:0},{id:'conversions',label:'Conversions',type:'number',default:400,min:0}],
 results:{rowFmt:'raw',columns:['Metric','','Value'],kpis:[{key:'k1',label:'CPC',format:'text'},{key:'k2',label:'CTR',format:'text'},{key:'k3',label:'CPA',format:'text'}]},
 assumptions:'CPC = spend ÷ clicks. CPM = spend ÷ impressions × 1000. CTR = clicks ÷ impressions × 100. Conversion rate = conversions ÷ clicks × 100. CPA = spend ÷ conversions.',
 faq:[{q:'How is CTR calculated?',a:'CTR = clicks ÷ impressions × 100. It shows the percentage of people who clicked after seeing the ad.'},
   {q:'What is the difference between CPC and CPM?',a:'CPC is cost per click (spend ÷ clicks); CPM is cost per thousand impressions (spend ÷ impressions × 1000).'},
   {q:'What is CPA?',a:'Cost per acquisition = ad spend ÷ number of conversions — the average cost to win one customer or lead.'}],
 related:[{label:'Digital Marketing',url:'/services.html'}],
 logic:`const inr=n=>'₹'+(Math.round(n*100)/100).toLocaleString('en-IN'); const pc=n=>(Math.round(n*100)/100)+'%';
export function compute(v){
  const s=+v.spend||0,imp=+v.impressions||0,cl=+v.clicks||0,cv=+v.conversions||0;
  const cpc=cl>0?s/cl:0,cpm=imp>0?s/imp*1000:0,ctr=imp>0?cl/imp*100:0,cr=cl>0?cv/cl*100:0,cpa=cv>0?s/cv:0;
  const rows=[['CPC','spend ÷ clicks',inr(cpc)],['CPM','per 1000 impressions',inr(cpm)],['CTR','clicks ÷ impressions',pc(ctr)],['Conversion rate','conv ÷ clicks',pc(cr)],['CPA','spend ÷ conversions',inr(cpa)]];
  return {rows,k1:inr(cpc),k2:pc(ctr),k3:inr(cpa)};
}`});

/* ===== E-COMMERCE ===== */
add({cat:'ecommerce',id:'roas-breakeven-calculator',name:'ROAS & Break-even ROAS Calculator',
 short:'Actual ROAS plus the break-even ROAS your margin requires.',
 intro:'Compare your actual ROAS against the break-even ROAS implied by your product margin, so you know whether ad spend is truly profitable.',
 seo:{title:'ROAS Calculator — Actual vs Break-even ROAS by Margin | Varada Nexus',description:'Free ROAS calculator for e-commerce. Compare actual ROAS with the break-even ROAS set by your product margin.',keywords:['roas calculator','break even roas','ecommerce ad profitability']},
 inputs:[{id:'revenue',label:'Revenue from ads (₹)',type:'number',default:300000,min:0},{id:'spend',label:'Ad spend (₹)',type:'number',default:75000,min:0},{id:'margin',label:'Product margin (%)',type:'number',default:35,min:0}],
 results:{rowFmt:'raw',columns:['Metric','','Value'],kpis:[{key:'k1',label:'Actual ROAS',format:'text'},{key:'k2',label:'Break-even ROAS',format:'text'},{key:'k3',label:'Verdict',format:'text'}]},
 assumptions:'ROAS = revenue ÷ ad spend. Break-even ROAS = 100 ÷ margin%. If actual ROAS is above break-even ROAS, the campaign is profitable.',
 faq:[{q:'What is break-even ROAS?',a:'It is the ROAS at which ad revenue exactly covers product cost and ad spend: 100 ÷ margin%. Above it you profit; below it you lose money.'},
   {q:'How is ROAS calculated?',a:'ROAS = revenue attributable to ads ÷ ad spend.'},
   {q:'Why does margin matter for ROAS?',a:'A low-margin product needs a much higher ROAS to be profitable than a high-margin one.'}],
 related:[{label:'E-Commerce',url:'/ecommerce.html'}],
 logic:`const x=n=>(Math.round(n*100)/100)+'x';
export function compute(v){
  const rev=+v.revenue||0,sp=+v.spend||0,m=+v.margin||0;
  const roas=sp>0?rev/sp:0, be=m>0?100/m:0, ok=roas>=be;
  const rows=[['Actual ROAS','revenue ÷ spend',x(roas)],['Break-even ROAS','100 ÷ margin%',x(be)],['Status','',ok?'Profitable':'Below break-even']];
  return {rows,k1:x(roas),k2:x(be),k3:ok?'Profitable':'Below break-even'};
}`});

/* ===== ENERGY & UTILITIES ===== */
add({cat:'energy-utilities',id:'solar-rooftop-savings-calculator',name:'Solar Rooftop Savings Calculator',
 short:'System size, cost, monthly savings and payback for rooftop solar.',
 intro:'Estimate the rooftop solar system size, roof area, indicative cost, monthly bill savings and payback period from your monthly electricity usage.',
 seo:{title:'Solar Rooftop Calculator India — System Size, Cost & Payback | Varada Nexus',description:'Free solar rooftop calculator. Estimate kW system size, roof area, cost, monthly savings and payback from your electricity usage.',keywords:['solar calculator india','rooftop solar calculator','solar payback calculator']},
 inputs:[{id:'units',label:'Monthly electricity use (kWh/units)',type:'number',default:600,min:0},{id:'tariff',label:'Tariff (₹/unit)',type:'number',default:8,min:0},{id:'costKw',label:'System cost (₹/kW)',type:'number',default:60000,min:0}],
 results:{rowFmt:'raw',columns:['Metric','','Value'],kpis:[{key:'k1',label:'System size',format:'text'},{key:'k2',label:'Monthly savings',format:'text'},{key:'k3',label:'Payback',format:'text'}]},
 assumptions:'Assumes ~4 units generated per kW per day (~120 units/kW/month). Roof area ≈ 100 sq ft per kW. Cost and generation vary by location, shading and subsidy (not included).',
 faq:[{q:'What size solar system do I need?',a:'Roughly, kW = monthly units ÷ 120, since 1 kW generates about 120 units a month in much of India.'},
   {q:'How much roof area is needed?',a:'About 100 sq ft of shadow-free roof per kW of solar capacity.'},
   {q:'How is payback calculated?',a:'Payback (years) = system cost ÷ annual bill savings. Subsidies, where applicable, shorten this further.'}],
 related:[{label:'Our Services',url:'/services.html'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const u=+v.units||0,t=+v.tariff||0,ck=+v.costKw||60000;
  const kw=u/120, area=kw*100, cost=kw*ck, save=u*t, payback=save>0?cost/(save*12):0;
  const rows=[['Recommended system','~120 units/kW/mo',(Math.round(kw*10)/10)+' kW'],['Roof area needed','~100 sq ft/kW',Math.round(area).toLocaleString('en-IN')+' sq ft'],['Indicative cost','@ ₹'+ck+'/kW',inr(cost)],['Monthly savings','@ ₹'+t+'/unit',inr(save)],['Payback period','',(Math.round(payback*10)/10)+' years']];
  return {rows,k1:(Math.round(kw*10)/10)+' kW',k2:inr(save),k3:(Math.round(payback*10)/10)+' yr'};
}`});

/* ===== HOSPITALITY & TOURISM ===== */
add({cat:'hospitality-tourism',id:'revpar-calculator',name:'RevPAR & Occupancy Calculator',
 short:'RevPAR and room revenue from ADR and occupancy.',
 intro:'Calculate RevPAR (revenue per available room) and daily and monthly room revenue from the number of rooms, average daily rate and occupancy.',
 seo:{title:'RevPAR Calculator — Revenue Per Available Room & Occupancy | Varada Nexus',description:'Free RevPAR calculator for hotels. Get RevPAR and room revenue from rooms, ADR and occupancy percentage.',keywords:['revpar calculator','hotel revenue calculator','adr occupancy calculator']},
 inputs:[{id:'rooms',label:'Total rooms',type:'number',default:50,min:0},{id:'adr',label:'Average daily rate — ADR (₹)',type:'number',default:4000,min:0},{id:'occ',label:'Occupancy (%)',type:'number',default:70,min:0,max:100}],
 results:{rowFmt:'raw',columns:['Metric','','Value'],kpis:[{key:'k1',label:'RevPAR',format:'text'},{key:'k2',label:'Daily room revenue',format:'text'},{key:'k3',label:'Monthly room revenue',format:'text'}]},
 assumptions:'RevPAR = ADR × occupancy%. Daily revenue = rooms × RevPAR. Monthly revenue assumes 30 days.',
 faq:[{q:'What is RevPAR?',a:'Revenue Per Available Room = ADR × occupancy rate. It reflects both pricing and how full the hotel is.'},
   {q:'How is RevPAR different from ADR?',a:'ADR is the average rate of rooms actually sold; RevPAR spreads revenue across all available rooms, sold or not.'},
   {q:'How can I improve RevPAR?',a:'Raise ADR, improve occupancy, or both — through better pricing, distribution and demand generation.'}],
 related:[{label:'Our Services',url:'/services.html'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const r=+v.rooms||0,adr=+v.adr||0,o=+v.occ||0;
  const revpar=adr*o/100, daily=r*revpar, monthly=daily*30;
  const rows=[['RevPAR','ADR x occupancy',inr(revpar)],['Daily room revenue','',inr(daily)],['Monthly room revenue','x 30 days',inr(monthly)]];
  return {rows,k1:inr(revpar),k2:inr(daily),k3:inr(monthly)};
}`});

/* ===== MANUFACTURING & INDUSTRIAL ===== */
add({cat:'manufacturing-industrial',id:'oee-calculator',name:'OEE Calculator',
 short:'Overall Equipment Effectiveness from availability, performance, quality.',
 intro:'Calculate Overall Equipment Effectiveness (OEE) from availability, performance and quality percentages, and see how it compares to world-class benchmarks.',
 seo:{title:'OEE Calculator — Overall Equipment Effectiveness | Varada Nexus',description:'Free OEE calculator. Combine availability, performance and quality to get Overall Equipment Effectiveness and benchmark it.',keywords:['oee calculator','overall equipment effectiveness','manufacturing efficiency calculator']},
 inputs:[{id:'availability',label:'Availability (%)',type:'number',default:90,min:0,max:100},{id:'performance',label:'Performance (%)',type:'number',default:95,min:0,max:100},{id:'quality',label:'Quality (%)',type:'number',default:99,min:0,max:100}],
 results:{rowFmt:'raw',columns:['Factor','','Value'],kpis:[{key:'k1',label:'OEE',format:'text'},{key:'k2',label:'Rating',format:'text'},{key:'k3',label:'World-class gap',format:'text'}]},
 assumptions:'OEE = Availability × Performance × Quality. World-class OEE is around 85%; 60% is typical and below 40% is low.',
 faq:[{q:'How is OEE calculated?',a:'OEE = Availability% × Performance% × Quality%. For example, 90% × 95% × 99% ≈ 84.6%.'},
   {q:'What is a good OEE score?',a:'85% is considered world-class for discrete manufacturing; 60% is fairly typical; under 40% indicates significant losses.'},
   {q:'What do the three factors mean?',a:'Availability = uptime vs planned time; Performance = actual vs ideal speed; Quality = good units vs total units.'}],
 related:[{label:'Our Services',url:'/services.html'}],
 logic:`const pc=n=>(Math.round(n*10)/10)+'%';
export function compute(v){
  const a=+v.availability||0,p=+v.performance||0,q=+v.quality||0, oee=a*p*q/10000;
  const rating = oee>=85?'World-class':oee>=60?'Typical':oee>=40?'Low':'Very low';
  const gap=85-oee;
  const rows=[['Availability','',pc(a)],['Performance','',pc(p)],['Quality','',pc(q)],['OEE','A x P x Q',pc(oee)]];
  return {rows,k1:pc(oee),k2:rating,k3:(gap>0?pc(gap):'0%')};
}`});

/* ===== PROCUREMENT & SUPPLY CHAIN ===== */
add({cat:'procurement-supply-chain',id:'eoq-calculator',name:'EOQ Calculator',
 short:'Economic Order Quantity, orders per year and cycle length.',
 intro:'Calculate the Economic Order Quantity (EOQ) that minimises total ordering and holding cost, plus the number of orders per year and days between orders.',
 seo:{title:'EOQ Calculator — Economic Order Quantity & Reorder Frequency | Varada Nexus',description:'Free EOQ calculator. Find the economic order quantity, orders per year and order cycle from demand, ordering and holding cost.',keywords:['eoq calculator','economic order quantity','inventory ordering calculator']},
 inputs:[{id:'demand',label:'Annual demand (units)',type:'number',default:12000,min:0},{id:'orderCost',label:'Cost per order (₹)',type:'number',default:1200,min:0},{id:'holding',label:'Holding cost per unit/year (₹)',type:'number',default:30,min:0}],
 results:{rowFmt:'raw',columns:['Metric','','Value'],kpis:[{key:'k1',label:'EOQ',format:'text'},{key:'k2',label:'Orders per year',format:'text'},{key:'k3',label:'Days between orders',format:'text'}]},
 assumptions:'EOQ = √(2 × annual demand × ordering cost ÷ holding cost per unit per year). Assumes steady demand and constant costs.',
 faq:[{q:'What is Economic Order Quantity?',a:'EOQ is the order size that minimises the combined cost of ordering and holding inventory: √(2DS ÷ H).'},
   {q:'How many times should I order per year?',a:'Orders per year = annual demand ÷ EOQ. Days between orders = 365 ÷ orders per year.'},
   {q:'What are the assumptions of EOQ?',a:'Constant demand, fixed ordering cost and holding cost, and no stock-outs or quantity discounts.'}],
 related:[{label:'Mining & Logistics',url:'/logistics.html'}],
 logic:`const num=n=>Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const D=+v.demand||0,S=+v.orderCost||0,H=+v.holding||0;
  const eoq=H>0?Math.sqrt(2*D*S/H):0, orders=eoq>0?D/eoq:0, days=orders>0?365/orders:0;
  const rows=[['EOQ','optimal order size',num(eoq)+' units'],['Orders per year','',(Math.round(orders*10)/10)],['Days between orders','',Math.round(days)+' days']];
  return {rows,k1:num(eoq)+' units',k2:(Math.round(orders*10)/10),k3:Math.round(days)+' days'};
}`});

/* ===== TRANSPORTATION & LOGISTICS ===== */
add({cat:'transportation-logistics',id:'trip-fuel-cost-calculator',name:'Trip Fuel Cost Calculator',
 short:'Fuel used, fuel cost, tolls and total cost per trip and per km.',
 intro:'Estimate the fuel and total running cost of a trip from distance, mileage, fuel price and tolls, including cost per kilometre.',
 seo:{title:'Trip Fuel Cost Calculator — Fuel, Tolls & Cost Per Km | Varada Nexus',description:'Free trip fuel cost calculator. Get fuel used, fuel cost, tolls and total cost per trip and per kilometre.',keywords:['fuel cost calculator','trip cost calculator','cost per km calculator']},
 inputs:[{id:'distance',label:'Distance (km)',type:'number',default:500,min:0},{id:'mileage',label:'Mileage (km/litre)',type:'number',default:12,min:0.1},{id:'price',label:'Fuel price (₹/litre)',type:'number',default:95,min:0},{id:'tolls',label:'Tolls & other (₹)',type:'number',default:800,min:0}],
 results:{rowFmt:'raw',columns:['Metric','','Value'],kpis:[{key:'k1',label:'Total trip cost',format:'text'},{key:'k2',label:'Fuel needed',format:'text'},{key:'k3',label:'Cost per km',format:'text'}]},
 assumptions:'Fuel needed = distance ÷ mileage. Fuel cost = fuel × price. Total = fuel cost + tolls. Cost per km = total ÷ distance.',
 faq:[{q:'How do I calculate fuel cost for a trip?',a:'Fuel needed = distance ÷ mileage (km per litre); fuel cost = fuel × price per litre.'},
   {q:'How is cost per km calculated?',a:'Cost per km = total trip cost (fuel + tolls) ÷ distance.'},
   {q:'Does load affect mileage?',a:'Yes, heavier loads, terrain and driving style all reduce mileage — use a realistic figure for your vehicle.'}],
 related:[{label:'Mining & Logistics',url:'/logistics.html'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const d=+v.distance||0,m=+v.mileage||1,p=+v.price||0,t=+v.tolls||0;
  const fuel=d/m, fcost=fuel*p, total=fcost+t, perKm=d>0?total/d:0;
  const rows=[['Fuel needed','@ '+m+' km/L',(Math.round(fuel*10)/10)+' L'],['Fuel cost','@ ₹'+p+'/L',inr(fcost)],['Tolls & other','',inr(t)],['Total trip cost','',inr(total)],['Cost per km','',inr(perKm)]];
  return {rows,k1:inr(total),k2:(Math.round(fuel*10)/10)+' L',k3:inr(perKm)};
}`});

/* ===== SOFTWARE & EMS ===== */
add({cat:'software-ems',id:'uptime-sla-downtime-calculator',name:'Uptime SLA Downtime Calculator',
 short:'Allowed downtime per day, month and year for any SLA %.',
 intro:'Convert an uptime SLA percentage into the maximum allowed downtime per day, week, month and year — useful for SLAs and reliability targets.',
 seo:{title:'Uptime SLA Calculator — Allowed Downtime for 99.9% & More | Varada Nexus',description:'Free uptime SLA calculator. See allowed downtime per day, month and year for 99%, 99.9%, 99.99% and custom SLAs.',keywords:['uptime calculator','sla downtime calculator','99.9 uptime downtime']},
 inputs:[{id:'sla',label:'Uptime SLA (%)',type:'number',default:99.9,min:0,max:100}],
 results:{rowFmt:'raw',columns:['Period','','Allowed downtime'],kpis:[{key:'k1',label:'Per month',format:'text'},{key:'k2',label:'Per year',format:'text'},{key:'k3',label:'Per day',format:'text'}]},
 assumptions:'Allowed downtime = (1 − SLA ÷ 100) × period. Based on 24×7 operation, 30-day months and 365-day years.',
 faq:[{q:'How much downtime does 99.9% uptime allow?',a:'99.9% ("three nines") allows about 43.8 minutes per month and 8.77 hours per year.'},
   {q:'How is allowed downtime calculated?',a:'Downtime = (1 − SLA%) × total time in the period. For 99.9%, that is 0.001 × the period.'},
   {q:'What is the difference between 99.9% and 99.99%?',a:'99.99% ("four nines") allows only ~4.4 minutes of downtime per month versus ~43.8 minutes for 99.9%.'}],
 related:[{label:'Our Services',url:'/services.html'}],
 logic:`function fmt(mins){ if(mins>=1440)return (Math.round(mins/1440*100)/100)+' days'; if(mins>=60)return (Math.round(mins/60*100)/100)+' hours'; return (Math.round(mins*100)/100)+' min'; }
export function compute(v){
  const sla=+v.sla||0, down=(1-sla/100);
  const day=down*24*60, week=day*7, month=day*30, year=day*365;
  const rows=[['Per day','',fmt(day)],['Per week','',fmt(week)],['Per month','30 days',fmt(month)],['Per year','365 days',fmt(year)]];
  return {rows,k1:fmt(month),k2:fmt(year),k3:fmt(day)};
}`});

/* ===== HEALTHCARE ===== */
add({cat:'healthcare',id:'hospital-staffing-calculator',name:'Hospital Nurse Staffing Calculator',
 short:'Nurses required per shift and per day from beds and ratios.',
 intro:'Estimate the number of nurses required per shift and per day for a hospital ward from bed count, occupancy, nurse-to-patient ratio and a leave-relief factor.',
 seo:{title:'Hospital Nurse Staffing Calculator — Nurses by Beds & Ratio | Varada Nexus',description:'Free hospital nurse staffing calculator. Estimate nurses per shift and per day from beds, occupancy and nurse-to-patient ratio.',keywords:['nurse staffing calculator','hospital staffing calculator','nurse patient ratio calculator']},
 inputs:[{id:'beds',label:'Number of beds',type:'number',default:100,min:0},{id:'occupancy',label:'Occupancy (%)',type:'number',default:80,min:0,max:100},{id:'ratio',label:'Patients per nurse (per shift)',type:'select',default:'6',options:[{v:'1',t:'1:1 (ICU)'},{v:'4',t:'1:4 (high dependency)'},{v:'6',t:'1:6 (general ward)'},{v:'8',t:'1:8 (low acuity)'}]},{id:'shifts',label:'Shifts per day',type:'number',default:3,min:1},{id:'leave',label:'Leave-relief factor',type:'number',default:1.3,min:1}],
 results:{rowFmt:'raw',columns:['Metric','','Value'],kpis:[{key:'k1',label:'Nurses per shift',format:'text'},{key:'k2',label:'Nurses per day (with relief)',format:'text'},{key:'k3',label:'Patients',format:'text'}]},
 assumptions:'Patients = beds × occupancy%. Nurses per shift = patients ÷ patients-per-nurse. Nurses per day = per-shift × shifts × leave-relief factor (covers offs, leave and training).',
 faq:[{q:'How do I calculate nurse staffing?',a:'Nurses per shift = occupied beds ÷ patients-per-nurse ratio. Multiply by shifts per day and a leave-relief factor for the daily headcount.'},
   {q:'What is a leave-relief factor?',a:'A multiplier (often 1.3–1.5) that adds nurses to cover weekly offs, leave, training and absenteeism.'},
   {q:'What nurse-to-patient ratio should I use?',a:'It depends on acuity — roughly 1:1 for ICU, 1:4 for high dependency and 1:6 for general wards.'}],
 related:[{label:'Hospital Consultancy',url:'/consultancy.html'}],
 logic:`const num=n=>Math.ceil(n).toLocaleString('en-IN');
export function compute(v){
  const beds=+v.beds||0,occ=+v.occupancy||0,ratio=+v.ratio||6,sh=+v.shifts||3,lf=+v.leave||1.3;
  const patients=beds*occ/100, perShift=Math.ceil(patients/ratio), perDay=Math.ceil(perShift*sh*lf);
  const rows=[['Occupied beds','@ '+occ+'% occupancy',Math.round(patients)],['Nurses per shift','1:'+ratio+' ratio',num(perShift)],['Shifts per day','',sh],['Nurses per day','x relief '+lf,num(perDay)]];
  return {rows,k1:num(perShift),k2:num(perDay),k3:Math.round(patients)+' patients'};
}`});

/* ===== RETAIL & DISTRIBUTION ===== */
add({cat:'retail-distribution',id:'inventory-turnover-calculator',name:'Inventory Turnover Calculator',
 short:'Inventory turnover ratio and days of inventory on hand.',
 intro:'Calculate the inventory turnover ratio and days inventory outstanding from cost of goods sold and average inventory — a key retail efficiency metric.',
 seo:{title:'Inventory Turnover Calculator — Turnover Ratio & Days on Hand | Varada Nexus',description:'Free inventory turnover calculator. Get the turnover ratio and days of inventory from COGS and average inventory.',keywords:['inventory turnover calculator','stock turnover ratio','days inventory outstanding']},
 inputs:[{id:'cogs',label:'Cost of goods sold — annual (₹)',type:'number',default:6000000,min:0},{id:'inventory',label:'Average inventory (₹)',type:'number',default:750000,min:0}],
 results:{rowFmt:'raw',columns:['Metric','','Value'],kpis:[{key:'k1',label:'Turnover ratio',format:'text'},{key:'k2',label:'Days on hand',format:'text'},{key:'k3',label:'Turns per year',format:'text'}]},
 assumptions:'Inventory turnover = COGS ÷ average inventory. Days inventory = 365 ÷ turnover. Higher turnover means stock sells faster.',
 faq:[{q:'How is inventory turnover calculated?',a:'Turnover = cost of goods sold ÷ average inventory. It shows how many times stock is sold and replaced in a year.'},
   {q:'What is days inventory outstanding?',a:'Days = 365 ÷ turnover ratio — the average number of days stock sits before it sells.'},
   {q:'Is a higher turnover always better?',a:'Generally yes, but very high turnover can signal understocking and lost sales; balance it against availability.'}],
 related:[{label:'E-Commerce',url:'/ecommerce.html'}],
 logic:`export function compute(v){
  const cogs=+v.cogs||0, inv=+v.inventory||0, turn=inv>0?cogs/inv:0, days=turn>0?365/turn:0;
  const rows=[['Inventory turnover','COGS ÷ avg inventory',(Math.round(turn*100)/100)+'x'],['Days inventory on hand','365 ÷ turnover',Math.round(days)+' days']];
  return {rows,k1:(Math.round(turn*100)/100)+'x',k2:Math.round(days)+' days',k3:(Math.round(turn*10)/10)+' turns/yr'};
}`});

/* ===================== WRITE ALL FILES ===================== */
let written=0;
for(const t of TOOLS){
  const dir=path.join(SRC,t.cat,t.id);
  fs.mkdirSync(dir,{recursive:true});
  const manifest={
    id:t.id, category:t.cat, kind:'calculator', name:t.name, shortBenefit:t.short,
    status:'published', phase:1, updated:'2026-07-09', intro:t.intro,
    seo:t.seo, inputs:t.inputs, results:t.results, assumptions:t.assumptions,
    disclaimer:D, faq:t.faq, relatedServices:t.related
  };
  fs.writeFileSync(path.join(dir,'tool.json'), JSON.stringify(manifest,null,2));
  fs.writeFileSync(path.join(dir,'logic.js'), t.logic+'\n');
  written++;
}
console.log('Seeded '+written+' tools into tools-src/');
