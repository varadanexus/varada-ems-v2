const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const et=v.equipment_type||'excavator',shift=+v.shift_hours||8;
  const avail=+v.availability_pct||80,util=+v.utilisation_pct||75;
  const cycle=+v.cycle_time_min||3.5,payload=+v.payload_or_bucket||10,ff=+v.fill_factor||90;
  const effHours=Math.round(shift*avail/100*util/100*100)/100;
  const cyclesPerShift=Math.round(effHours*60/cycle);
  const effectivePayload=payload*ff/100;
  const prodPerShift=Math.round(cyclesPerShift*effectivePayload);
  const oee=Math.round(avail*util/10000*1000)/10;
  const typeLabel={excavator:'Excavator',dumper:'Dump Truck',drill:'Drill Rig'};
  const unit=et==='drill'?'m drilled':'MT';
  return{
    rows:[
      ['Equipment',typeLabel[et]||et,''],
      ['Shift Hours',shift+' hrs',''],
      ['Mechanical Availability',avail+'%',''],
      ['Operational Utilisation',util+'%',''],
      ['Effective Working Hours',shift+' × '+avail+'% × '+util+'%',effHours+' hrs'],
      ['Cycle Time',cycle+' min',''],
      ['Cycles per Shift','',cyclesPerShift],
      ['Effective Payload',payload+' × '+ff+'%',effectivePayload.toFixed(1)+' MT'],
      ['OEE',avail+'% × '+util+'%',oee+'%'],
      ['Production per Shift','',prodPerShift+' '+unit]],
    k1:prodPerShift+' '+unit,k2:effHours+' hrs',k3:cyclesPerShift+' cycles'};
}
