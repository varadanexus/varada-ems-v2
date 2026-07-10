export function compute(v){
  const wc=+v.word_count||1200,k1=+v.kw1_count||0,k2=+v.kw2_count||0,k3=+v.kw3_count||0;
  const d1=wc>0?k1/wc*100:0,d2=wc>0?k2/wc*100:0,d3=wc>0?k3/wc*100:0;
  const fmt=n=>(Math.round(n*100)/100)+'%';
  const assess=d1<0.3?'⚠️ Too low — add more':d1>2.0?'🔴 Too high — risk of stuffing':d1>=0.5&&d1<=1.5?'✅ Optimal range':'🟡 Acceptable';
  const total=k1+k2+k3;
  const totalDensity=wc>0?total/wc*100:0;
  const rows=[['Primary keyword',k1,fmt(d1)+' — '+assess],['Secondary keyword',k2,fmt(d2)],['LSI / related',k3,fmt(d3)],['Total keywords',total,fmt(totalDensity)+' of content'],['Word count',wc,'—']];
  return{rows,k1:fmt(d1),k2:assess,k3:fmt(totalDensity)};}
