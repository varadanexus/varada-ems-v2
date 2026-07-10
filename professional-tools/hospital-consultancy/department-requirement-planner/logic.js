const c=Math.ceil;
const DEPTS_GEN=[['Internal Medicine',30],['Surgery',25],['Obstetrics & Gynaecology',15],['Paediatrics',12],['Orthopaedics',10],['Emergency / Casualty',8]];
const DEPTS_MULTI=[['Internal Medicine',20],['Surgery',18],['Cardiology',10],['Orthopaedics',12],['Obstetrics & Gynaecology',12],['Neurology',8],['Oncology',8],['Paediatrics',7],['ENT / Ophthalmology',5]];
const DEPTS_SUPER=[['Cardiology / CTVS',20],['Neurology / Neurosurgery',18],['Oncology',15],['Orthopaedics',12],['Nephrology / Urology',10],['Gastroenterology',10],['Internal Medicine',8],['Paediatrics',7]];
export function compute(v){
  const b=+v.beds||150,opd=+v.opd_daily||300,t=v.type||'multi';
  const depts=t==='super'?DEPTS_SUPER:t==='general'?DEPTS_GEN:DEPTS_MULTI;
  const totalPct=depts.reduce((s,d)=>s+d[1],0);
  const opdRoomsTotal=c(opd*12/480/0.8);
  const rows=depts.map(([name,pct])=>{
    const ipd=c(b*pct/totalPct);
    const rooms=c(opdRoomsTotal*pct/totalPct);
    return[name,rooms+' rooms',ipd+' beds'];
  });
  const ot=c(b*0.6/35);
  const icu=c(b*0.10);
  return{rows,k1:opdRoomsTotal+' rooms',k2:ot+' tables',k3:icu+' beds'};}
