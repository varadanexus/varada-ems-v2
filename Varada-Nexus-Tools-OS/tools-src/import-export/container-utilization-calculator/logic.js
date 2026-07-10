const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
const CAP={
  '20ft':{cbm:25,kg:21700},
  '40ft':{cbm:55,kg:26500},
  '40hc':{cbm:67,kg:26500}};
export function compute(v){
  const ct=v.container_type||'40ft',cap=CAP[ct]||CAP['40ft'];
  const cbm=+v.cargo_cbm||40,wt=+v.cargo_weight||15000,fr=+v.freight_rate||120000;
  const vUtil=Math.round(cbm/cap.cbm*1000)/10;
  const wUtil=Math.round(wt/cap.kg*1000)/10;
  const perCbm=cbm>0?Math.round(fr/cbm):0;
  const status=vUtil>100||wUtil>100?'OVER LIMIT':vUtil>=85&&wUtil<=100?'Optimal':'Under-utilized';
  return{
    rows:[
      ['Volume (CBM)',cbm+' CBM',cap.cbm+' CBM'],
      ['Weight (kg)',Math.round(wt).toLocaleString('en-IN')+' kg',cap.kg.toLocaleString('en-IN')+' kg'],
      ['Volume Utilization',vUtil+'%','100% max'],
      ['Weight Utilization',wUtil+'%','100% max'],
      ['Status',status,'']],
    k1:vUtil+'%',k2:wUtil+'%',k3:inr(perCbm)+'/CBM'};
}
