const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const wins=+v.windows||4,ww=+v.win_w||5,wh=+v.win_h||8;
  const full=+v.fullness||2,lined=v.lining==='yes',fp=+v.fabric_price||350;
  const fabricWidthFt=4.5;
  const panelsPerWin=2;
  const metresPerPanel=(ww/fabricWidthFt)*full*(wh/3.28);
  const totalMetres=Math.ceil(wins*panelsPerWin*metresPerPanel*1.05);
  const fabricCost=totalMetres*fp;
  const liningCost=lined?fabricCost*0.25:0;
  const stitching=totalMetres*150;
  const total=fabricCost+liningCost+stitching;
  const rows=[['Fabric required','',totalMetres+' metres'],['Fabric cost','',inr(fabricCost)],['Lining cost',lined?'incl.':'none',inr(liningCost)],['Stitching (~₹150/m)','',inr(stitching)],['Total','',inr(total)]];
  return{rows,k1:totalMetres+' m',k2:inr(total),k3:inr(Math.round(total/wins))};}
