export function compute(v){const d=+v.duration||1,e=+v.elapsed||0,done=+v.done||0,planned=e/d*100,varn=done-planned;
 const status=varn>=5?'Ahead of schedule':varn<=-5?'Behind schedule':'On track';
 const proj=done>0?e/(done/100):d;
 const rows=[['Planned progress','elapsed/duration',(Math.round(planned))+'%'],['Actual progress','',done+'%'],['Variance','',(varn>=0?'+':'')+(Math.round(varn))+'%'],['Projected completion','',(Math.round(proj*10)/10)+' months']];
 return{rows,k1:status,k2:(varn>=0?'+':'')+Math.round(varn)+'%',k3:(Math.round(proj*10)/10)+' mo'};}
