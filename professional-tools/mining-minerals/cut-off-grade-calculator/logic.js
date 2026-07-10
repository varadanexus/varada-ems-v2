const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const mc=+v.mining_cost_mt||500,pc=+v.processing_cost_mt||200;
  const gc=+v.overhead_cost_mt||100,roy=+v.royalty_mt||150;
  const price=+v.product_price||4500,rec=+v.recovery_pct||88,margin=+v.target_margin_pct||0;
  const totalCost=mc+pc+gc+roy;
  const requiredRevenue=totalCost*(1+margin/100);
  const breakEvenGrade=Math.round(requiredRevenue/(price*rec/100)*1000)/10;
  const breakEvenGradeMargin=Math.round(requiredRevenue*(1+margin/100)/(price*rec/100)*1000)/10;
  const revAtBE=Math.round(breakEvenGrade/100*rec/100*price);
  return{
    rows:[
      ['Mining Cost',inr(mc)+'/MT ore',''],
      ['Processing Cost',inr(pc)+'/MT ore',''],
      ['Overhead / G&A',inr(gc)+'/MT ore',''],
      ['Royalty & Levies',inr(roy)+'/MT ore',''],
      ['Total Cost',inr(totalCost)+'/MT ore',''],
      ['Product Price',inr(price)+'/MT product',''],
      ['Recovery',rec+'%',''],
      ['Break-even Grade','Total cost / (price × rec)',breakEvenGrade+'%'],
      ['Grade with '+margin+'% Margin','',breakEvenGradeMargin+'%']],
    k1:breakEvenGrade+'%',k2:breakEvenGradeMargin+'%',k3:inr(revAtBE)+'/MT ore at BE grade'};
}
