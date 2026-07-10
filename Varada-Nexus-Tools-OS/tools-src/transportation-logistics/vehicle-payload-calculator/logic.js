const GVW={lmv:3500,7:7000,12:12000,25:25000,40:40000};
const KT={'lmv':3500,'7t':7000,'12t':12000,'25t':25000,'40t':40000};
export function compute(v){
  const vtype=v.vehicle_type||'12t',tare=+v.tare_weight||8500,cargo=+v.cargo_weight||0,fw=+v.fuel_water||500;
  const gvwLimit=KT[vtype]||12000;
  const legalPayload=Math.max(0,gvwLimit-tare-fw);
  const actualGVW=tare+cargo+fw;
  const overload=Math.max(0,actualGVW-gvwLimit);
  const status=overload>0?'⚠️ OVERLOADED':'✅ Within limit';
  const rows=[
   ['GVW limit',gvwLimit+'kg','—'],
   ['Tare / unladen weight','—',tare+'kg'],
   ['Fuel + water + driver','—',fw+'kg'],
   ['Cargo','—',cargo+'kg'],
   ['Actual GVW','—',actualGVW+'kg'],
   ['Legal payload',legalPayload+'kg','—'],
   ['Overloading',overload>0?overload+'kg OVER':'—','']];
  return{rows,k1:status,k2:overload>0?overload+'kg':'None ✅',k3:legalPayload+'kg'};}
