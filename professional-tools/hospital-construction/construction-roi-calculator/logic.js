const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){const c=+v.cost||1,i=+v.income||0,roi=c>0?i/c*100:0,pb=i>0?c/i:0;
 const rows=[['Annual ROI','',(Math.round(roi*10)/10)+'%'],['Payback period','',i>0?(Math.round(pb*10)/10)+' years':'—'],['10-year income','',inr(i*10)]];
 return{rows,k1:(Math.round(roi*10)/10)+'%',k2:i>0?(Math.round(pb*10)/10)+' yr':'—',k3:inr(i*10)};}
