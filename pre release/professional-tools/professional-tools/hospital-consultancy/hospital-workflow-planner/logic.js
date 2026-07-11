const BENCH={reg_time:5,wait_opd:15,consult_time:15,lab_tat:60,pharmacy_time:10,discharge_time:45};
const NAMES={reg_time:'Registration',wait_opd:'OPD wait',consult_time:'Consultation',lab_tat:'Lab TAT',pharmacy_time:'Pharmacy',discharge_time:'Discharge process'};
export function compute(v){
  const keys=Object.keys(NAMES);
  const rows=keys.map(k=>{
    const val=+v[k]||BENCH[k];
    const b=BENCH[k];
    const flag=val>b*1.3?'⚠️ Above target':val<=b?'✅ On target':'🟡 Near limit';
    return[NAMES[k],val+' min',flag];
  });
  const opdTotal=(+v.reg_time||5)+(+v.wait_opd||20)+(+v.consult_time||12)+(+v.pharmacy_time||10);
  const worst=keys.slice(0,5).reduce((a,k)=>((+v[k]||BENCH[k])/BENCH[k]>(+v[a]||BENCH[a])/BENCH[a])?k:a,keys[0]);
  return{rows,k1:opdTotal+' min',k2:NAMES[worst],k3:(+v.discharge_time||45)+' min'};}
