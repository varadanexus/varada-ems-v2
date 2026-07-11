const inr=n=>'₹'+n;
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
  return{rows,k1:'~Month '+(total+start-1),k2:total+' months',k3:inr(P.fee)};}
