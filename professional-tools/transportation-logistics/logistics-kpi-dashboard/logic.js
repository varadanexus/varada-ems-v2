const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const tot=+v.total_orders||500,ot=+v.on_time||0,inf=+v.in_full||0,df=+v.damage_free||0,cost=+v.total_logistics_cost||0,ret=+v.returns||0;
  const otif=Math.round(Math.min(ot,inf)/tot*100*10)/10;
  const poi=Math.round((ot/tot)*(inf/tot)*(df/tot)*100*10)/10;
  const cpo=tot>0?Math.round(cost/tot):0;
  const returnRate=Math.round(ret/tot*100*10)/10;
  const rows=[
   ['Total orders',tot,'—'],
   ['On-time delivery rate',Math.round(ot/tot*100)+'%','Target: ≥95%'],
   ['In-full delivery rate',Math.round(inf/tot*100)+'%','Target: ≥98%'],
   ['Damage-free rate',Math.round(df/tot*100)+'%','Target: ≥99%'],
   ['OTIF rate',otif+'%','Target: ≥90%'],
   ['Perfect Order Index',poi+'%','Target: ≥85%'],
   ['Cost per order',inr(cpo),'Benchmark: varies'],
   ['Return rate',returnRate+'%','Target: <2%']];
  return{rows,k1:otif+'%',k2:poi+'%',k3:inr(cpo)+'/order'};}
