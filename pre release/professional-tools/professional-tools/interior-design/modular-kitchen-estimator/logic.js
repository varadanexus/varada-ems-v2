const CAB={hdf:1500,plywood:2200,pvc:1800,solid:4200};
const SHUT={laminate:0,acrylic:300,membrane:200,glass:400};
const CTOP={granite:200,quartz:400,ss:300};
const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const lf=+v.linear_ft||20,mat=v.material||'plywood',shut=v.shutter||'acrylic',ct=v.countertop||'granite';
  const ratePerLf=(CAB[mat]||2200)+(SHUT[shut]||300);
  const cabCost=lf*ratePerLf;
  const ctArea=lf*2;
  const ctCost=ctArea*(CTOP[ct]||200);
  const hardware=cabCost*0.15;
  const total=cabCost+ctCost+hardware;
  const rows=[['Carcass & shutters ('+lf+' L ft)','',inr(cabCost)],['Countertop (~'+ctArea+' sq ft)','',inr(ctCost)],['Handles, hinges & hardware','~15%',inr(Math.round(hardware))],['Total','',inr(Math.round(total))]];
  return{rows,k1:inr(Math.round(total)),k2:inr(Math.round(total/lf))+'/L ft',k3:inr(ctCost)};}
