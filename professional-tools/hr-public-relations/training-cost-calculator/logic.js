const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
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
  return{rows,k1:inr(cpp),k2:roi+'%',k3:inr(totalCost)};}
