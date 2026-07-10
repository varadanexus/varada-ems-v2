const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN')+' L';
const RATES={general:{staff:0.40,drugs:0.22,util:0.06,maint:0.04,admin:0.06,other:0.04},multi:{staff:0.42,drugs:0.23,util:0.065,maint:0.04,admin:0.065,other:0.04},super:{staff:0.45,drugs:0.25,util:0.07,maint:0.045,admin:0.07,other:0.045}};
export function compute(v){
  const rev=+v.revenue||2000,t=v.type||'multi';
  const R=RATES[t]||RATES.multi;
  const cats=[['Staffing & HR',R.staff],['Drugs & consumables',R.drugs],['Utilities',R.util],['Maintenance & AMC',R.maint],['Admin & marketing',R.admin],['Other overheads',R.other]];
  const totalPct=cats.reduce((s,[,p])=>s+p,0);
  const opex=rev*totalPct;
  const ebitda=rev-opex;
  const margin=ebitda/rev*100;
  const rows=cats.map(([n,p])=>[n,Math.round(p*100)+'%',inr(Math.round(rev*p))]);
  rows.push(['Total Opex',Math.round(totalPct*100)+'%',inr(Math.round(opex))]);
  return{rows,k1:inr(Math.round(opex)),k2:inr(Math.round(ebitda)),k3:Math.round(margin*10)/10+'%'};}
