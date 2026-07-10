const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
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
}
