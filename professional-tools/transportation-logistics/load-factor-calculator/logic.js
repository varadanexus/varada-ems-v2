const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const cap=+v.capacity||10,out=+v.actual_load||7,ret=+v.return_load||3,rate=+v.freight_rate||2000,trips=+v.trips_month||20;
  const lfOut=Math.round(out/cap*100);
  const lfRet=Math.round(ret/cap*100);
  const avgLF=Math.round((lfOut+lfRet)/2);
  const outRev=out*rate*trips,retRev=ret*rate*trips;
  const optimalRev=cap*rate*trips*2;
  const revLoss=Math.round(optimalRev-outRev-retRev);
  const rows=[
   ['Capacity',cap+' t',cap+' t'],
   ['Actual load',out+' t',ret+' t'],
   ['Load factor',lfOut+'%',lfRet+'%'],
   ['Revenue at current load',inr(outRev),inr(retRev)],
   ['Revenue at full load',inr(cap*rate*trips),inr(cap*rate*trips)],
   ['Revenue loss',inr(Math.round(cap*rate*trips-outRev)),inr(Math.round(cap*rate*trips-retRev))]];
  return{rows,k1:avgLF+'%',k2:inr(revLoss)+'/mo',k3:inr(optimalRev)+'/mo'};}
