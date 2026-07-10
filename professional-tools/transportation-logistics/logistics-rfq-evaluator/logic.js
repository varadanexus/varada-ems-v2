export function compute(v){
  const v1r=+v.v1_rate||2500,v1t=+v.v1_transit||3,v1rel=+v.v1_reliability||8;
  const v2r=+v.v2_rate||2200,v2t=+v.v2_transit||4,v2rel=+v.v2_reliability||6;
  const wCost=(+v.weight_cost||50)/100,wTime=(+v.weight_time||30)/100,wRel=Math.max(0,1-wCost-wTime);
  const minRate=Math.min(v1r,v2r),maxRate=Math.max(v1r,v2r);
  const minTime=Math.min(v1t,v2t),maxTime=Math.max(v1t,v2t);
  const norm=(val,min,max,invert)=>max===min?100:invert?(max-val)/(max-min)*100:val/max*100;
  const v1CostScore=norm(v1r,minRate,maxRate,true),v2CostScore=norm(v2r,minRate,maxRate,true);
  const v1TimeScore=norm(v1t,minTime,maxTime,true),v2TimeScore=norm(v2t,minTime,maxTime,true);
  const v1RelScore=v1rel*10,v2RelScore=v2rel*10;
  const v1Total=Math.round(v1CostScore*wCost+v1TimeScore*wTime+v1RelScore*wRel);
  const v2Total=Math.round(v2CostScore*wCost+v2TimeScore*wTime+v2RelScore*wRel);
  const winner=v1Total>=v2Total?'Vendor A ✅':'Vendor B ✅';
  const rows=[['Freight rate','₹'+v1r+'/t','₹'+v2r+'/t'],['Transit time',v1t+' days',v2t+' days'],['Reliability score',v1rel+'/10',v2rel+'/10'],['Cost score ('+Math.round(wCost*100)+'%)',Math.round(v1CostScore),Math.round(v2CostScore)],['Time score ('+Math.round(wTime*100)+'%)',Math.round(v1TimeScore),Math.round(v2TimeScore)],['Reliability score ('+Math.round(wRel*100)+'%)',Math.round(v1RelScore),Math.round(v2RelScore)],['WEIGHTED TOTAL',v1Total,v2Total]];
  return{rows,k1:winner,k2:v1Total+'/100',k3:v2Total+'/100'};}
