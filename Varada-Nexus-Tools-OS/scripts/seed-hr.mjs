import { writeTools, CHECKLIST_LOGIC, CHECKLIST_RESULTS, D } from './_seedlib.mjs';
const REL=[{label:'HR & PR Services',url:'/services.html'},{label:'Contact Us',url:'/contact.html'}];
const T=[];
const push=o=>{o.cat='hr-public-relations';o.related=o.related||REL;T.push(o);};

/* 1. Salary Calculator (Net Take-Home) */
push({id:'salary-calculator',name:'Salary & Take-Home Calculator',
 short:'CTC to in-hand salary with all deductions.',
 intro:'Calculate your monthly in-hand (net) salary from your annual CTC by deducting PF, professional tax, income tax (simplified) and other components.',
 seo:{title:'Salary Calculator India — CTC to In-Hand Take-Home | Varada Nexus',description:'Free salary calculator India. Convert annual CTC to monthly in-hand salary with PF, professional tax and income tax deductions.',keywords:['salary calculator india','ctc to in hand salary calculator','take home salary calculator']},
 inputs:[
  {id:'ctc',label:'Annual CTC (₹)',type:'number',default:600000,min:100000},
  {id:'basic_pct',label:'Basic salary (% of CTC)',type:'number',default:40,min:20,max:60},
  {id:'hra_pct',label:'HRA (% of basic)',type:'number',default:50,min:0,max:100},
  {id:'pf',label:'Employee PF contribution (%)',type:'number',default:12,min:0,max:12},
  {id:'prof_tax',label:'Professional tax (₹/month)',type:'number',default:200,min:0},
  {id:'other_deductions',label:'Other monthly deductions (₹)',type:'number',default:0,min:0}],
 results:{rowFmt:'raw',columns:['Component','Annual (₹)','Monthly (₹)'],kpis:[{key:'k1',label:'Monthly in-hand salary',format:'text'},{key:'k2',label:'Annual in-hand salary',format:'text'},{key:'k3',label:'Total deductions/month',format:'text'}]},
 assumptions:'PF calculated on basic. Income tax estimate uses simplified slab (new regime FY2025): 0% up to ₹3L, 5% 3–7L, 10% 7–10L, 15% 10–12L, 20% 12–15L, 30% above 15L. Standard deduction ₹75,000 applied.',
 faq:[
  {q:'What is CTC?',a:'CTC (Cost to Company) is the total annual expenditure a company incurs for an employee. It includes basic salary, HRA, PF contributions, bonuses and other allowances.'},
  {q:'What is the difference between gross salary and net salary?',a:'Gross salary is the total pay before deductions. Net (in-hand) salary is what you actually receive after deducting PF, professional tax, income tax and other deductions.'},
  {q:'How is PF calculated on salary?',a:'Employee PF is 12% of basic salary (up to ₹15,000 basic). Employer also contributes 12% of basic, of which 8.33% goes to EPS and 3.67% to EPF.'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const ctc=+v.ctc||600000,bpct=+v.basic_pct||40,hpct=+v.hra_pct||50,pfp=+v.pf||12,pt=+v.prof_tax||200,od=+v.other_deductions||0;
  const basic=ctc*bpct/100,hra=basic*hpct/100,specialAllow=ctc-basic-hra-(basic*pfp/100*2);
  const monthlyGross=ctc/12;
  const pfEmp=Math.round(basic/12*pfp/100);
  // simplified income tax new regime
  const taxable=Math.max(0,ctc-75000);
  let tax=0;
  if(taxable>1500000)tax=150000+(taxable-1500000)*0.30;
  else if(taxable>1200000)tax=90000+(taxable-1200000)*0.20;
  else if(taxable>1000000)tax=60000+(taxable-1000000)*0.15;
  else if(taxable>700000)tax=15000+(taxable-700000)*0.10;
  else if(taxable>300000)tax=(taxable-300000)*0.05;
  const monthlyTax=Math.round(tax/12);
  const totalDeduct=pfEmp+pt+monthlyTax+od;
  const netMonthly=Math.round(monthlyGross-totalDeduct);
  const rows=[
   ['Basic salary',inr(Math.round(basic)),inr(Math.round(basic/12))],
   ['HRA',inr(Math.round(hra)),inr(Math.round(hra/12))],
   ['Special allowance',inr(Math.round(specialAllow)),inr(Math.round(specialAllow/12))],
   ['Gross salary',inr(ctc),inr(Math.round(monthlyGross))],
   ['— Employee PF ('+pfp+'%)','','-'+inr(pfEmp)],
   ['— Professional tax','','-'+inr(pt)],
   ['— Income tax (est.)','','-'+inr(monthlyTax)],
   ['— Other deductions','','-'+inr(od)],
   ['Net in-hand salary','',inr(netMonthly)]];
  return{rows,k1:inr(netMonthly)+'/mo',k2:inr(netMonthly*12)+'/yr',k3:inr(totalDeduct)+'/mo'};}`});

/* 2. CTC Calculator */
push({id:'ctc-calculator',name:'CTC Structure Calculator',
 short:'Build annual CTC from salary components.',
 intro:'Structure an employee\'s CTC by defining all components — basic, HRA, allowances, PF, bonus and benefits — and get total cost to company.',
 seo:{title:'CTC Calculator — Cost to Company Structure Builder | Varada Nexus',description:'Free CTC calculator. Build and structure employee CTC from basic salary, HRA, allowances, PF, bonus and other benefits for payroll planning.',keywords:['ctc calculator','cost to company calculator','salary structure builder india']},
 inputs:[
  {id:'basic',label:'Basic salary (₹/month)',type:'number',default:25000,min:1},
  {id:'hra',label:'HRA (₹/month)',type:'number',default:12500,min:0},
  {id:'transport',label:'Transport allowance (₹/month)',type:'number',default:1600,min:0},
  {id:'medical',label:'Medical allowance (₹/month)',type:'number',default:1250,min:0},
  {id:'special',label:'Special allowance (₹/month)',type:'number',default:5000,min:0},
  {id:'bonus_pct',label:'Annual bonus (% of basic)',type:'number',default:10,min:0},
  {id:'gratuity_flag',label:'Include gratuity',type:'select',default:'yes',options:[{v:'yes',t:'Yes (4.81% of basic)'},{v:'no',t:'No'}]}],
 results:{rowFmt:'raw',columns:['Component','Monthly (₹)','Annual (₹)'],kpis:[{key:'k1',label:'Annual CTC',format:'text'},{key:'k2',label:'Monthly gross',format:'text'},{key:'k3',label:'Employee PF',format:'text'}]},
 assumptions:'Employer PF = 12% of basic. Gratuity = 4.81% of basic (15/26 days × 1 year). ESIC not included (applicable if gross ≤ ₹21,000/month).',
 faq:[
  {q:'What components make up CTC?',a:'CTC = Fixed pay (basic+allowances) + Variable pay (bonus) + Employer contributions (PF, gratuity, ESIC) + Benefits (insurance, food). Only fixed and variable components go in the payslip.'},
  {q:'Is gratuity part of CTC?',a:'Yes — gratuity is typically included in CTC at 4.81% of basic salary. It is paid after 5 years of continuous service at 15 days pay per year.'},
  {q:'What is the minimum basic salary as % of CTC?',a:'There is no statutory minimum percentage, but it should be at least 50% of gross or meet minimum wage. PF is calculated on basic, so many employers keep basic low — but this can create compliance risk.'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const basic=+v.basic||25000,hra=+v.hra||12500,tr=+v.transport||1600,med=+v.medical||1250,sp=+v.special||5000;
  const bonusPct=+v.bonus_pct||10,grat=v.gratuity_flag==='yes';
  const monthlyFixed=basic+hra+tr+med+sp;
  const empPF=Math.round(basic*0.12);
  const emplrPF=Math.round(basic*0.12);
  const gratuity=grat?Math.round(basic*0.0481):0;
  const annualBonus=Math.round(basic*12*bonusPct/100);
  const annualCTC=(monthlyFixed+emplrPF+gratuity)*12+annualBonus;
  const rows=[
   ['Basic',inr(basic),inr(basic*12)],
   ['HRA',inr(hra),inr(hra*12)],
   ['Transport allowance',inr(tr),inr(tr*12)],
   ['Medical allowance',inr(med),inr(med*12)],
   ['Special allowance',inr(sp),inr(sp*12)],
   ['Monthly gross',inr(monthlyFixed),inr(monthlyFixed*12)],
   ['Annual bonus','',inr(annualBonus)],
   ['Employer PF (12%)',inr(emplrPF),inr(emplrPF*12)],
   ['Gratuity (4.81%)',grat?inr(gratuity):'—',grat?inr(gratuity*12):'—'],
   ['TOTAL CTC','',inr(annualCTC)]];
  return{rows,k1:inr(annualCTC)+'/yr',k2:inr(monthlyFixed)+'/mo',k3:inr(empPF)+'/mo'};}`});

/* 3. Leave Calculator */
push({id:'leave-calculator',name:'Leave Balance Calculator',
 short:'Leave balance, accrual and encashment values.',
 intro:'Calculate your leave balance including earned leave accrual, carry-forward, leave encashment value and leave liability for payroll.',
 seo:{title:'Leave Balance Calculator — Earned Leave & Encashment India | Varada Nexus',description:'Free leave calculator India. Calculate earned leave balance, carry-forward, leave encashment value and leave liability for employees.',keywords:['leave calculator india','earned leave calculator','leave encashment calculator']},
 inputs:[
  {id:'annual_el',label:'Annual earned leave entitlement (days)',type:'number',default:21,min:0},
  {id:'cl',label:'Casual leave entitlement (days)',type:'number',default:12,min:0},
  {id:'sl',label:'Sick leave entitlement (days)',type:'number',default:6,min:0},
  {id:'el_availed',label:'Earned leave availed this year (days)',type:'number',default:5,min:0},
  {id:'el_bf',label:'EL brought forward from last year (days)',type:'number',default:10,min:0},
  {id:'basic_monthly',label:'Basic salary (₹/month) for encashment',type:'number',default:25000,min:1},
  {id:'max_cf',label:'Max carry-forward limit (days)',type:'number',default:30,min:0}],
 results:{rowFmt:'raw',columns:['Leave Type','Entitlement','Balance'],kpis:[{key:'k1',label:'EL balance',format:'text'},{key:'k2',label:'Encashable value',format:'text'},{key:'k3',label:'Total leave balance',format:'text'}]},
 assumptions:'EL accrual = annual entitlement. Balance = BF + accrued − availed. Carry-forward = min(balance, max CF limit). Encashment = days × (basic/26). Casual and sick leave cannot be encashed per most Indian company policies.',
 faq:[
  {q:'How is earned leave encashment calculated?',a:'Leave encashment = number of leave days × (basic salary ÷ 26 working days). Government employees get more favourable terms under Section 10(10AA) with tax exemption up to ₹25 lakh.'},
  {q:'What is the maximum earned leave that can be accumulated?',a:'Most companies allow 30–60 days carry-forward. The Factories Act and Shops & Establishments Act prescribe minimums but employers can be more generous.'},
  {q:'Is leave encashment taxable?',a:'For private sector employees: fully taxable. For government employees: exempt up to ₹25 lakh under Section 10(10AA). Encashment at retirement is more favourably treated.'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const ael=+v.annual_el||21,cl=+v.cl||12,sl=+v.sl||6,availed=+v.el_availed||0,bf=+v.el_bf||0,basic=+v.basic_monthly||25000,maxCF=+v.max_cf||30;
  const elBalance=bf+ael-availed;
  const carryFwd=Math.min(elBalance,maxCF);
  const encashable=Math.max(0,elBalance-availed);
  const encashValue=Math.round(elBalance*(basic/26));
  const total=elBalance+cl+sl;
  const rows=[
   ['Earned leave (EL)',ael+' days','Balance: '+elBalance+' days'],
   ['— Brought forward',bf+' days',''],
   ['— Availed this year',availed+' days',''],
   ['— Carry-forward (next yr)','',carryFwd+' days (max '+maxCF+')'],
   ['Casual leave (CL)',cl+' days',cl+' days (not encashable)'],
   ['Sick leave (SL)',sl+' days',sl+' days (not encashable)'],
   ['EL encashment value','',inr(encashValue)],
   ['Total leave balance','',total+' days']];
  return{rows,k1:elBalance+' days',k2:inr(encashValue),k3:total+' days'};}`});

/* 4. Notice Period Calculator */
push({id:'notice-period-calculator',name:'Notice Period & Last Working Day Calculator',
 short:'Last working day and notice period completion date.',
 intro:'Calculate your last working day and notice period end date, accounting for weekends, public holidays and notice buy-out options.',
 seo:{title:'Notice Period Calculator — Last Working Day Calculator India | Varada Nexus',description:'Free notice period calculator. Calculate last working day and notice completion date with working days count and notice buy-out salary.',keywords:['notice period calculator','last working day calculator','notice period buyout calculator india']},
 inputs:[
  {id:'notice_days',label:'Notice period (calendar days)',type:'number',default:30,min:1},
  {id:'daily_basic',label:'Basic salary (₹/day) for buy-out',type:'number',default:1000,min:0},
  {id:'leaves_availed',label:'Leave days to adjust off notice',type:'number',default:0,min:0},
  {id:'weekends',label:'Working weekends in notice period',type:'number',default:0,min:0}],
 results:{rowFmt:'raw',columns:['Component','','Value'],kpis:[{key:'k1',label:'Notice period (days)',format:'text'},{key:'k2',label:'Buy-out cost',format:'text'},{key:'k3',label:'Working days in notice',format:'text'}]},
 assumptions:'Working days = notice days − (notice days ÷ 7 × 2) Sundays − Saturdays + working weekends − leave days. Buy-out = remaining working days × daily basic. Assumes 5-day work week.',
 faq:[
  {q:'Can I buy out my notice period?',a:'Yes, most employment contracts allow notice buy-out (paying salary in lieu of notice). The cost is typically basic salary for the remaining notice days.'},
  {q:'Do public holidays count in notice period?',a:'Usually yes — public holidays are counted as part of the calendar notice period. Confirm with your employment contract.'},
  {q:'What if I am on leave during notice period?',a:'Leaves availed during the notice period do not extend it unless specified in your contract. Some companies require you to complete the notice after the leave.'}],
 logic:`export function compute(v){
  const nd=+v.notice_days||30,db=+v.daily_basic||1000,la=+v.leaves_availed||0,ww=+v.weekends||0;
  const weekendDays=Math.round(nd/7)*2;
  const workingDays=Math.max(0,nd-weekendDays+ww-la);
  const buyout=Math.round(workingDays*db);
  const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
  const rows=[
   ['Notice period',nd+' calendar days',''],
   ['Weekend days (approx)',weekendDays+' days','Non-working'],
   ['Working weekends added',ww+' days',''],
   ['Leaves adjusted',la+' days',''],
   ['Effective working days','',workingDays+' days'],
   ['Buy-out cost ('+workingDays+' days × daily basic)','',inr(buyout)]];
  return{rows,k1:nd+' days',k2:inr(buyout),k3:workingDays+' days'};}`});

/* 5. Overtime Calculator */
push({id:'overtime-calculator',name:'Overtime Pay Calculator',
 short:'Overtime pay under Factories Act and company policy.',
 intro:'Calculate overtime pay for employees under the Factories Act 1948 (double rate) or company overtime policy, with total earnings including regular pay.',
 seo:{title:'Overtime Pay Calculator India — Factories Act OT Calculation | Varada Nexus',description:'Free overtime calculator India. Calculate overtime pay under the Factories Act 1948 (double rate) or company policy from hourly rate and hours worked.',keywords:['overtime calculator india','factories act overtime','ot pay calculator india']},
 inputs:[
  {id:'monthly_basic',label:'Monthly basic + DA (₹)',type:'number',default:20000,min:1},
  {id:'working_days',label:'Working days per month',type:'number',default:26,min:20,max:31},
  {id:'working_hours',label:'Working hours per day',type:'number',default:8,min:4,max:12},
  {id:'ot_hours',label:'Overtime hours this month',type:'number',default:10,min:0},
  {id:'ot_rate',label:'OT rate multiplier',type:'select',default:'2',options:[{v:'1.5',t:'1.5× (common company policy)'},{v:'2',t:'2× (Factories Act)'},{v:'1',t:'1× (basic time rate)'}]}],
 results:{rowFmt:'raw',columns:['Component','','Amount'],kpis:[{key:'k1',label:'Overtime pay',format:'text'},{key:'k2',label:'Total monthly pay',format:'text'},{key:'k3',label:'Hourly rate',format:'text'}]},
 assumptions:'Hourly rate = monthly basic ÷ (working days × hours/day). OT pay = OT hours × hourly rate × multiplier. Factories Act mandates 2× for workers.',
 faq:[
  {q:'What is the overtime rate under the Factories Act?',a:'The Factories Act 1948 (Section 59) mandates double the ordinary rate of wages for overtime. Workers cannot be asked to work more than 10.5 hours/day or 60 hours/week.'},
  {q:'Is overtime applicable to all employees?',a:'Factories Act overtime applies to workers in factories. Office employees (under Shops & Establishments Act) have separate state-specific rules. Senior management may not be eligible for OT.'},
  {q:'How is the overtime hourly rate calculated?',a:'Hourly rate = (basic + DA) ÷ (working days × hours per day). Overtime is calculated on basic + DA, not on HRA or other allowances.'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const basic=+v.monthly_basic||20000,wd=+v.working_days||26,wh=+v.working_hours||8,oth=+v.ot_hours||10,rate=+v.ot_rate||2;
  const hourlyRate=basic/(wd*wh);
  const otPay=Math.round(oth*hourlyRate*rate);
  const totalPay=basic+otPay;
  const rows=[
   ['Basic + DA',inr(basic),''],
   ['Working days/month',wd,''],
   ['Hours/day',wh,''],
   ['Hourly rate (basic/DA)',inr(Math.round(hourlyRate*100)/100),''],
   ['OT hours',oth+'h',''],
   ['OT rate','×'+rate,''],
   ['Overtime pay','',inr(otPay)],
   ['Total pay this month','',inr(totalPay)]];
  return{rows,k1:inr(otPay),k2:inr(totalPay),k3:'₹'+Math.round(hourlyRate*100)/100+'/hr'};}`});

/* 6. Attendance Calculator */
push({id:'attendance-calculator',name:'Attendance & Salary Deduction Calculator',
 short:'Per-day salary and LOP deductions from attendance.',
 intro:'Calculate salary deductions for Loss of Pay (LOP) days based on actual attendance, working days and salary structure.',
 seo:{title:'Attendance & Salary Deduction Calculator — LOP India | Varada Nexus',description:'Free attendance calculator. Calculate per-day salary and Loss of Pay (LOP) deductions from monthly attendance for payroll processing.',keywords:['attendance calculator','loss of pay calculator india','lop salary deduction calculator']},
 inputs:[
  {id:'gross_monthly',label:'Monthly gross salary (₹)',type:'number',default:40000,min:1},
  {id:'working_days',label:'Working days in month',type:'number',default:26,min:20,max:31},
  {id:'present_days',label:'Days present',type:'number',default:22,min:0},
  {id:'approved_leave',label:'Approved paid leave days',type:'number',default:2,min:0},
  {id:'holidays',label:'Public holidays in month',type:'number',default:2,min:0}],
 results:{rowFmt:'raw',columns:['Component','Days','Amount (₹)'],kpis:[{key:'k1',label:'Salary payable',format:'text'},{key:'k2',label:'LOP deduction',format:'text'},{key:'k3',label:'LOP days',format:'text'}]},
 assumptions:'LOP days = working days − present days − approved leave − public holidays. Per-day salary = monthly gross ÷ working days. Salary payable = gross − (LOP days × daily rate).',
 faq:[
  {q:'What is Loss of Pay (LOP)?',a:'LOP (Loss of Pay) is an unpaid absence — days when an employee is absent without approved leave. Salary is deducted for LOP days at the per-day rate.'},
  {q:'How is per-day salary calculated?',a:'Per-day salary = monthly gross ÷ number of working days in the month (typically 26 or actual working days). Some companies use calendar days (30 or 31).'},
  {q:'Are public holidays counted as working days for salary?',a:'No — public holidays are paid days off. They are excluded from the LOP calculation as employees are not expected to work on those days.'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const gross=+v.gross_monthly||40000,wd=+v.working_days||26,present=+v.present_days||22,al=+v.approved_leave||0,ph=+v.holidays||0;
  const paidDays=present+al+ph;
  const lopDays=Math.max(0,wd-paidDays);
  const dailyRate=gross/wd;
  const lopDeduct=Math.round(lopDays*dailyRate);
  const salaryPayable=gross-lopDeduct;
  const rows=[
   ['Working days in month',wd,''],
   ['Days present',present,''],
   ['Approved paid leave',al,''],
   ['Public holidays',ph,''],
   ['Paid days',paidDays,''],
   ['LOP days',lopDays,'-'+inr(lopDeduct)],
   ['Monthly gross',wd,inr(gross)],
   ['Salary payable',paidDays,inr(salaryPayable)]];
  return{rows,k1:inr(salaryPayable),k2:inr(lopDeduct),k3:lopDays+' days'};}`});

/* 7. Recruitment Cost Calculator */
push({id:'recruitment-cost-calculator',name:'Recruitment Cost Calculator',
 short:'Total cost per hire across sourcing, interviews and onboarding.',
 intro:'Calculate the total cost per hire including job advertising, recruiter fees, interview time, background verification and onboarding costs.',
 seo:{title:'Recruitment Cost Calculator — Cost Per Hire India | Varada Nexus',description:'Free recruitment cost calculator. Calculate total cost per hire including job ads, recruiter fees, interview time, background check and onboarding.',keywords:['recruitment cost calculator','cost per hire calculator india','hiring cost calculator']},
 inputs:[
  {id:'job_ads',label:'Job advertising cost (₹)',type:'number',default:5000,min:0},
  {id:'recruiter_fee',label:'Recruiter / agency fee (₹)',type:'number',default:30000,min:0},
  {id:'interview_hrs',label:'Total interview hours (all interviewers)',type:'number',default:8,min:0},
  {id:'interviewer_rate',label:'Interviewer hourly cost (₹)',type:'number',default:1000,min:0},
  {id:'bgv_cost',label:'Background verification (₹)',type:'number',default:2500,min:0},
  {id:'onboarding_cost',label:'Onboarding & training cost (₹)',type:'number',default:10000,min:0},
  {id:'hires',label:'Number of hires this cycle',type:'number',default:1,min:1}],
 results:{rowFmt:'raw',columns:['Cost Component','Total (₹)','Per Hire (₹)'],kpis:[{key:'k1',label:'Cost per hire',format:'text'},{key:'k2',label:'Total recruitment cost',format:'text'},{key:'k3',label:'Recruiter fee %',format:'text'}]},
 assumptions:'Interview cost = hours × interviewer hourly rate. All costs divided by number of hires for CPH. Industry benchmark CPH in India: ₹15,000–1,00,000 depending on role seniority.',
 faq:[
  {q:'What is a good cost per hire?',a:'Average CPH in India varies significantly: ₹15,000–30,000 for junior roles, ₹50,000–1,50,000 for mid-level, ₹1,00,000–5,00,000+ for senior/C-suite positions.'},
  {q:'How can I reduce cost per hire?',a:'Employee referral programmes (low CPH, high retention), building an internal talent pool, using LinkedIn Recruiter efficiently and investing in employer branding reduce CPH significantly.'},
  {q:'What is the recruiter agency fee percentage?',a:'Standard agency fee in India is 8–12% of annual CTC for junior/mid roles, 15–20% for senior roles, and up to 25–33% for executive search.'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const ads=+v.job_ads||0,rec=+v.recruiter_fee||0,intHrs=+v.interview_hrs||0,intRate=+v.interviewer_rate||0,bgv=+v.bgv_cost||0,onb=+v.onboarding_cost||0,hires=+v.hires||1;
  const intCost=intHrs*intRate;
  const total=ads+rec+intCost+bgv+onb;
  const cph=total/hires;
  const recPct=total>0?Math.round(rec/total*100):0;
  const rows=[['Job advertising',inr(ads),inr(Math.round(ads/hires))],['Recruiter / agency fee',inr(rec),inr(Math.round(rec/hires))],['Interview time cost',inr(Math.round(intCost)),inr(Math.round(intCost/hires))],['Background verification',inr(bgv),inr(Math.round(bgv/hires))],['Onboarding & training',inr(onb),inr(Math.round(onb/hires))],['Total',inr(total),inr(Math.round(cph))]];
  return{rows,k1:inr(Math.round(cph)),k2:inr(total),k3:recPct+'%'};}`});

/* 8. Employee Total Cost Calculator */
push({id:'employee-cost-calculator',name:'Employee Total Cost Calculator',
 short:'True total cost of employing a person including all overheads.',
 intro:'Calculate the true total cost of an employee to the organisation, including CTC, statutory contributions, infrastructure, HR and admin overheads.',
 seo:{title:'Employee Cost Calculator — True Cost of Hiring India | Varada Nexus',description:'Free employee cost calculator. Calculate true total cost per employee including CTC, PF, ESIC, office space, equipment and admin overhead.',keywords:['employee cost calculator','true cost of employee india','total employment cost calculator']},
 inputs:[
  {id:'ctc',label:'Annual CTC (₹)',type:'number',default:600000,min:1},
  {id:'office_cost',label:'Office space cost per employee (₹/month)',type:'number',default:8000,min:0},
  {id:'equipment',label:'Equipment & IT cost (₹/year)',type:'number',default:50000,min:0},
  {id:'hr_admin',label:'HR & admin overhead (₹/month)',type:'number',default:3000,min:0},
  {id:'training',label:'Annual training cost (₹)',type:'number',default:20000,min:0},
  {id:'bonus_pct',label:'Annual bonus (% of basic)',type:'number',default:10,min:0},
  {id:'basic_pct',label:'Basic % of CTC',type:'number',default:40,min:20,max:60}],
 results:{rowFmt:'raw',columns:['Cost Component','Monthly (₹)','Annual (₹)'],kpis:[{key:'k1',label:'True annual cost',format:'text'},{key:'k2',label:'Premium over CTC',format:'text'},{key:'k3',label:'Total cost multiplier',format:'text'}]},
 assumptions:'ESIC = 3.25% of gross monthly (if applicable). Office, HR, admin and equipment annualised. True cost = CTC + overhead costs.',
 faq:[
  {q:'Why does an employee cost more than their CTC?',a:'Beyond CTC, companies incur costs for office space, IT equipment, HR administration, training, recruitment, legal compliance and utilities. Total cost is typically 1.3–1.5× CTC.'},
  {q:'What is the ESIC contribution?',a:'ESIC (Employee State Insurance) applies if gross monthly salary ≤ ₹21,000. Employee contributes 0.75%; employer contributes 3.25% of gross wages.'},
  {q:'How do I calculate true cost per employee?',a:'Add CTC + employer PF + employer ESIC + office space + equipment + training + HR overhead + recruitment cost amortised over tenure.'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const ctc=+v.ctc||600000,ofc=+v.office_cost||8000,eqp=+v.equipment||50000,hr=+v.hr_admin||3000,trn=+v.training||20000,bpct=+v.bonus_pct||10,basicPct=+v.basic_pct||40;
  const basic=ctc*basicPct/100;
  const emplrPF=basic*0.12;
  const bonus=basic*bpct/100;
  const overhead=(ofc+hr)*12+eqp+trn;
  const trueCost=Math.round(ctc+emplrPF+overhead);
  const premium=Math.round(trueCost-ctc);
  const multiplier=Math.round(trueCost/ctc*100)/100;
  const rows=[
   ['CTC',inr(Math.round(ctc/12)),inr(ctc)],
   ['Employer PF (12% basic)',inr(Math.round(emplrPF/12)),inr(Math.round(emplrPF))],
   ['Office space',inr(ofc),inr(ofc*12)],
   ['Equipment & IT','',inr(eqp)],
   ['HR & admin',inr(hr),inr(hr*12)],
   ['Training','',inr(trn)],
   ['True total cost',inr(Math.round(trueCost/12)),inr(trueCost)]];
  return{rows,k1:inr(trueCost)+'/yr',k2:inr(premium),k3:multiplier+'×'};}`});

/* 9. Payroll Estimator */
push({id:'payroll-estimator',name:'Monthly Payroll Estimator',
 short:'Total monthly payroll cost for teams of any size.',
 intro:'Estimate total monthly and annual payroll cost for your team across employee bands, including all statutory contributions.',
 seo:{title:'Payroll Estimator — Monthly Payroll Cost Calculator India | Varada Nexus',description:'Free payroll estimator India. Calculate total monthly and annual payroll cost for teams with PF, ESIC, bonus and employer contributions.',keywords:['payroll estimator','monthly payroll cost calculator','team salary cost calculator india']},
 inputs:[
  {id:'band1_count',label:'Junior employees (count)',type:'number',default:10,min:0},
  {id:'band1_ctc',label:'Junior CTC (₹/year)',type:'number',default:300000,min:0},
  {id:'band2_count',label:'Mid-level employees (count)',type:'number',default:5,min:0},
  {id:'band2_ctc',label:'Mid-level CTC (₹/year)',type:'number',default:700000,min:0},
  {id:'band3_count',label:'Senior employees (count)',type:'number',default:2,min:0},
  {id:'band3_ctc',label:'Senior CTC (₹/year)',type:'number',default:1500000,min:0},
  {id:'bonus_month',label:'Annual bonus (months of CTC)',type:'number',default:1,min:0,max:6}],
 results:{rowFmt:'raw',columns:['Band','Employees','Annual Cost'],kpis:[{key:'k1',label:'Monthly payroll',format:'text'},{key:'k2',label:'Annual payroll',format:'text'},{key:'k3',label:'Total headcount',format:'text'}]},
 assumptions:'Annual cost = CTC × headcount + bonus (months × monthly CTC). PF and other statutory contributions assumed included in CTC.',
 faq:[
  {q:'What is included in payroll cost?',a:'Payroll cost includes gross salaries, employer PF contribution, employer ESIC (if applicable), bonuses, and any other variable pay. Leave encashment and gratuity are accrued but paid later.'},
  {q:'How often should payroll be processed?',a:'Monthly payroll is standard in India. Payroll must be processed by the 7th of the following month (for most states under Shops & Establishments Act).'},
  {q:'What are payroll compliance requirements in India?',a:'Key requirements: PF filing and payment by 15th of following month, ESIC by 15th, PT (professional tax) per state, TDS on salary, and annual Form 24Q filing.'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const b1c=+v.band1_count||0,b1s=+v.band1_ctc||0,b2c=+v.band2_count||0,b2s=+v.band2_ctc||0,b3c=+v.band3_count||0,b3s=+v.band3_ctc||0,bm=+v.bonus_month||1;
  const bands=[['Junior',b1c,b1s],['Mid-level',b2c,b2s],['Senior',b3c,b3s]];
  const rows=bands.filter(b=>b[1]>0).map(([n,c,s])=>[n,c,inr(Math.round(c*s))]);
  const total=bands.reduce((a,[,c,s])=>a+c*s,0);
  const bonus=bands.reduce((a,[,c,s])=>a+c*(s/12)*bm,0);
  const grand=total+bonus;
  const headcount=b1c+b2c+b3c;
  rows.push(['Annual bonus','',inr(Math.round(bonus))]);
  rows.push(['TOTAL',headcount,inr(Math.round(grand))]);
  return{rows,k1:inr(Math.round(grand/12))+'/mo',k2:inr(Math.round(grand))+'/yr',k3:headcount+' employees'};}`});

/* 10. HR Compliance Checklist */
push({id:'hr-compliance-checklist',name:'HR Compliance Checklist',kind:'checklist',
 short:'Statutory HR compliance audit for Indian businesses.',
 intro:'Audit your HR compliance status across key Indian labour laws including PF, ESIC, gratuity, minimum wage, maternity benefits and sexual harassment prevention.',
 seo:{title:'HR Compliance Checklist India — Labour Law Audit | Varada Nexus',description:'Free HR compliance checklist India. Audit PF, ESIC, gratuity, minimum wages, maternity benefits, POSH and other labour law compliance.',keywords:['hr compliance checklist india','labour law compliance audit','pf esic compliance checklist']},
 buttonLabel:'Run HR Compliance Audit',
 checklist:[
  {name:'1. PF & ESIC',items:[
   {id:'pf1',text:'PF registration obtained (if 20+ employees)',critical:true},
   {id:'pf2',text:'PF returns filed monthly (ECR) by 15th',critical:true},
   {id:'pf3',text:'ESIC registration obtained (if 10+ employees in applicable states)',critical:true},
   {id:'pf4',text:'ESIC returns filed half-yearly',critical:true},
   {id:'pf5',text:'PF passbooks / UAN activated for all employees'}]},
  {name:'2. Wages & Gratuity',items:[
   {id:'mw1',text:'Minimum wage paid as per state notification',critical:true},
   {id:'mw2',text:'Salary paid by 7th of following month (Shops & Establishments)',critical:true},
   {id:'mw3',text:'Gratuity Act compliance (if 10+ employees)',critical:true},
   {id:'mw4',text:'Payslips issued to all employees monthly'}]},
  {name:'3. Maternity & Leave',items:[
   {id:'mat1',text:'Maternity Benefit Act compliance (26 weeks leave)',critical:true},
   {id:'mat2',text:'Leave records maintained (EL, CL, SL) for all employees'},
   {id:'mat3',text:'Compensatory off / overtime records maintained'}]},
  {name:'4. POSH & Workplace Safety',items:[
   {id:'posh1',text:'Internal Complaints Committee (ICC) constituted under POSH Act',critical:true},
   {id:'posh2',text:'POSH policy displayed and communicated to employees',critical:true},
   {id:'posh3',text:'Annual POSH report submitted to district officer'},
   {id:'posh4',text:'Workplace safety and health policy in place'}]},
  {name:'5. Records & Registers',items:[
   {id:'reg1',text:'Muster roll / attendance register maintained'},
   {id:'reg2',text:'Wages register maintained per Payment of Wages Act'},
   {id:'reg3',text:'Form 24Q / TDS on salary filed quarterly'},
   {id:'reg4',text:'Shops & Establishments registration current'}]}],
 results:CHECKLIST_RESULTS,
 assumptions:'Requirements vary by employee count, state and industry. Consult a labour law practitioner for state-specific obligations.',
 faq:[
  {q:'When is PF registration mandatory?',a:'PF registration is mandatory for establishments with 20 or more employees. Voluntary registration is possible for smaller establishments.'},
  {q:'What is the POSH Act?',a:'The Prevention of Sexual Harassment (POSH) Act 2013 requires all organisations with 10+ employees to have an Internal Complaints Committee and a written anti-harassment policy.'},
  {q:'What are the penalties for non-compliance with labour laws?',a:'Penalties vary: PF default attracts damages of 5–25% plus interest; ESIC default attracts penalty up to twice the arrears. POSH non-compliance can attract fines up to ₹50,000.'}],
 logic:CHECKLIST_LOGIC});

/* 11. Interview Scorecard */
push({id:'interview-scorecard',name:'Interview Evaluation Scorecard',
 short:'Structured candidate scoring across competency areas.',
 intro:'Score job candidates consistently across technical skills, communication, problem-solving, cultural fit and experience using a weighted interview scorecard.',
 seo:{title:'Interview Scorecard — Candidate Evaluation Tool | Varada Nexus',description:'Free interview scorecard tool. Score candidates consistently across technical skills, communication, problem-solving and culture fit with weighted scoring.',keywords:['interview scorecard','candidate evaluation tool','structured interview scoring template']},
 inputs:[
  {id:'technical',label:'Technical / functional skills (1–5)',type:'number',default:4,min:1,max:5},
  {id:'communication',label:'Communication skills (1–5)',type:'number',default:3,min:1,max:5},
  {id:'problem_solving',label:'Problem-solving & analytical (1–5)',type:'number',default:4,min:1,max:5},
  {id:'culture_fit',label:'Culture & values fit (1–5)',type:'number',default:3,min:1,max:5},
  {id:'leadership',label:'Leadership / teamwork (1–5)',type:'number',default:3,min:1,max:5},
  {id:'experience',label:'Relevant experience & education (1–5)',type:'number',default:4,min:1,max:5}],
 results:{rowFmt:'raw',columns:['Competency','Score','Weighted Score'],kpis:[{key:'k1',label:'Overall score',format:'text'},{key:'k2',label:'Recommendation',format:'text'},{key:'k3',label:'Strongest area',format:'text'}]},
 assumptions:'Weights: Technical 30%, Problem-solving 20%, Experience 20%, Communication 15%, Culture fit 10%, Leadership 5%. Score /100.',
 faq:[
  {q:'Why use a structured interview scorecard?',a:'Structured scorecards reduce hiring bias, enable fair candidate comparison and improve prediction of job performance. Research shows structured interviews are 2× more predictive than unstructured ones.'},
  {q:'What is a passing score on this scorecard?',a:'A score above 70/100 typically indicates a strong candidate; 80+ is an excellent candidate. Below 60 suggests significant gaps that should be discussed before proceeding.'},
  {q:'What weight should cultural fit have in hiring?',a:'Cultural fit is important but should not override skill and performance. Keep it at 10–20% to prevent bias — focus on shared values and work style, not personal similarity.'}],
 logic:`const WEIGHTS={technical:0.30,problem_solving:0.20,experience:0.20,communication:0.15,culture_fit:0.10,leadership:0.05};
const LABELS={technical:'Technical / functional',problem_solving:'Problem-solving',experience:'Relevant experience',communication:'Communication',culture_fit:'Culture fit',leadership:'Leadership / teamwork'};
const RECS=[[85,'Strong Hire ✅'],[70,'Hire ✅'],[55,'Maybe — Discuss 🟡'],[0,'No Hire ❌']];
export function compute(v){
  const scores=Object.entries(WEIGHTS).map(([k,w])=>({k,l:LABELS[k],w,s:+v[k]||1}));
  const total=scores.reduce((a,f)=>a+f.s*f.w*20,0);
  const rec=RECS.find(([t])=>Math.round(total)>=t)[1];
  const best=scores.reduce((a,f)=>f.s>a.s?f:a,scores[0]);
  const rows=scores.map(f=>[f.l,f.s+'/5',Math.round(f.s*f.w*20)+' pts ('+Math.round(f.w*100)+'% weight)']);
  return{rows,k1:Math.round(total)+'/100',k2:rec,k3:best.l};}`});

/* 12. Offer Letter Generator */
push({id:'offer-letter-generator',name:'Offer Letter Summary Generator',
 short:'Offer letter key terms and compensation summary.',
 intro:'Generate a structured offer letter summary with all key terms — compensation, joining date, benefits, conditions — ready for review and customisation.',
 seo:{title:'Offer Letter Generator — Employment Offer Summary | Varada Nexus',description:'Free offer letter generator. Create a structured offer letter summary with CTC, joining date, benefits and conditions for hiring.',keywords:['offer letter generator','employment offer letter template india','job offer letter format']},
 inputs:[
  {id:'ctc',label:'Annual CTC offered (₹)',type:'number',default:600000,min:1},
  {id:'basic_pct',label:'Basic salary (% of CTC)',type:'number',default:40,min:20,max:60},
  {id:'variable_pct',label:'Variable / performance pay (% of CTC)',type:'number',default:10,min:0,max:50},
  {id:'notice_days',label:'Notice period (days)',type:'number',default:30,min:0},
  {id:'probation_months',label:'Probation period (months)',type:'number',default:3,min:0,max:12},
  {id:'joining_bonus',label:'Joining bonus (₹, 0 if none)',type:'number',default:0,min:0}],
 results:{rowFmt:'raw',columns:['Offer Term','','Value'],kpis:[{key:'k1',label:'Fixed annual CTC',format:'text'},{key:'k2',label:'Monthly in-hand (est.)',format:'text'},{key:'k3',label:'Variable pay',format:'text'}]},
 assumptions:'Fixed CTC = total CTC − variable. Monthly gross = fixed CTC ÷ 12. In-hand estimate assumes PF + PT deduction ~15%. Variable paid on achievement of targets.',
 faq:[
  {q:'What should an offer letter include?',a:'An offer letter should state: designation, CTC structure, fixed vs variable split, joining date, probation period, notice period, work location, conditions (background check, educational verification) and offer expiry date.'},
  {q:'Is an offer letter legally binding?',a:'An offer letter is not a full employment contract but does create some legal obligations. An appointment letter (issued post-joining) is the formal employment agreement.'},
  {q:'Can a company withdraw an offer letter?',a:'Companies can legally withdraw offers before the candidate joins, though it can attract claims for expenses incurred (resignation, relocation). Best practice is to include an "offer subject to verification" clause.'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const ctc=+v.ctc||600000,bpct=+v.basic_pct||40,vpct=+v.variable_pct||10,nd=+v.notice_days||30,prob=+v.probation_months||3,jb=+v.joining_bonus||0;
  const variable=Math.round(ctc*vpct/100);
  const fixedCTC=ctc-variable;
  const basic=Math.round(fixedCTC*bpct/100);
  const monthlyGross=Math.round(fixedCTC/12);
  const inHand=Math.round(monthlyGross*0.85);
  const rows=[
   ['Annual CTC','',inr(ctc)],
   ['Fixed CTC','',(100-vpct)+'% → '+inr(fixedCTC)],
   ['Variable / performance pay','',vpct+'% → '+inr(variable)],
   ['Monthly basic','',inr(basic)],
   ['Monthly gross (fixed)','',inr(monthlyGross)],
   ['Monthly in-hand (est.)','',inr(inHand)],
   ['Joining bonus',jb>0?inr(jb):'—',''],
   ['Notice period','',nd+' calendar days'],
   ['Probation period','',prob+' months']];
  return{rows,k1:inr(fixedCTC)+'/yr',k2:inr(inHand)+'/mo',k3:inr(variable)+'/yr'};}`});

/* 13. Employee Attrition Cost Calculator */
push({id:'employee-attrition-calculator',name:'Employee Attrition Cost Calculator',
 short:'True cost of employee attrition and turnover.',
 intro:'Calculate the true financial cost of employee attrition including notice pay, recruitment, onboarding, productivity loss and knowledge transfer costs.',
 seo:{title:'Employee Attrition Cost Calculator — Turnover Cost India | Varada Nexus',description:'Free employee attrition calculator. Calculate true cost of employee turnover including recruitment, onboarding, productivity loss and knowledge transfer.',keywords:['employee attrition cost calculator','staff turnover cost calculator','employee retention roi india']},
 inputs:[
  {id:'annual_ctc',label:'Departing employee annual CTC (₹)',type:'number',default:700000,min:1},
  {id:'notice_buyout',label:'Notice buy-out / garden leave cost (₹)',type:'number',default:0,min:0},
  {id:'recruitment_cost',label:'Recruitment cost for replacement (₹)',type:'number',default:70000,min:0},
  {id:'onboarding_months',label:'Onboarding & ramp-up time (months)',type:'number',default:3,min:1,max:12},
  {id:'productivity_pct',label:'Productivity during ramp-up (%)',type:'number',default:50,min:0,max:100},
  {id:'knowledge_loss',label:'Knowledge transfer / documentation cost (₹)',type:'number',default:15000,min:0}],
 results:{rowFmt:'raw',columns:['Cost Component','','Amount (₹)'],kpis:[{key:'k1',label:'Total attrition cost',format:'text'},{key:'k2',label:'Attrition cost as % of CTC',format:'text'},{key:'k3',label:'Productivity loss cost',format:'text'}]},
 assumptions:'Monthly CTC = annual ÷ 12. Productivity loss = monthly CTC × ramp-up months × (1 − productivity%). Total includes recruitment + productivity loss + knowledge transfer + notice cost.',
 faq:[
  {q:'What is the average cost of employee attrition?',a:'Industry research suggests the cost of attrition is 50–200% of annual salary depending on role seniority. Specialised roles (tech, healthcare) are at the higher end.'},
  {q:'How do I reduce employee attrition?',a:'Key levers: competitive compensation, career development paths, flexible working, strong manager relationships, recognition programmes and regular stay interviews.'},
  {q:'What is the attrition rate formula?',a:'Attrition rate = (employees who left ÷ average employees) × 100. Healthy attrition in India is 10–15% for most industries; IT sector average is 20–25%.'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const ctc=+v.annual_ctc||700000,buyout=+v.notice_buyout||0,rec=+v.recruitment_cost||70000,ramp=+v.onboarding_months||3,prod=+v.productivity_pct||50,kl=+v.knowledge_loss||15000;
  const monthlyCTC=ctc/12;
  const prodLoss=Math.round(monthlyCTC*ramp*(1-prod/100));
  const total=buyout+rec+prodLoss+kl;
  const pctCTC=Math.round(total/ctc*100);
  const rows=[
   ['Notice buy-out','',inr(buyout)],
   ['Recruitment cost','',inr(rec)],
   ['Productivity loss ('+ramp+' months × '+(100-prod)+'% loss)','',inr(prodLoss)],
   ['Knowledge transfer','',inr(kl)],
   ['Total attrition cost','',inr(total)],
   ['As % of annual CTC','',pctCTC+'%']];
  return{rows,k1:inr(total),k2:pctCTC+'%',k3:inr(prodLoss)};}`});

/* 14. Training Cost Calculator */
push({id:'training-cost-calculator',name:'Training Cost & ROI Calculator',
 short:'Training cost per employee and learning ROI.',
 intro:'Calculate the total cost of employee training programmes and the return on investment from improved productivity and reduced errors.',
 seo:{title:'Training Cost & ROI Calculator — L&D Investment India | Varada Nexus',description:'Free training ROI calculator. Calculate total training cost per employee and return on investment from productivity gains and error reduction.',keywords:['training cost calculator','learning and development roi','training roi calculator india']},
 inputs:[
  {id:'participants',label:'Number of participants',type:'number',default:20,min:1},
  {id:'trainer_cost',label:'Trainer / content cost (₹)',type:'number',default:50000,min:0},
  {id:'venue_materials',label:'Venue, materials, catering (₹)',type:'number',default:30000,min:0},
  {id:'participant_daily_cost',label:'Participant salary cost/day (₹)',type:'number',default:1500,min:0},
  {id:'training_days',label:'Training duration (days)',type:'number',default:2,min:0.5},
  {id:'productivity_gain_pct',label:'Expected productivity gain (%)',type:'number',default:15,min:0},
  {id:'avg_annual_salary',label:'Average participant annual salary (₹)',type:'number',default:400000,min:1}],
 results:{rowFmt:'raw',columns:['Component','','Value'],kpis:[{key:'k1',label:'Cost per participant',format:'text'},{key:'k2',label:'Training ROI',format:'text'},{key:'k3',label:'Total training cost',format:'text'}]},
 assumptions:'Lost productivity = participants × days × daily salary cost. Annual productivity gain = participants × annual salary × productivity gain %. ROI = (gain − cost) ÷ cost × 100.',
 faq:[
  {q:'What is a good training ROI?',a:'Industry benchmark ROI for effective training programmes is 150–300%. Even a 10% productivity improvement on a ₹400,000 salary gives ₹40,000/year — often exceeding training cost.'},
  {q:'How do I measure training effectiveness?',a:'Use Kirkpatrick\'s 4 levels: Reaction (participant feedback), Learning (pre/post assessment), Behaviour (manager observation 30–90 days later), Results (KPI improvement).'},
  {q:'What is the average training spend per employee in India?',a:'Average L&D spend in India is ₹15,000–40,000 per employee per year. Technology companies and multinationals tend to invest significantly more.'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const n=+v.participants||20,trainer=+v.trainer_cost||50000,venue=+v.venue_materials||30000,daily=+v.participant_daily_cost||1500,days=+v.training_days||2,pg=+v.productivity_gain_pct||15,salary=+v.avg_annual_salary||400000;
  const lostProd=Math.round(n*days*daily);
  const totalCost=trainer+venue+lostProd;
  const cpp=Math.round(totalCost/n);
  const annualGain=Math.round(n*salary*pg/100);
  const roi=Math.round((annualGain-totalCost)/totalCost*100);
  const rows=[
   ['Trainer / content cost',inr(trainer),''],
   ['Venue, materials, catering',inr(venue),''],
   ['Lost productivity ('+n+'×'+days+'d×daily)',inr(lostProd),''],
   ['Total training cost',inr(totalCost),''],
   ['Cost per participant',inr(cpp),''],
   ['Annual productivity gain (est.)',inr(annualGain),''],
   ['Training ROI','',roi+'%']];
  return{rows,k1:inr(cpp),k2:roi+'%',k3:inr(totalCost)};}`});

/* 15. Performance Score Calculator */
push({id:'performance-score-calculator',name:'Employee Performance Score Calculator',
 short:'Weighted performance rating across KRA areas.',
 intro:'Calculate a weighted employee performance score from Key Result Areas (KRAs) with manager and self-assessment inputs for annual appraisals.',
 seo:{title:'Employee Performance Score Calculator — KRA Appraisal Tool | Varada Nexus',description:'Free performance score calculator. Calculate weighted KRA-based employee performance score for annual appraisals and salary reviews.',keywords:['employee performance score calculator','kra appraisal calculator','performance rating calculator india']},
 inputs:[
  {id:'kra1',label:'KRA 1: Goal achievement (1–5)',type:'number',default:4,min:1,max:5},
  {id:'kra1w',label:'KRA 1 weight (%)',type:'number',default:40,min:0,max:100},
  {id:'kra2',label:'KRA 2: Quality of work (1–5)',type:'number',default:3,min:1,max:5},
  {id:'kra2w',label:'KRA 2 weight (%)',type:'number',default:25,min:0,max:100},
  {id:'kra3',label:'KRA 3: Teamwork & collaboration (1–5)',type:'number',default:4,min:1,max:5},
  {id:'kra3w',label:'KRA 3 weight (%)',type:'number',default:20,min:0,max:100},
  {id:'kra4',label:'KRA 4: Learning & development (1–5)',type:'number',default:3,min:1,max:5},
  {id:'kra4w',label:'KRA 4 weight (%)',type:'number',default:15,min:0,max:100}],
 results:{rowFmt:'raw',columns:['KRA','Score','Weighted'],kpis:[{key:'k1',label:'Overall performance score',format:'text'},{key:'k2',label:'Performance band',format:'text'},{key:'k3',label:'Recommended hike range',format:'text'}]},
 assumptions:'Weighted score = Σ (KRA score × weight%). Weights should total 100%. Bands: 4.5–5 = Outstanding; 4.0–4.4 = Exceeds Expectations; 3.0–3.9 = Meets Expectations; 2.0–2.9 = Below Expectations; <2 = Unsatisfactory.',
 faq:[
  {q:'What are KRAs?',a:'Key Result Areas (KRAs) are the primary responsibilities and objectives for a role. Performance against KRAs is the basis for annual appraisals, promotions and salary hikes.'},
  {q:'What is a good performance rating?',a:'A score of 3.5/5 or above typically qualifies for a salary hike. Scores above 4.0 warrant above-average hikes and fast-track promotion consideration.'},
  {q:'How should performance appraisal weights be set?',a:'Weights should reflect the strategic importance of each KRA for the role. Typically 40–50% for core deliverables, 20–30% for quality, 15–25% for behavioural competencies.'}],
 logic:`const BANDS=[[4.5,'Outstanding — Top performer'],[4.0,'Exceeds Expectations'],[3.0,'Meets Expectations'],[2.0,'Below Expectations'],[0,'Unsatisfactory']];
const HIKES=[[4.5,'15–25%'],[4.0,'12–18%'],[3.0,'8–12%'],[2.0,'0–5%'],[0,'0% / PIP']];
export function compute(v){
  const kras=[{l:'Goal achievement',s:+v.kra1||1,w:+v.kra1w||40},{l:'Quality of work',s:+v.kra2||1,w:+v.kra2w||25},{l:'Teamwork',s:+v.kra3||1,w:+v.kra3w||20},{l:'Learning & development',s:+v.kra4||1,w:+v.kra4w||15}];
  const totalW=kras.reduce((a,k)=>a+k.w,0)||100;
  const weighted=kras.reduce((a,k)=>a+k.s*k.w/totalW,0);
  const score=Math.round(weighted*100)/100;
  const band=BANDS.find(([t])=>score>=t)[1];
  const hike=HIKES.find(([t])=>score>=t)[1];
  const rows=kras.map(k=>[k.l+' ('+k.w+'%)',k.s+'/5',Math.round(k.s*k.w/totalW*100)/100+' pts']);
  rows.push(['TOTAL (weighted avg)','',score+'/5']);
  return{rows,k1:score+'/5',k2:band,k3:hike};}`});

/* 16. PR Campaign Planner */
push({id:'pr-campaign-planner',name:'PR Campaign Budget Planner',
 short:'PR campaign cost estimator across media channels.',
 intro:'Plan and estimate your public relations campaign budget across press releases, media outreach, events, influencers and digital PR.',
 seo:{title:'PR Campaign Budget Planner — Public Relations Cost Calculator | Varada Nexus',description:'Free PR campaign planner. Estimate public relations budget across press releases, media outreach, events, influencer PR and digital PR for any campaign.',keywords:['pr campaign budget planner','public relations cost calculator','pr agency budget india']},
 inputs:[
  {id:'press_releases',label:'Press releases to issue',type:'number',default:4,min:0},
  {id:'pr_release_cost',label:'Cost per press release (₹)',type:'number',default:15000,min:0},
  {id:'media_outreach',label:'Media outreach contacts to target',type:'number',default:50,min:0},
  {id:'outreach_cost_per',label:'Outreach cost per contact (₹)',type:'number',default:500,min:0},
  {id:'event_cost',label:'PR event / press conference cost (₹)',type:'number',default:100000,min:0},
  {id:'influencer_cost',label:'Influencer / blogger outreach budget (₹)',type:'number',default:50000,min:0},
  {id:'pr_agency',label:'PR agency monthly retainer (₹)',type:'number',default:75000,min:0},
  {id:'months',label:'Campaign duration (months)',type:'number',default:3,min:1,max:12}],
 results:{rowFmt:'raw',columns:['Component','','Cost (₹)'],kpis:[{key:'k1',label:'Total campaign cost',format:'text'},{key:'k2',label:'Monthly PR cost',format:'text'},{key:'k3',label:'Agency retainer total',format:'text'}]},
 assumptions:'Agency retainer multiplied by campaign duration. Press release, media outreach and influencer costs are total campaign costs.',
 faq:[
  {q:'What does a PR campaign cost in India?',a:'A basic PR retainer in India starts at ₹50,000–1,00,000/month for small agencies. Mid-tier firms charge ₹1,50,000–3,00,000/month. For specific campaigns, budget ₹2–10 lakh total.'},
  {q:'What is included in a PR agency retainer?',a:'A retainer typically covers: media relations, press release writing and distribution, journalist pitching, social media monitoring, crisis communications support and monthly reporting.'},
  {q:'How do I measure PR campaign success?',a:'Key PR metrics: media coverage (clips), share of voice vs competitors, message pull-through rate, website traffic from PR, social shares and sentiment. Assign AVE (advertising value equivalent) for budget comparison.'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const pr=+v.press_releases||0,prc=+v.pr_release_cost||0,mo=+v.media_outreach||0,moc=+v.outreach_cost_per||0,ev=+v.event_cost||0,inf=+v.influencer_cost||0,agency=+v.pr_agency||0,months=+v.months||3;
  const pressCost=pr*prc,outreachCost=mo*moc,agencyTotal=agency*months;
  const total=pressCost+outreachCost+ev+inf+agencyTotal;
  const monthly=Math.round(total/months);
  const rows=[['Press releases ('+pr+')',inr(pressCost),''],['Media outreach ('+mo+' contacts)',inr(outreachCost),''],['PR event / press conference',inr(ev),''],['Influencer / blogger outreach',inr(inf),''],['PR agency retainer ('+months+' months)',inr(agencyTotal),''],['TOTAL CAMPAIGN BUDGET',inr(total),'']];
  return{rows,k1:inr(total),k2:inr(monthly)+'/mo',k3:inr(agencyTotal)};}`});

/* 17. HR KPI Dashboard */
push({id:'hr-kpi-dashboard',name:'HR KPI Dashboard Calculator',
 short:'Key HR metrics: attrition, CPH, absenteeism and productivity.',
 intro:'Calculate your organisation\'s key HR metrics — attrition rate, cost per hire, absenteeism rate, revenue per employee and training hours per FTE.',
 seo:{title:'HR KPI Dashboard — Key HR Metrics Calculator India | Varada Nexus',description:'Free HR KPI calculator. Compute attrition rate, cost per hire, absenteeism, revenue per employee and training hours for HR dashboards and reporting.',keywords:['hr kpi calculator','hr metrics dashboard','attrition rate calculator india']},
 inputs:[
  {id:'headcount',label:'Total headcount (FTEs)',type:'number',default:100,min:1},
  {id:'resigned',label:'Employees resigned in 12 months',type:'number',default:15,min:0},
  {id:'new_hires',label:'New hires in 12 months',type:'number',default:20,min:0},
  {id:'total_rec_cost',label:'Total recruitment cost (₹)',type:'number',default:1000000,min:0},
  {id:'absent_days',label:'Total absent days (all employees, month)',type:'number',default:80,min:0},
  {id:'annual_revenue',label:'Annual company revenue (₹)',type:'number',default:50000000,min:1},
  {id:'training_hrs',label:'Total training hours delivered (year)',type:'number',default:500,min:0}],
 results:{rowFmt:'raw',columns:['KPI','Value','Benchmark'],kpis:[{key:'k1',label:'Attrition rate',format:'text'},{key:'k2',label:'Cost per hire',format:'text'},{key:'k3',label:'Revenue per employee',format:'text'}]},
 assumptions:'Attrition = resigned ÷ avg headcount × 100. Absenteeism = absent days ÷ (headcount × working days) × 100. CPH = total recruitment cost ÷ new hires. Revenue per employee = revenue ÷ headcount.',
 faq:[
  {q:'What is a healthy attrition rate?',a:'10–15% annual attrition is generally considered healthy for most industries in India. IT sector averages 20–25%. Below 5% may indicate lack of growth opportunities.'},
  {q:'What is a good absenteeism rate?',a:'Absenteeism below 1.5% per month (18% per year) is generally acceptable. Above 2% warrants investigation into employee wellness, engagement or management issues.'},
  {q:'How do I improve revenue per employee?',a:'Revenue per employee improves through automation, upskilling, better sales processes and reducing headcount in low-value activities. Benchmark varies widely by industry.'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const hc=+v.headcount||100,res=+v.resigned||0,nh=+v.new_hires||0,rc=+v.total_rec_cost||0,ab=+v.absent_days||0,rev=+v.annual_revenue||50000000,thr=+v.training_hrs||0;
  const attrition=Math.round(res/hc*100*10)/10;
  const cph=nh>0?Math.round(rc/nh):0;
  const absentPct=Math.round(ab/(hc*26)*100*10)/10;
  const revPerEmp=Math.round(rev/hc);
  const tphFTE=Math.round(thr/hc*10)/10;
  const rows=[
   ['Attrition rate',attrition+'%','Benchmark: 10–15%'],
   ['Cost per hire (CPH)',inr(cph),'₹20K–1L depending on role'],
   ['Absenteeism rate',absentPct+'%','Target: <1.5%/month'],
   ['Revenue per employee',inr(revPerEmp)+'/yr','Varies by industry'],
   ['Training hrs per FTE',tphFTE+' hrs/yr','Benchmark: 25–40 hrs'],
   ['Headcount',hc,'New hires: '+nh]];
  return{rows,k1:attrition+'%',k2:inr(cph),k3:inr(revPerEmp)+'/yr'};}`});

/* 18. Shift Planner */
push({id:'shift-planner',name:'Shift & Roster Cost Planner',
 short:'Weekly shift roster labour cost for shift-based teams.',
 intro:'Calculate weekly and monthly labour cost for shift-based operations — factory, retail, hospital or hospitality — with different shift types and headcount.',
 seo:{title:'Shift Planner — Roster Labour Cost Calculator | Varada Nexus',description:'Free shift planner calculator. Calculate weekly and monthly roster labour cost for factory, hospital, retail or hospitality shift operations.',keywords:['shift planner calculator','roster labour cost calculator','shift roster cost india']},
 inputs:[
  {id:'day_shifts',label:'Day shift workers',type:'number',default:10,min:0},
  {id:'day_rate',label:'Day shift daily wage (₹)',type:'number',default:800,min:0},
  {id:'eve_shifts',label:'Evening / afternoon shift workers',type:'number',default:8,min:0},
  {id:'eve_rate',label:'Evening shift daily wage (₹)',type:'number',default:900,min:0},
  {id:'night_shifts',label:'Night shift workers',type:'number',default:6,min:0},
  {id:'night_rate',label:'Night shift daily wage (₹)',type:'number',default:1050,min:0},
  {id:'days_per_week',label:'Operating days per week',type:'number',default:6,min:1,max:7}],
 results:{rowFmt:'raw',columns:['Shift','Workers','Weekly Cost'],kpis:[{key:'k1',label:'Weekly labour cost',format:'text'},{key:'k2',label:'Monthly labour cost',format:'text'},{key:'k3',label:'Total shift workers',format:'text'}]},
 assumptions:'Weekly cost = workers × daily wage × days/week. Monthly = weekly × 4.33. Night shift allowance (higher rate) assumed included in night shift daily wage.',
 faq:[
  {q:'Is there a mandatory night shift allowance in India?',a:'There is no universal statutory night shift allowance in India. However, many state-specific Shops & Establishments Acts and some sectoral regulations (like certain factory settlements) prescribe extra pay for night work.'},
  {q:'How many hours is a shift in India?',a:'Standard shift is 8 hours. Factories Act limits to 10.5 hours/day including overtime. Double shifts (16 hours) are prohibited. Shifts typically start at 6am, 2pm and 10pm.'},
  {q:'What is the minimum wage for factory workers in India?',a:'Minimum wages vary by state and skill category. As of 2024, unskilled daily wages range from ₹400–700/day (state-wise). Always check the latest state government notification.'}],
 logic:`const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const dw=+v.day_shifts||0,dr=+v.day_rate||0,ew=+v.eve_shifts||0,er=+v.eve_rate||0,nw=+v.night_shifts||0,nr=+v.night_rate||0,dpw=+v.days_per_week||6;
  const dayWeekly=dw*dr*dpw,eveWeekly=ew*er*dpw,nightWeekly=nw*nr*dpw;
  const total=dayWeekly+eveWeekly+nightWeekly;
  const monthly=Math.round(total*4.33);
  const workers=dw+ew+nw;
  const rows=[['Day shift',dw+' workers',inr(dayWeekly)],['Evening / afternoon shift',ew+' workers',inr(eveWeekly)],['Night shift',nw+' workers',inr(nightWeekly)],['TOTAL',workers+' workers',inr(total)+'/week']];
  return{rows,k1:inr(total)+'/week',k2:inr(monthly)+'/month',k3:workers+' workers'};}`});

const n=writeTools(T);
console.log('HR & PR tools written:',n);
;
