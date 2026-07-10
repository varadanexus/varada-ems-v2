const MAT={ceramic:55,vitrified:100,marble:250,granite:180,laminate:120,engineered:220,vinyl:90};
const LAB={ceramic:30,vitrified:35,marble:55,granite:50,laminate:40,engineered:45,vinyl:25};
const GM={economy:0.75,standard:1.0,premium:1.5};
const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const a=+v.area||500,mat=v.material||'vitrified',grade=v.grade||'standard',waste=+v.wastage||10;
  const gm=GM[grade]||1;
  const matRate=(MAT[mat]||100)*gm;
  const labRate=(LAB[mat]||35);
  const orderArea=Math.ceil(a*(1+waste/100));
  const matCost=orderArea*matRate;
  const labCost=a*labRate;
  const total=matCost+labCost;
  const rows=[['Floor area','',a+' sq ft'],['Material to order (incl. '+waste+'% waste)','',orderArea+' sq ft'],['Material cost ('+inr(matRate)+'/sq ft)','',inr(matCost)],['Installation labour','',inr(labCost)],['Total','',inr(total)]];
  return{rows,k1:inr(total),k2:inr(Math.round(total/a))+'/sq ft',k3:orderArea+' sq ft'};}
