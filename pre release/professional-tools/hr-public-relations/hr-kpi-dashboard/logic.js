const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
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
  return{rows,k1:attrition+'%',k2:inr(cph),k3:inr(revPerEmp)+'/yr'};}
