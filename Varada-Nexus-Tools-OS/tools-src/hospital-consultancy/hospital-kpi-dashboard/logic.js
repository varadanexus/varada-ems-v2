export function compute(v){
  const b=+v.beds||1,adm=+v.admissions||1,pd=+v.days_occupied||1,days=+v.period||30;
  const alos=pd/adm;
  const bor=pd/(b*days)*100;
  const bto=adm/b;
  const toi=(b*days-pd)/adm;
  const fmt=n=>Math.round(n*10)/10;
  const rows=[
   ['ALOS','patient-days ÷ admissions',fmt(alos)+' days'],
   ['BOR','patient-days ÷ (beds × days)×100',fmt(bor)+'%'],
   ['BTO','admissions ÷ beds',fmt(bto)+' turns/month'],
   ['TOI','(avail. days − patient-days) ÷ admissions',fmt(toi)+' days'],
   ['Patient-days','',pd.toLocaleString('en-IN')],
   ['Admissions','',adm.toLocaleString('en-IN')]];
  return{rows,k1:fmt(alos)+' days',k2:fmt(bor)+'%',k3:fmt(bto)};}
