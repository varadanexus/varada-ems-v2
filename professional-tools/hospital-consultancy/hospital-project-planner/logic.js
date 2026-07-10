const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
const RATES={general:{civil:4000000,eq:0.38,dur:[6,3,18,4]},multi:{civil:6500000,eq:0.40,dur:[8,4,22,6]},super:{civil:11000000,eq:0.42,dur:[10,6,28,8]}};
export function compute(v){
  const b=+v.beds||100,t=v.type||'multi',land=v.land||'owned';
  const R=RATES[t]||RATES.multi;
  const civil=b*R.civil,eq=civil*R.eq,total=civil+eq;
  const [dpr,lic,const_,comm]=R.dur;
  const landAdj=land==='search'?3:0;
  const totalMo=landAdj+dpr+lic+const_+comm;
  const rows=[
   [land==='search'?'Land finalisation':'(Land owned)','~'+landAdj+' months','—'],
   ['DPR & design','~'+dpr+' months','₹5–8L (fees)'],
   ['Licences & approvals','~'+lic+' months','₹2–5L (fees)'],
   ['Construction & civil','~'+const_+' months',inr(civil)],
   ['Equipment & IT fit-out','~'+comm+' months',inr(eq)],
   ['Total project','~'+totalMo+' months',inr(total)]];
  return{rows,k1:'~'+totalMo+' months',k2:inr(total),k3:inr(civil)};}
