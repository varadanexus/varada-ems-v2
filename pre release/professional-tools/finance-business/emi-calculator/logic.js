const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const P=+v.principal||0, i=(+v.rate||0)/1200, n=+v.tenure||1;
  const emi = i>0 ? P*i*Math.pow(1+i,n)/(Math.pow(1+i,n)-1) : P/n;
  const total=emi*n, interest=total-P;
  const rows=[['Loan amount','',inr(P)],['Monthly EMI','x '+n+' months',inr(emi)],['Total interest','',inr(interest)],['Total payment','',inr(total)]];
  return {rows,k1:inr(emi),k2:inr(interest),k3:inr(total)};
}
