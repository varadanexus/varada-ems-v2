const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const cont=+v.containers||1,fdD=+v.free_days_demurrage||3,adP=+v.actual_days_port||0,dRate=+v.demurrage_rate||0,fdDet=+v.free_days_detention||7,adDet=+v.actual_days_detention||0,detRate=+v.detention_rate||0;
  const demDays=Math.max(0,adP-fdD),detDays=Math.max(0,adDet-fdDet);
  const demCharge=demDays*dRate*cont,detCharge=detDays*detRate*cont;
  const total=demCharge+detCharge;
  const rows=[['Demurrage',adP+' days at port / '+fdD+' free',demDays+' chargeable days'],['Demurrage charge',cont+' containers × '+demDays+' days × ₹'+dRate,inr(demCharge)],['Detention',adDet+' days out / '+fdDet+' free',detDays+' chargeable days'],['Detention charge',cont+' containers × '+detDays+' days × ₹'+detRate,inr(detCharge)],['TOTAL','',inr(total)]];
  return{rows,k1:inr(total),k2:inr(demCharge),k3:inr(detCharge)};}
