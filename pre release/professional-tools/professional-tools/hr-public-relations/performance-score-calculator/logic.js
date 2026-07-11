const BANDS=[[4.5,'Outstanding — Top performer'],[4.0,'Exceeds Expectations'],[3.0,'Meets Expectations'],[2.0,'Below Expectations'],[0,'Unsatisfactory']];
const HIKES=[[4.5,'15–25%'],[4.0,'12–18%'],[3.0,'8–12%'],[2.0,'0–5%'],[0,'0% / PIP']];
export function compute(v){
  const kras=[{l:'Goal achievement',s:+v.kra1||1,w:+v.kra1w||40},{l:'Quality of work',s:+v.kra2||1,w:+v.kra2w||25},{l:'Teamwork',s:+v.kra3||1,w:+v.kra3w||20},{l:'Learning & development',s:+v.kra4||1,w:+v.kra4w||15}];
  const totalW=kras.reduce((a,k)=>a+k.w,0)||100;
  const weighted=kras.reduce((a,k)=>a+k.s*k.w/totalW,0);
  const score=Math.round(weighted*100)/100;
  const band=BANDS.find(([t])=>score>=t)[1];
  const hike=HIKES.find(([t])=>score>=t)[1];
  const rows=kras.map(k=>[k.l+' ('+k.w+'%)',k.s+'/5',Math.round(k.s*k.w/totalW*100)/100+' pts']);
  rows.push(['TOTAL (weighted avg)','',score+'/5']);
  return{rows,k1:score+'/5',k2:band,k3:hike};}
