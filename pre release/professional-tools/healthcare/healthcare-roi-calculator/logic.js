const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){const i=+v.investment||1,p=+v.profit||0,roi=i>0?p/i*100:0,pb=p>0?i/p:0;
 const rows=[['Annual ROI','',(Math.round(roi*10)/10)+'%'],['Payback period','',p>0?(Math.round(pb*10)/10)+' years':'—'],['5-year net return','',inr(p*5-i)]];
 return{rows,k1:(Math.round(roi*10)/10)+'%',k2:p>0?(Math.round(pb*10)/10)+' yr':'—',k3:inr(p*5)};}
